import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mocks = vi.hoisted(() => ({
  createSubject: vi.fn(),
  listSubjects: vi.fn(),
  listSubjectsForAdmin: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocks };
});

import { appRouter } from "./routers";

function contextFor(role: "student" | "teacher" | "admin", id: number): TrpcContext {
  return {
    user: {
      id,
      openId: `user-${id}`,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      avatarUrl: null,
      bio: null,
      externalLinks: null,
      loginMethod: "local",
      role,
      status: "active",
      teacherApproval: "approved",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Global and Personal Subjects management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("admin subject creation marks the subject as global curriculum and formats subject code", async () => {
    mocks.createSubject.mockResolvedValue(101);
    const admin = appRouter.createCaller(contextFor("admin", 1));

    const result = await admin.subjects.create({
      name: "Data Structures & Algorithms",
      code: "cs-204",
      term: "Fall 2026",
      description: "Core algorithms and data structures.",
    });

    expect(result).toEqual({ id: 101 });
    expect(mocks.createSubject).toHaveBeenCalledWith({
      ownerId: 1,
      name: "Data Structures & Algorithms",
      code: "CS-204",
      term: "Fall 2026",
      description: "Core algorithms and data structures.",
      isGlobal: 1,
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      1,
      "create_global_subject",
      "subject",
      101,
      expect.objectContaining({
        name: "Data Structures & Algorithms",
        code: "CS-204",
        isGlobal: true,
      }),
    );
  });

  it("student subject creation marks the subject as personal and preserves code formatting", async () => {
    mocks.createSubject.mockResolvedValue(102);
    const student = appRouter.createCaller(contextFor("student", 42));

    const result = await student.subjects.create({
      name: "Competitive Programming",
      code: "cp-101",
    });

    expect(result).toEqual({ id: 102 });
    expect(mocks.createSubject).toHaveBeenCalledWith({
      ownerId: 42,
      name: "Competitive Programming",
      code: "CP-101",
      term: undefined,
      description: undefined,
      isGlobal: 0,
    });
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      42,
      "create_subject",
      "subject",
      102,
      expect.objectContaining({
        name: "Competitive Programming",
        code: "CP-101",
        isGlobal: false,
      }),
    );
  });

  it("student listing subjects receives all active official subjects and their personal subjects", async () => {
    const mockSubjects = [
      { id: 1, name: "Data Structures", code: "CS-204", isGlobal: 1, ownerId: 1, status: "active" },
      { id: 2, name: "Computer Networks", code: "CS-310", isGlobal: 1, ownerId: 1, status: "active" },
      { id: 3, name: "My Python Revision", code: null, isGlobal: 0, ownerId: 42, status: "active" },
    ];
    mocks.listSubjects.mockResolvedValue(mockSubjects);

    const student = appRouter.createCaller(contextFor("student", 42));
    const result = await student.subjects.list();

    expect(mocks.listSubjects).toHaveBeenCalledWith(42);
    expect(result).toHaveLength(3);
    expect(result[0].code).toBe("CS-204");
    expect(result[0].isGlobal).toBe(1);
    expect(result[2].isGlobal).toBe(0);
  });

  it("teacher listing subjects receives curriculum subjects for class publishing", async () => {
    const mockSubjects = [
      { id: 1, name: "Operating Systems", code: "CS-301", isGlobal: 1, ownerId: 1, status: "active" },
    ];
    mocks.listSubjects.mockResolvedValue(mockSubjects);

    const teacher = appRouter.createCaller(contextFor("teacher", 21));
    const result = await teacher.subjects.list();

    expect(mocks.listSubjects).toHaveBeenCalledWith(21);
    expect(result).toEqual(mockSubjects);
  });
});
