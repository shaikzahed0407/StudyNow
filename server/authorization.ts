export function canAccessOwnedNote(ownerId: number, actorId: number) {
  return ownerId === actorId;
}

export function canManageTeacherResource(resourceTeacherId: number, actorId: number) {
  return resourceTeacherId === actorId;
}

export function canViewPublishedResource(status: string, classId: number, assignedClassIds: number[]) {
  return status === "published" && assignedClassIds.includes(classId);
}
