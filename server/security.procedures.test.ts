import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const llmMocks = vi.hoisted(() => ({ listLLMModels: vi.fn(), invokeLLM: vi.fn() }));

const mocks = vi.hoisted(() => ({
  deleteNote: vi.fn(),
  recordAudit: vi.fn(),
  getNoteWithFiles: vi.fn(),
  replaceTeacherResource: vi.fn(),
  getPublishedResource: vi.fn(),
  listSubjects: vi.fn(),
  saveResource: vi.fn(),
  getAuthorizedChunks: vi.fn(),
  getNotesByIds: vi.fn(),
  getVisualsForNotes: vi.fn(),
  getConversationQuestions: vi.fn(),
  createConversation: vi.fn(),
  saveAiQuestion: vi.fn(),
  saveAnswerSources: vi.fn(),
  isUserInStudyGroup: vi.fn(),
  getAuthorizedChunksForGroup: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocks };
});

vi.mock("./_core/llm", () => llmMocks);

import { appRouter } from "./routers";

type Role = "student" | "teacher";

function contextFor(role: Role, id: number): TrpcContext {
  return {
    user: { id, openId: `security-${id}`, name: "Security Test", email: `${id}@example.com`, loginMethod: "test", role, teacherApproval: "approved", status: "active", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("StudyNow protected procedures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.getNoteWithFiles.mockImplementation(async (_noteId: number, ownerId: number) => ownerId === 21 ? { note: { id: 2, ownerId }, files: [], visuals: [] } : null);
    mocks.deleteNote.mockImplementation(async (_noteId: number, ownerId: number) => ownerId === 42);
    mocks.replaceTeacherResource.mockResolvedValue(undefined);
    mocks.getPublishedResource.mockImplementation(async (resourceId: number, studentId: number) => resourceId === 10 && studentId === 42 ? { resource: { id: 10, status: "published" }, note: { id: 2 }, files: [] } : null);
    mocks.listSubjects.mockResolvedValue([{ id: 100 }]);
    mocks.saveResource.mockResolvedValue(55);
    mocks.getAuthorizedChunks.mockResolvedValue([]);
    mocks.getNotesByIds.mockResolvedValue([]);
    mocks.getVisualsForNotes.mockResolvedValue([]);
    mocks.getConversationQuestions.mockResolvedValue([]);
    mocks.createConversation.mockResolvedValue(77);
    mocks.saveAiQuestion.mockResolvedValue(88);
    mocks.saveAnswerSources.mockResolvedValue(undefined);
    llmMocks.listLLMModels.mockResolvedValue({ data: [{ id: "gpt-5-mini" }] });
    llmMocks.invokeLLM.mockResolvedValue({ choices: [{ message: { content: "Binary search divides the search space." } }] });
  });

  it("allows note deletion only when the protected procedure receives an owned note", async () => {
    const owner = appRouter.createCaller(contextFor("student", 42));
    await expect(owner.notes.delete({ noteId: 2 })).resolves.toEqual({ success: true });

    const otherStudent = appRouter.createCaller(contextFor("student", 43));
    await expect(otherStudent.notes.delete({ noteId: 2 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("allows teacher replacement only after the replacement note passes the ownership check", async () => {
    const teacher = appRouter.createCaller(contextFor("teacher", 21));
    await expect(teacher.teacher.replaceResource({ resourceId: 3, noteId: 2, title: "Replaced source" })).resolves.toEqual({ success: true });
    expect(mocks.replaceTeacherResource).toHaveBeenCalledWith(3, 21, 2, "Replaced source", undefined);

    const otherTeacher = appRouter.createCaller(contextFor("teacher", 22));
    await expect(otherTeacher.teacher.replaceResource({ resourceId: 3, noteId: 2, title: "Unauthorized source" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns only an assigned student’s published resource and denies saving an inaccessible resource", async () => {
    const assignedStudent = appRouter.createCaller(contextFor("student", 42));
    await expect(assignedStudent.library.get({ resourceId: 10 })).resolves.toMatchObject({ resource: { id: 10 } });
    await expect(assignedStudent.library.save({ resourceId: 10, personalSubjectId: 100 })).resolves.toEqual({ id: 55 });

    const unassignedStudent = appRouter.createCaller(contextFor("student", 43));
    await expect(unassignedStudent.library.get({ resourceId: 10 })).resolves.toBeNull();
    await expect(unassignedStudent.library.save({ resourceId: 10, personalSubjectId: 100 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("explicitly reports when the AI cannot find an answer in authorized notes", async () => {
    const student = appRouter.createCaller(contextFor("student", 42));
    const response = await student.ai.ask({ question: "What is not in my notes?" });
    expect(response.foundInNotes).toBe(false);
    expect(response.answer).toContain("couldn't find that in your stored notes");
  });

  it("sends only owned and explicitly saved evidence through the protected ai.ask retrieval path", async () => {
    mocks.getAuthorizedChunks.mockResolvedValue([
      { id: 1, noteId: 11, pageRef: "Page 1", content: "Binary search divides the search space.", keywords: "binary search" },
      { id: 2, noteId: 12, pageRef: "Slide 2", content: "A saved class note compares search algorithms.", keywords: "search algorithms" },
    ]);
    mocks.getNotesByIds.mockResolvedValue([{ id: 11, title: "My private algorithms note" }, { id: 12, title: "Saved class algorithms note" }]);
    const student = appRouter.createCaller(contextFor("student", 42));
    const response = await student.ai.ask({ question: "How does binary search divide the search space?", subjectId: 100 });
    expect(response.foundInNotes).toBe(true);
    expect(mocks.getAuthorizedChunks).toHaveBeenCalledWith(42, expect.objectContaining({ subjectId: 100 }));
    const llmRequest = llmMocks.invokeLLM.mock.calls[0]?.[0];
    expect(llmRequest.messages[1].content).toContain("My private algorithms note");
    expect(llmRequest.messages[1].content).toContain("Saved class algorithms note");
    expect(llmRequest.messages[1].content).not.toContain("Denied or public-only note");
    expect(mocks.saveAnswerSources).toHaveBeenCalledWith(88, expect.arrayContaining([
      expect.objectContaining({ noteId: 11, pageRef: "Page 1" }),
      expect.objectContaining({ noteId: 12, pageRef: "Slide 2" }),
    ]));
  });

  it("denies access when asking AI about a study group the student is not a member of", async () => {
    mocks.isUserInStudyGroup.mockResolvedValue(false);
    const student = appRouter.createCaller(contextFor("student", 42));
    await expect(
      student.ai.ask({ question: "Tell me about group notes", groupId: 999 }),
    ).rejects.toThrow("You are not a member of this study group.");
    expect(mocks.isUserInStudyGroup).toHaveBeenCalledWith(999, 42);
    expect(mocks.getAuthorizedChunksForGroup).not.toHaveBeenCalled();
  });

  it("permits asking AI about a study group when the student is a member", async () => {
    mocks.isUserInStudyGroup.mockResolvedValue(true);
    mocks.getAuthorizedChunksForGroup.mockResolvedValue([
      { id: 1, noteId: 11, pageRef: "Page 1", content: "Group binary search discussion.", keywords: "binary search" },
    ]);
    mocks.getNotesByIds.mockResolvedValue([{ id: 11, title: "Group shared note" }]);
    const student = appRouter.createCaller(contextFor("student", 42));
    const response = await student.ai.ask({ question: "How does binary search work?", groupId: 999 });
    expect(response.foundInNotes).toBe(true);
    expect(mocks.isUserInStudyGroup).toHaveBeenCalledWith(999, 42);
    expect(mocks.getAuthorizedChunksForGroup).toHaveBeenCalledWith(999);
  });
});
