import { describe, expect, it } from "vitest";
import { appRouter, chunkText, rankChunks, validateCitations } from "./routers";
import { canAccessOwnedNote, canManageTeacherResource, canViewPublishedResource } from "./authorization";
import type { TrpcContext } from "./_core/context";

type Role = "user" | "student" | "teacher" | "admin";

function contextFor(role: Role): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "role-test-user",
      name: "Role Test User",
      email: "role@example.com",
      loginMethod: "test",
      role,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("StudyNow role boundaries", () => {
  it("does not allow a teacher to enter the student Q&A procedure", async () => {
    const caller = appRouter.createCaller(contextFor("teacher"));
    await expect(caller.ai.ask({ question: "Where is the definition?" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not allow a student to read the admin directory", async () => {
    const caller = appRouter.createCaller(contextFor("student"));
    await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps legacy user accounts mapped to the student workspace", async () => {
    const caller = appRouter.createCaller(contextFor("user"));
    await expect(caller.ai.ask({ question: "Where is the definition?" })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks student access to administrator moderation", async () => {
    const caller = appRouter.createCaller(contextFor("student"));
    await expect(caller.admin.moderateResource({ resourceId: 1, status: "unpublished" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks teacher access to persisted student conversations", async () => {
    const caller = appRouter.createCaller(contextFor("teacher"));
    await expect(caller.ai.history()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps retrieval ranking deterministic and citations scoped to retrieved notes", () => {
    const chunks = chunkText("Binary search halves the search space. A graph can be traversed with BFS.");
    expect(chunks.length).toBe(1);
    const ranked = rankChunks([{ ...chunks[0], id: 7, noteId: 10 }], "How does binary search reduce the search space?");
    expect(ranked[0]?.noteId).toBe(10);
    expect(validateCitations([{ ...ranked[0], pageRef: "Section 1" }, { ...ranked[0], id: 8, noteId: 99 }], [{ id: 10 }])).toHaveLength(1);
  });

  it("creates section references for plain text notes", () => {
    expect(chunkText("A short stored note")[0]?.pageRef).toBe("Section 1");
  });

  it("enforces owner-only note deletion and teacher-owned replacement predicates", () => {
    expect(canAccessOwnedNote(7, 7)).toBe(true);
    expect(canAccessOwnedNote(7, 8)).toBe(false);
    expect(canManageTeacherResource(21, 21)).toBe(true);
    expect(canManageTeacherResource(21, 22)).toBe(false);
  });

  it("allows published resources only for assigned classes", () => {
    expect(canViewPublishedResource("published", 4, [2, 4])).toBe(true);
    expect(canViewPublishedResource("published", 5, [2, 4])).toBe(false);
    expect(canViewPublishedResource("unpublished", 4, [2, 4])).toBe(false);
  });
});
