import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn(),
  listCollections: vi.fn(),
  renameCollection: vi.fn(),
  deleteCollection: vi.fn(),
  saveSharedNoteToPersonal: vi.fn(),
  unsaveNote: vi.fn(),
  createStudyGroup: vi.fn(),
  listStudyGroupsForUser: vi.fn(),
  promoteToManager: vi.fn(),
  removeManager: vi.fn(),
  transferGroupOwnership: vi.fn(),
  removeGroupMember: vi.fn(),
  inviteUserToGroup: vi.fn(),
  changeUserPlatformRole: vi.fn(),
  approveTeacher: vi.fn(),
  rejectTeacher: vi.fn(),
  recordAudit: vi.fn(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return { ...actual, ...mocks };
});

function makeContext(user: { id: number; role: "student" | "teacher" | "admin"; teacherApproval?: string }): TrpcContext {
  return {
    user: {
      id: user.id,
      openId: `user-${user.id}`,
      name: `User ${user.id}`,
      email: `user${user.id}@studynow.dev`,
      avatarUrl: null,
      bio: null,
      externalLinks: null,
      loginMethod: "test",
      role: user.role,
      status: "active",
      teacherApproval: (user.teacherApproval || "approved") as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
  };
}

describe("StudyNow Architectural Redesign Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Personal Collections (Raindrop.io-style)", () => {
    it("allows users to create personal collections", async () => {
      mocks.createCollection.mockResolvedValue(10);
      const student = appRouter.createCaller(makeContext({ id: 1, role: "student" }));

      const res = await student.collections.create({
        name: "Distributed Systems",
        color: "#3B82F6",
      });

      expect(res).toEqual({ id: 10 });
      expect(mocks.createCollection).toHaveBeenCalledWith({
        userId: 1,
        name: "Distributed Systems",
        color: "#3B82F6",
        icon: undefined,
      });
    });

    it("allows renaming personal collections", async () => {
      mocks.renameCollection.mockResolvedValue({ success: true });
      const student = appRouter.createCaller(makeContext({ id: 1, role: "student" }));

      const res = await student.collections.rename({
        collectionId: 10,
        name: "Cloud Architecture",
      });

      expect(res).toEqual({ success: true });
      expect(mocks.renameCollection).toHaveBeenCalledWith(10, 1, "Cloud Architecture");
    });
  });

  describe("Independent Saved Notes References", () => {
    it("creates an independent user savedNote record without mutating original note or copying storage", async () => {
      mocks.saveSharedNoteToPersonal.mockResolvedValue({ success: true, savedNoteId: 88, alreadySaved: false });
      const student = appRouter.createCaller(makeContext({ id: 2, role: "student" }));

      const res = await student.sharing.saveToPersonal({
        noteId: 500,
        collectionId: 10,
        customTitle: "My Exam Cheat Sheet",
      });

      expect(res).toEqual({ success: true, savedNoteId: 88, alreadySaved: false });
      expect(mocks.saveSharedNoteToPersonal).toHaveBeenCalledWith(
        2,
        500,
        10,
        "My Exam Cheat Sheet"
      );
    });

    it("allows unsaving a reference from personal library", async () => {
      mocks.unsaveNote.mockResolvedValue({ success: true });
      const student = appRouter.createCaller(makeContext({ id: 2, role: "student" }));

      const res = await student.sharing.unsave({ noteId: 500 });
      expect(res).toEqual({ success: true });
      expect(mocks.unsaveNote).toHaveBeenCalledWith(2, 500);
    });
  });

  describe("Decentralized Groups & Role Delegation", () => {
    it("allows promoting a group member to manager", async () => {
      mocks.promoteToManager.mockResolvedValue({ success: true });
      const owner = appRouter.createCaller(makeContext({ id: 10, role: "student" }));

      const res = await owner.groups.promoteManager({
        groupId: 99,
        targetUserId: 15,
      });

      expect(res).toEqual({ success: true });
      expect(mocks.promoteToManager).toHaveBeenCalledWith(99, 15, 10);
    });

    it("allows transferring group ownership", async () => {
      mocks.transferGroupOwnership.mockResolvedValue({ success: true });
      const owner = appRouter.createCaller(makeContext({ id: 10, role: "student" }));

      const res = await owner.groups.transferOwnership({
        groupId: 99,
        newOwnerId: 15,
      });

      expect(res).toEqual({ success: true });
      expect(mocks.transferGroupOwnership).toHaveBeenCalledWith(99, 15, 10);
    });

    it("allows removing a member from the group", async () => {
      mocks.removeGroupMember.mockResolvedValue({ success: true });
      const manager = appRouter.createCaller(makeContext({ id: 15, role: "student" }));

      const res = await manager.groups.removeMember({
        groupId: 99,
        targetUserId: 20,
      });

      expect(res).toEqual({ success: true });
      expect(mocks.removeGroupMember).toHaveBeenCalledWith(99, 20, 15);
    });
  });

  describe("Platform Governance & Teacher Approval Queue", () => {
    it("allows admin to approve a pending teacher", async () => {
      mocks.approveTeacher.mockResolvedValue({ success: true });
      const admin = appRouter.createCaller(makeContext({ id: 1, role: "admin" }));

      const res = await admin.admin.approveTeacher({ teacherUserId: 44 });
      expect(res).toEqual({ success: true });
      expect(mocks.approveTeacher).toHaveBeenCalledWith(1, 44);
    });

    it("blocks non-admin users from approving teachers", async () => {
      const student = appRouter.createCaller(makeContext({ id: 5, role: "student" }));
      await expect(student.admin.approveTeacher({ teacherUserId: 44 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("allows admin to update user platform role", async () => {
      mocks.changeUserPlatformRole.mockResolvedValue({ success: true });
      const admin = appRouter.createCaller(makeContext({ id: 1, role: "admin" }));

      const res = await admin.admin.changeRole({
        userId: 25,
        role: "teacher",
        reason: "Hired for department",
      });

      expect(res).toEqual({ success: true });
      expect(mocks.changeUserPlatformRole).toHaveBeenCalledWith(
        1,
        25,
        "teacher",
        "Hired for department"
      );
    });
  });
});
