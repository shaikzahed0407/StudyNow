/**
 * StudyNow Platform Authorization & Permission Helpers
 * Enforces server-side permissions for Platform Roles, Group Roles, Notes, and Invitations.
 */

export function canAccessOwnedNote(ownerId: number, actorId: number): boolean {
  return ownerId === actorId;
}

export function canManageTeacherResource(resourceTeacherId: number, actorId: number): boolean {
  return resourceTeacherId === actorId;
}

export function canViewPublishedResource(status: string, classId: number, assignedClassIds: number[]): boolean {
  return status === "published" && assignedClassIds.includes(classId);
}

/**
 * Checks if a user has group-management authority (Owner or Manager).
 * Managers have delegated group-management control ONLY inside this group.
 */
export function canManageGroup(groupRole: string | null | undefined): boolean {
  return groupRole === "owner" || groupRole === "manager" || groupRole === "admin";
}

/**
 * Checks if a user is the Group Owner. Only Owners can transfer ownership,
 * promote/demote managers, or delete the group.
 */
export function isGroupOwner(groupRole: string | null | undefined): boolean {
  return groupRole === "owner";
}

/**
 * Teacher Portal Access Rule:
 * - Admin always has access.
 * - Teachers have access ONLY IF teacherApproval === 'approved'.
 * - Self-registered teachers (pending) have locked access.
 * - Admin-promoted teachers are immediately approved and have access.
 */
export function canAccessTeacherPortal(platformRole: string, teacherApproval: string): boolean {
  if (platformRole === "admin") return true;
  if (platformRole === "teacher" && teacherApproval === "approved") return true;
  return false;
}

/**
 * Platform Role Management:
 * Only platform Admins can change platform roles. Group Owners and Managers CANNOT.
 */
export function canChangePlatformRole(actorPlatformRole: string): boolean {
  return actorPlatformRole === "admin";
}

/**
 * Role-Based Invitation Rules (Section 17 of Specification):
 * 1. Admin invites Teacher -> Auto-joins
 * 2. Admin invites Student -> Auto-joins
 * 3. Teacher invites Student -> Auto-joins
 * 4. Teacher invites Teacher -> Requires acceptance
 * 5. Teacher invites Admin -> Requires acceptance
 * 6. Student invites Anyone (Student, Teacher, Admin) -> Requires acceptance
 */
export function determineInvitationAction(
  inviterRole: string,
  inviteeRole: string,
): "auto_join" | "require_acceptance" {
  const normInviter = inviterRole === "user" ? "student" : inviterRole;
  const normInvitee = inviteeRole === "user" ? "student" : inviteeRole;

  if (normInviter === "admin") {
    // Admin invites Teacher or Student -> Auto-joins
    return "auto_join";
  }

  if (normInviter === "teacher" && normInvitee === "student") {
    // Teacher invites Student -> Auto-joins
    return "auto_join";
  }

  // Teacher invites Teacher/Admin, or Student invites Anyone -> Requires acceptance
  return "require_acceptance";
}
