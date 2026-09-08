import { describe, expect, it } from "vitest";
import { appRouter, chunkText, rankChunks, validateCitations } from "./routers";
import {
  canAccessOwnedNote,
  canAccessTeacherPortal,
  canChangePlatformRole,
  canManageGroup,
  canManageTeacherResource,
  canViewPublishedResource,
  determineInvitationAction,
  isGroupOwner,
} from "./authorization";
import type { TrpcContext } from "./_core/context";

type Role = "user" | "student" | "teacher" | "admin";

function contextFor(
  role: Role,
  teacherApproval: "approved" | "pending" | "rejected" = "approved"
): TrpcContext {
  return {
    user: {
      id: 42,
      openId: "role-test-user",
      name: "Role Test User",
      email: "role@example.com",
      avatarUrl: null,
      bio: null,
      externalLinks: null,
      loginMethod: "test",
      role,
      status: "active",
      teacherApproval,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("StudyNow Redesigned Architecture — Authorization & Role Matrix", () => {
  describe("Group Role Delegation & Authority", () => {
    it("permits owners and managers to manage groups, but denies regular members", () => {
      expect(canManageGroup("owner")).toBe(true);
      expect(canManageGroup("manager")).toBe(true);
      expect(canManageGroup("member")).toBe(false);
      expect(canManageGroup(null)).toBe(false);
      expect(canManageGroup(undefined)).toBe(false);
    });

    it("verifies owner-only operations", () => {
      expect(isGroupOwner("owner")).toBe(true);
      expect(isGroupOwner("manager")).toBe(false);
      expect(isGroupOwner("member")).toBe(false);
    });
  });

  describe("Platform Roles & Teacher Portal Access", () => {
    it("allows approved teachers and platform admins access to Teacher Portal", () => {
      expect(canAccessTeacherPortal("teacher", "approved")).toBe(true);
      expect(canAccessTeacherPortal("admin", "approved")).toBe(true);
      expect(canAccessTeacherPortal("admin", "pending")).toBe(true); // Admins always have access
    });

    it("locks the Teacher Portal for pending or rejected teachers", () => {
      expect(canAccessTeacherPortal("teacher", "pending")).toBe(false);
      expect(canAccessTeacherPortal("teacher", "rejected")).toBe(false);
      expect(canAccessTeacherPortal("student", "approved")).toBe(false);
    });

    it("enforces platform role change permissions (admin-only)", () => {
      expect(canChangePlatformRole("admin")).toBe(true);
      expect(canChangePlatformRole("teacher")).toBe(false);
      expect(canChangePlatformRole("student")).toBe(false);
    });
  });

  describe("Exact Role-Based Invitation Matrix (Section 17)", () => {
    it("auto-joins immediately when Admin invites Student, Teacher, or Admin", () => {
      expect(determineInvitationAction("admin", "student")).toBe("auto_join");
      expect(determineInvitationAction("admin", "teacher")).toBe("auto_join");
      expect(determineInvitationAction("admin", "admin")).toBe("auto_join");
    });

    it("auto-joins immediately when Teacher invites Student", () => {
      expect(determineInvitationAction("teacher", "student")).toBe("auto_join");
    });

    it("requires recipient acceptance when Teacher invites Teacher or Admin", () => {
      expect(determineInvitationAction("teacher", "teacher")).toBe("require_acceptance");
      expect(determineInvitationAction("teacher", "admin")).toBe("require_acceptance");
    });

    it("requires recipient acceptance when Student invites Anyone", () => {
      expect(determineInvitationAction("student", "student")).toBe("require_acceptance");
      expect(determineInvitationAction("student", "teacher")).toBe("require_acceptance");
      expect(determineInvitationAction("student", "admin")).toBe("require_acceptance");
    });
  });

  describe("Procedure-Level Gatekeeping", () => {
    it("blocks student access to platform administrator user directory", async () => {
      const caller = appRouter.createCaller(contextFor("student"));
      await expect(caller.admin.users()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("blocks pending teacher from accessing teacher-only procedures", async () => {
      const caller = appRouter.createCaller(contextFor("teacher", "pending"));
      await expect(caller.teacher.managedGroups()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("allows approved teacher to access teacher portal status", async () => {
      const caller = appRouter.createCaller(contextFor("teacher", "approved"));
      const status = await caller.teacher.status();
      expect(status.hasAccess).toBe(true);
      expect(status.teacherApproval).toBe("approved");
    });
  });

  describe("AI Citations & Retrieval Utilities", () => {
    it("keeps retrieval ranking deterministic and citations scoped to retrieved notes", () => {
      const chunks = chunkText("Binary search halves the search space. A graph can be traversed with BFS.");
      expect(chunks.length).toBe(1);
      const ranked = rankChunks([{ ...chunks[0], id: 7, noteId: 10 }], "How does binary search reduce the search space?");
      expect(ranked[0]?.noteId).toBe(10);
      expect(
        validateCitations(
          [{ ...ranked[0], pageRef: "Section 1" }, { ...ranked[0], id: 8, noteId: 99 }],
          [{ id: 10 }]
        )
      ).toHaveLength(1);
    });

    it("creates section references for plain text notes", () => {
      expect(chunkText("A short stored note")[0]?.pageRef).toBe("Section 1");
    });

    it("enforces note owner access checks", () => {
      expect(canAccessOwnedNote(7, 7)).toBe(true);
      expect(canAccessOwnedNote(7, 8)).toBe(false);
      expect(canManageTeacherResource(21, 21)).toBe(true);
      expect(canManageTeacherResource(21, 22)).toBe(false);
    });
  });
});
