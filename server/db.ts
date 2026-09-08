import { and, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { generateEmbeddings } from "./services/embeddings";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  aiAnswerSources,
  aiConversations,
  aiQuestions,
  auditEvents,
  classes,
  classStudents,
  classTeachers,
  collections,
  groupInvitations,
  groupJoinRequests,
  InsertNote,
  InsertUser,
  noteChunks,
  noteFiles,
  notes,
  noteVisuals,
  notifications,
  roleChangeAudits,
  savedNotes,
  savedResources,
  studyGroupMembers,
  studyGroupNotes,
  studyGroups,
  subjects,
  teacherResources,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
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

let _db: ReturnType<typeof drizzle> | null = null;
export function setDbForTests(db: any) {
  _db = db;
}

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const isLocalhost =
        process.env.DATABASE_URL.includes("localhost") ||
        process.env.DATABASE_URL.includes("127.0.0.1");
      const client = postgres(process.env.DATABASE_URL, {
        prepare: false,
        ...(isLocalhost ? {} : { ssl: "require" }),
      });
      _db = drizzle(client);
    } catch (error) {
      console.error("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// Normalizes PostgreSQL `.returning({ id: ... })` results, plain object `{ id }` or `{ insertId }`,
// and legacy mysql2 `[ResultSetHeader, FieldPacket[]]` shapes.
export function getInsertId(result: unknown): number {
  let id: unknown;

  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (first && typeof first === "object") {
      id =
        "id" in first
          ? (first as any).id
          : "insertId" in first
            ? (first as any).insertId
            : undefined;
    }
  } else if (result && typeof result === "object") {
    id =
      "id" in result
        ? (result as any).id
        : "insertId" in result
          ? (result as any).insertId
          : undefined;
  }

  const num = Number(id);
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(
      `Database insert did not return a valid numeric ID (got ${JSON.stringify(id)}). Result was: ${JSON.stringify(result)}`,
    );
  }
  return num;
}

// ==========================================
// 1. Users, Profiles, Platform Roles
// ==========================================

export async function upsertUser(user: InsertUser): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.openId, user.openId))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(users).values({
      ...user,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: user.lastSignedIn || new Date(),
    });
  } else {
    await db
      .update(users)
      .set({
        name: user.name ?? existing[0].name,
        email: user.email ?? existing[0].email,
        role: user.role ?? existing[0].role,
        status: user.status ?? existing[0].status,
        // Preserve admin-granted approval decisions — never reset on re-login.
        // The login payload always passes a default value (e.g. "pending" for teachers),
        // which must not overwrite an admin's "approved" or "rejected" decision.
        teacherApproval: existing[0].teacherApproval,
        avatarUrl: user.avatarUrl ?? existing[0].avatarUrl,
        bio: user.bio ?? existing[0].bio,
        externalLinks: user.externalLinks ?? existing[0].externalLinks,
        updatedAt: new Date(),
        lastSignedIn: user.lastSignedIn || new Date(),
      })
      .where(eq(users.openId, user.openId));
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] || null;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  return result[0] || null;
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.lastSignedIn));
}

export async function updateUserProfile(
  userId: number,
  input: { name?: string; avatarUrl?: string; bio?: string; externalLinks?: string },
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl.trim() || null } : {}),
      ...(input.bio !== undefined ? { bio: input.bio.trim() || null } : {}),
      ...(input.externalLinks !== undefined ? { externalLinks: input.externalLinks } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getUserById(userId);
}

export async function getPublicUserProfile(targetUserId: number) {
  const user = await getUserById(targetUserId);
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    externalLinks: user.externalLinks,
    role: user.role,
    createdAt: user.createdAt,
  };
}

/**
 * Platform Role Change (Admin only).
 * Rules:
 * 1. Actor must be platform Admin.
 * 2. Cannot demote the final active Admin.
 * 3. If promoted to Teacher, teacherApproval is set to 'approved' immediately.
 * 4. Audited in roleChangeAudits.
 */
export async function changeUserPlatformRole(
  actorId: number,
  targetUserId: number,
  newRole: "student" | "teacher" | "admin" | "user",
  reason?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const actor = await getUserById(actorId);
  if (!actor || !canChangePlatformRole(actor.role)) {
    throw new Error("Only platform administrators can change user platform roles.");
  }

  const target = await getUserById(targetUserId);
  if (!target) throw new Error("Target user not found.");

  // Prevent demoting the last active platform admin
  if (target.role === "admin" && newRole !== "admin") {
    const adminCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active")));

    if (Number(adminCount[0]?.count || 0) <= 1) {
      throw new Error("Cannot remove or demote the last active platform administrator.");
    }
  }

  const normalizedRole = newRole === "user" ? "student" : newRole;

  // If directly promoted to Teacher by Admin -> IMMEDIATELY APPROVED
  const teacherApproval = normalizedRole === "teacher" ? "approved" : target.teacherApproval;

  await db
    .update(users)
    .set({
      role: normalizedRole,
      teacherApproval,
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetUserId));

  // Record audit
  await db.insert(roleChangeAudits).values({
    actorId,
    targetUserId,
    oldRole: target.role,
    newRole: normalizedRole,
    reason: reason || null,
  });

  return { success: true };
}

export async function updateUserAccess(
  userId: number,
  role: "student" | "teacher" | "admin" | "user",
  status: "active" | "pending" | "disabled",
  actorId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const target = await getUserById(userId);
  if (!target) throw new Error("User not found");

  const normalizedRole = role === "user" ? "student" : role;
  const teacherApproval = normalizedRole === "teacher" ? "approved" : target.teacherApproval;

  await db
    .update(users)
    .set({
      role: normalizedRole,
      status,
      teacherApproval,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await recordAudit(actorId, "update_user_access", "user", userId, { role: normalizedRole, status });
}

export async function approveTeacher(adminId: number, teacherUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const admin = await getUserById(adminId);
  if (!admin || admin.role !== "admin") {
    throw new Error("Only administrators can approve teacher accounts.");
  }

  await db
    .update(users)
    .set({ teacherApproval: "approved", updatedAt: new Date() })
    .where(eq(users.id, teacherUserId));

  await createNotification({
    userId: teacherUserId,
    actorId: adminId,
    type: "teacher_approved",
    title: "Teacher Portal Unlocked",
    message: "An administrator has approved your teacher account. You now have full Teacher Portal access.",
  });

  return { success: true };
}

export async function rejectTeacher(adminId: number, teacherUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const admin = await getUserById(adminId);
  if (!admin || admin.role !== "admin") {
    throw new Error("Only administrators can review teacher accounts.");
  }

  await db
    .update(users)
    .set({ teacherApproval: "rejected", updatedAt: new Date() })
    .where(eq(users.id, teacherUserId));

  return { success: true };
}

export async function listPendingTeachers() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(users)
    .where(and(eq(users.role, "teacher"), eq(users.teacherApproval, "pending")))
    .orderBy(desc(users.createdAt));
}

export async function listRoleChangeAudits() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(roleChangeAudits).orderBy(desc(roleChangeAudits.createdAt)).limit(100);
}

// ==========================================
// 2. Collections (Personal Raindrop.io-style)
// ==========================================

export async function listCollections(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const userCollections = await db
    .select()
    .from(collections)
    .where(eq(collections.userId, userId))
    .orderBy(collections.sortOrder, desc(collections.updatedAt));

  // Also query note counts per collection for this user
  const ownCounts = await db
    .select({
      collectionId: notes.collectionId,
      count: sql<number>`count(*)`,
    })
    .from(notes)
    .where(and(eq(notes.ownerId, userId), eq(notes.isTrash, 0)))
    .groupBy(notes.collectionId);

  const savedCounts = await db
    .select({
      collectionId: savedNotes.collectionId,
      count: sql<number>`count(*)`,
    })
    .from(savedNotes)
    .where(eq(savedNotes.userId, userId))
    .groupBy(savedNotes.collectionId);

  const countMap = new Map<number, number>();
  for (const c of ownCounts) {
    if (c.collectionId) {
      countMap.set(c.collectionId, (countMap.get(c.collectionId) || 0) + Number(c.count));
    }
  }
  for (const c of savedCounts) {
    if (c.collectionId) {
      countMap.set(c.collectionId, (countMap.get(c.collectionId) || 0) + Number(c.count));
    }
  }

  return userCollections.map((col) => ({
    ...col,
    noteCount: countMap.get(col.id) || 0,
  }));
}

export async function createCollection(input: {
  userId: number;
  name: string;
  color?: string;
  icon?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db
    .insert(collections)
    .values({
      userId: input.userId,
      name: input.name.trim(),
      color: input.color || null,
      icon: input.icon || null,
    })
    .returning({ id: collections.id });

  return getInsertId(result);
}

export async function renameCollection(collectionId: number, userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .update(collections)
    .set({ name: name.trim(), updatedAt: new Date() })
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)));

  return { success: true };
}

export async function deleteCollection(collectionId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Verify ownership
  const col = await db
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);

  if (!col.length) throw new Error("Collection not found or access denied.");

  // Safely move owned notes and saved notes in this collection to Uncategorized (null)
  await db
    .update(notes)
    .set({ collectionId: null, updatedAt: new Date() })
    .where(and(eq(notes.ownerId, userId), eq(notes.collectionId, collectionId)));

  await db
    .update(savedNotes)
    .set({ collectionId: null })
    .where(and(eq(savedNotes.userId, userId), eq(savedNotes.collectionId, collectionId)));

  await db.delete(collections).where(eq(collections.id, collectionId));
  return { success: true };
}

// ==========================================
// 3. Notes & Raindrop.io-style Personal Library
// ==========================================

export async function listNotesForUser(
  userId: number,
  options?: {
    filter?: "all" | "favorites" | "uncategorized" | "trash";
    collectionId?: number;
    search?: string;
  },
) {
  const db = await getDb();
  if (!db) return [];

  const filter = options?.filter || "all";
  const conditions: any[] = [eq(notes.ownerId, userId)];

  if (filter === "trash") {
    conditions.push(eq(notes.isTrash, 1));
  } else {
    // Normal views exclude trash
    conditions.push(eq(notes.isTrash, 0));

    if (filter === "favorites") {
      conditions.push(eq(notes.isFavorite, 1));
    } else if (filter === "uncategorized") {
      conditions.push(isNull(notes.collectionId));
    } else if (options?.collectionId) {
      conditions.push(eq(notes.collectionId, options.collectionId));
    }
  }

  if (options?.search?.trim()) {
    const term = `%${options.search.trim()}%`;
    conditions.push(
      or(
        ilike(notes.title, term),
        ilike(notes.tags, term),
        ilike(notes.source, term),
        ilike(notes.content, term),
      ),
    );
  }

  const ownNotes = await db
    .select()
    .from(notes)
    .where(and(...conditions))
    .orderBy(desc(notes.updatedAt));

  // If in 'all', 'favorites', or a specific collection, also include user's saved notes
  if (filter !== "trash") {
    const savedConditions: any[] = [eq(savedNotes.userId, userId)];
    if (filter === "favorites") {
      savedConditions.push(eq(savedNotes.isFavorite, 1));
    } else if (filter === "uncategorized") {
      savedConditions.push(isNull(savedNotes.collectionId));
    } else if (options?.collectionId) {
      savedConditions.push(eq(savedNotes.collectionId, options.collectionId));
    }

    const savedRecords = await db
      .select({
        savedId: savedNotes.id,
        savedAt: savedNotes.savedAt,
        customTitle: savedNotes.customTitle,
        collectionId: savedNotes.collectionId,
        isFavorite: savedNotes.isFavorite,
        originalNote: notes,
      })
      .from(savedNotes)
      .innerJoin(notes, eq(savedNotes.originalNoteId, notes.id))
      .where(and(...savedConditions));

    const mappedSaved = savedRecords.map((r) => ({
      ...r.originalNote,
      id: r.originalNote.id,
      title: r.customTitle || r.originalNote.title,
      collectionId: r.collectionId,
      isFavorite: r.isFavorite,
      isSavedReference: true,
      savedNoteId: r.savedId,
      updatedAt: r.savedAt,
    }));

    // Filter search for saved notes if search provided
    let finalSaved = mappedSaved;
    if (options?.search?.trim()) {
      const q = options.search.trim().toLowerCase();
      finalSaved = mappedSaved.filter(
        (n) =>
          n.title?.toLowerCase().includes(q) ||
          n.tags?.toLowerCase().includes(q) ||
          n.source?.toLowerCase().includes(q) ||
          n.content?.toLowerCase().includes(q),
      );
    }

    return [...ownNotes.map((n) => ({ ...n, isSavedReference: false })), ...finalSaved].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }

  return ownNotes.map((n) => ({ ...n, isSavedReference: false }));
}

// Backward compatibility alias for listNotesForStudent
export async function listNotesForStudent(studentId: number, search?: string, subjectId?: number) {
  return listNotesForUser(studentId, { search, collectionId: undefined });
}

export async function createNote(input: {
  ownerId: number;
  collectionId?: number;
  subjectId?: number;
  title: string;
  source?: string;
  tags?: string;
  kind: "rich_text" | "file";
  content?: string;
  processingStatus?: "uploaded" | "processing" | "ready" | "failed";
  processingError?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db
    .insert(notes)
    .values({
      ownerId: input.ownerId,
      collectionId: input.collectionId || null,
      subjectId: input.subjectId || null,
      title: input.title.trim(),
      source: input.source?.trim() || null,
      tags: input.tags?.trim() || null,
      kind: input.kind,
      content: input.content || null,
      processingStatus: input.processingStatus || "uploaded",
      processingError: input.processingError || null,
      isFavorite: 0,
      isTrash: 0,
    })
    .returning({ id: notes.id });

  return getInsertId(result);
}

export async function getNoteWithFiles(
  noteId: number,
  requestingUserId?: number,
  requestingUserRole?: string,
) {
  const db = await getDb();
  if (!db) return null;

  const note = (await db.select().from(notes).where(eq(notes.id, noteId)).limit(1))[0];
  if (!note) return null;

  // Authorization check if requestingUserId is provided:
  if (requestingUserId && requestingUserRole !== "admin") {
    const isOwner = note.ownerId === requestingUserId;
    // Check if saved by user
    const saved = await db
      .select()
      .from(savedNotes)
      .where(and(eq(savedNotes.originalNoteId, noteId), eq(savedNotes.userId, requestingUserId)))
      .limit(1);

    // Check if shared to a group that user belongs to
    const sharedToUserGroup = await db
      .select()
      .from(studyGroupNotes)
      .innerJoin(
        studyGroupMembers,
        and(
          eq(studyGroupNotes.groupId, studyGroupMembers.groupId),
          eq(studyGroupMembers.userId, requestingUserId),
        ),
      )
      .where(eq(studyGroupNotes.noteId, noteId))
      .limit(1);

    if (!isOwner && !saved.length && !sharedToUserGroup.length) {
      return null;
    }
  }

  const files = await db.select().from(noteFiles).where(eq(noteFiles.noteId, noteId));
  const visuals = await db.select().from(noteVisuals).where(eq(noteVisuals.noteId, noteId));
  const chunks = await db
    .select()
    .from(noteChunks)
    .where(and(eq(noteChunks.noteId, noteId), eq(noteChunks.isActive, 1)))
    .orderBy(noteChunks.chunkOrder);

  // If the note has no direct text content, populate it from extracted chunks for preview
  if (!note.content && chunks.length > 0) {
    const combinedContent = chunks
      .map((c) => c.content)
      .filter(Boolean)
      .join("\n\n");
    if (combinedContent) {
      note.content = combinedContent;
    }
  }

  return { note, files, visuals, chunks };
}

export async function addNoteFile(input: {
  noteId: number;
  storageKey: string;
  storageUrl: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(noteFiles).values(input).returning({ id: noteFiles.id });
  return getInsertId(result);
}

export async function updateNoteProcessing(
  noteId: number,
  processingStatus: "uploaded" | "processing" | "ready" | "failed",
  processingError?: string,
  content?: string,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notes)
    .set({
      processingStatus,
      processingError: processingError || null,
      ...(content ? { content } : {}),
      updatedAt: new Date(),
    })
    .where(eq(notes.id, noteId));
}

export async function updateNoteContent(noteId: number, content: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notes)
    .set({ content, updatedAt: new Date() })
    .where(eq(notes.id, noteId));
}

export async function toggleFavoriteNote(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Check if it's an owned note
  const owned = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .limit(1);

  if (owned.length) {
    const nextVal = owned[0].isFavorite === 1 ? 0 : 1;
    await db
      .update(notes)
      .set({ isFavorite: nextVal, updatedAt: new Date() })
      .where(eq(notes.id, noteId));
    return { isFavorite: nextVal };
  }

  // Check if it's a saved note reference
  const saved = await db
    .select()
    .from(savedNotes)
    .where(and(eq(savedNotes.originalNoteId, noteId), eq(savedNotes.userId, userId)))
    .limit(1);

  if (saved.length) {
    const nextVal = saved[0].isFavorite === 1 ? 0 : 1;
    await db
      .update(savedNotes)
      .set({ isFavorite: nextVal })
      .where(eq(savedNotes.id, saved[0].id));
    return { isFavorite: nextVal };
  }

  throw new Error("Note not found or access denied.");
}

export async function moveNoteToCollection(
  noteId: number,
  userId: number,
  collectionId: number | null,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  if (collectionId !== null) {
    // Verify collection belongs to user
    const col = await db
      .select()
      .from(collections)
      .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
      .limit(1);
    if (!col.length) throw new Error("Collection does not belong to you.");
  }

  // Update owned note if owner
  const owned = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .limit(1);

  if (owned.length) {
    await db
      .update(notes)
      .set({ collectionId, updatedAt: new Date() })
      .where(eq(notes.id, noteId));
    return { success: true };
  }

  // Update saved note reference if saver
  const saved = await db
    .select()
    .from(savedNotes)
    .where(and(eq(savedNotes.originalNoteId, noteId), eq(savedNotes.userId, userId)))
    .limit(1);

  if (saved.length) {
    await db
      .update(savedNotes)
      .set({ collectionId })
      .where(eq(savedNotes.id, saved[0].id));
    return { success: true };
  }

  throw new Error("Note not found or access denied.");
}

export async function trashNote(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Only owner can trash their own note
  const result = await db
    .update(notes)
    .set({ isTrash: 1, deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .returning({ id: notes.id });

  return result.length > 0;
}

export async function restoreNote(noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const result = await db
    .update(notes)
    .set({ isTrash: 0, deletedAt: null, updatedAt: new Date() })
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .returning({ id: notes.id });

  return result.length > 0;
}

export async function deleteNote(noteId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return false;

  const target = (
    await db
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.ownerId, ownerId)))
      .limit(1)
  )[0];

  if (!target || !canAccessOwnedNote(target.ownerId, ownerId)) return false;

  // Clean up associated chunks, visuals, files, and group share references
  await db.delete(noteChunks).where(eq(noteChunks.noteId, noteId));
  await db.delete(noteVisuals).where(eq(noteVisuals.noteId, noteId));
  await db.delete(noteFiles).where(eq(noteFiles.noteId, noteId));
  await db.delete(studyGroupNotes).where(eq(studyGroupNotes.noteId, noteId));
  await db.delete(savedNotes).where(eq(savedNotes.originalNoteId, noteId));
  await db.delete(notes).where(eq(notes.id, noteId));
  return true;
}

export async function addNoteChunks(
  noteId: number,
  chunks: Array<{
    pageRef?: string;
    content: string;
    keywords?: string;
    chunkOrder: number;
    embedding?: number[];
  }>,
) {
  const db = await getDb();
  if (!db || !chunks.length) return [];

  const textBatch = chunks.map((c) => c.content);
  let embeddings: Array<number[] | null> = chunks.map((c) => c.embedding || null);
  const needsEmbeddings = embeddings.some((e) => e === null);

  if (needsEmbeddings) {
    try {
      embeddings = await generateEmbeddings(textBatch);
    } catch (err) {
      console.warn("[Embeddings] Batch generation failed during note chunk insertion:", err);
      embeddings = chunks.map(() => null);
    }
  }

  const values = chunks.map((chunk, index) => ({
    noteId,
    pageRef: chunk.pageRef || null,
    content: chunk.content,
    keywords: chunk.keywords || null,
    chunkOrder: chunk.chunkOrder ?? index,
    isActive: 1,
    embedding: embeddings[index] || null,
  }));

  const inserted = await db.insert(noteChunks).values(values).returning({ id: noteChunks.id });
  return inserted.map((row) => row.id);
}

export async function addNoteVisual(input: {
  noteId: number;
  pageRef?: string;
  storageKey: string;
  storageUrl: string;
  caption?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(noteVisuals)
    .values({ ...input, pageRef: input.pageRef || null, caption: input.caption || null })
    .returning({ id: noteVisuals.id });
  return getInsertId(result);
}

// ==========================================
// 4. Saved Notes (Independent References)
// ==========================================

export async function saveSharedNoteToPersonal(
  userId: number,
  noteId: number,
  collectionId?: number | null,
  customTitle?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Check if note exists
  const note = (await db.select().from(notes).where(eq(notes.id, noteId)).limit(1))[0];
  if (!note) throw new Error("Note not found.");

  // Check authorization: user is note owner OR belongs to a group where note is shared
  const isOwner = note.ownerId === userId;
  const isSharedInUserGroup = await db
    .select()
    .from(studyGroupNotes)
    .innerJoin(
      studyGroupMembers,
      and(
        eq(studyGroupNotes.groupId, studyGroupMembers.groupId),
        eq(studyGroupMembers.userId, userId),
      ),
    )
    .where(eq(studyGroupNotes.noteId, noteId))
    .limit(1);

  if (!isOwner && !isSharedInUserGroup.length) {
    throw new Error("You do not have permission to save this note.");
  }

  // Check if already saved
  const existing = await db
    .select()
    .from(savedNotes)
    .where(and(eq(savedNotes.userId, userId), eq(savedNotes.originalNoteId, noteId)))
    .limit(1);

  if (existing.length) {
    // Already saved, update collection if specified
    if (collectionId !== undefined) {
      await db
        .update(savedNotes)
        .set({ collectionId: collectionId || null })
        .where(eq(savedNotes.id, existing[0].id));
    }
    return { id: existing[0].id, alreadySaved: true };
  }

  const result = await db
    .insert(savedNotes)
    .values({
      userId,
      originalNoteId: noteId,
      collectionId: collectionId || null,
      customTitle: customTitle?.trim() || null,
      isFavorite: 0,
    })
    .returning({ id: savedNotes.id });

  return { id: getInsertId(result), alreadySaved: false };
}

export async function unsaveNote(userId: number, noteId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  await db
    .delete(savedNotes)
    .where(and(eq(savedNotes.userId, userId), eq(savedNotes.originalNoteId, noteId)));

  return { success: true };
}

// ==========================================
// 5. Groups, Membership & Delegated Authority
// ==========================================

function generateGroupCode(name: string) {
  const prefix =
    name
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 4)
      .toUpperCase() || "GRP";
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${randomSuffix}`;
}

export async function createStudyGroup(input: {
  name: string;
  description?: string;
  imageUrl?: string;
  ownerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let code = generateGroupCode(input.name);
  const existing = await db.select().from(studyGroups).where(eq(studyGroups.code, code)).limit(1);
  if (existing.length) {
    code = `${code.slice(0, 4)}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  }

  const result = await db
    .insert(studyGroups)
    .values({
      name: input.name.trim(),
      code,
      description: input.description?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      ownerId: input.ownerId,
    })
    .returning({ id: studyGroups.id });

  const groupId = getInsertId(result);

  // Add creator as member with 'owner' group role
  await db.insert(studyGroupMembers).values({
    groupId,
    userId: input.ownerId,
    role: "owner",
  });

  return { id: groupId, code };
}

export async function listStudyGroupsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  const memberships = await db
    .select()
    .from(studyGroupMembers)
    .where(eq(studyGroupMembers.userId, userId));

  if (!memberships.length) return [];

  const groupIds = memberships.map((m) => m.groupId);
  const groups = await db
    .select()
    .from(studyGroups)
    .where(inArray(studyGroups.id, groupIds))
    .orderBy(desc(studyGroups.updatedAt));

  return groups.map((group) => {
    const membership = memberships.find((m) => m.groupId === group.id);
    return {
      ...group,
      myRole: membership?.role || "member",
    };
  });
}

export async function isUserInStudyGroup(groupId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db
    .select()
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)))
    .limit(1);
  return result.length > 0;
}

export async function getUserGroupRole(groupId: number, userId: number): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ role: studyGroupMembers.role })
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)))
    .limit(1);
  return result[0]?.role || null;
}

export async function getStudyGroupWithDetails(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;

  const isMember = await isUserInStudyGroup(groupId, userId);
  if (!isMember) return null;

  const groupResult = await db
    .select()
    .from(studyGroups)
    .where(eq(studyGroups.id, groupId))
    .limit(1);

  if (!groupResult.length) return null;
  const group = groupResult[0];

  const members = await db
    .select({
      id: studyGroupMembers.id,
      userId: studyGroupMembers.userId,
      role: studyGroupMembers.role,
      joinedAt: studyGroupMembers.joinedAt,
      name: users.name,
      email: users.email,
      platformRole: users.role,
      avatarUrl: users.avatarUrl,
    })
    .from(studyGroupMembers)
    .leftJoin(users, eq(studyGroupMembers.userId, users.id))
    .where(eq(studyGroupMembers.groupId, groupId));

  const sharedNoteRecords = await db
    .select({
      id: studyGroupNotes.id,
      noteId: studyGroupNotes.noteId,
      sharedAt: studyGroupNotes.sharedAt,
      sharedByUserId: studyGroupNotes.sharedByUserId,
      sharedByName: users.name,
      title: notes.title,
      kind: notes.kind,
      source: notes.source,
      tags: notes.tags,
      content: notes.content,
      processingStatus: notes.processingStatus,
      updatedAt: notes.updatedAt,
    })
    .from(studyGroupNotes)
    .leftJoin(notes, eq(studyGroupNotes.noteId, notes.id))
    .leftJoin(users, eq(studyGroupNotes.sharedByUserId, users.id))
    .where(eq(studyGroupNotes.groupId, groupId))
    .orderBy(desc(studyGroupNotes.sharedAt));

  return {
    group,
    members,
    notes: sharedNoteRecords.filter((n) => n.title !== null),
  };
}

export async function discoverPublicGroups(search?: string, currentUserId?: number) {
  const db = await getDb();
  if (!db) return [];

  const conditions: any[] = [];
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(or(ilike(studyGroups.name, term), ilike(studyGroups.description, term)));
  }

  const groups = await db
    .select()
    .from(studyGroups)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(studyGroups.updatedAt))
    .limit(50);

  if (!currentUserId) {
    return groups.map((g) => ({ ...g, isMember: false }));
  }

  const myMemberships = await db
    .select({ groupId: studyGroupMembers.groupId })
    .from(studyGroupMembers)
    .where(eq(studyGroupMembers.userId, currentUserId));

  const memberGroupIds = new Set(myMemberships.map((m) => m.groupId));

  return groups.map((g) => ({
    ...g,
    isMember: memberGroupIds.has(g.id),
  }));
}

export async function joinStudyGroupByCode(code: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const normalizedCode = code.trim().toUpperCase();
  const group = await db
    .select()
    .from(studyGroups)
    .where(eq(studyGroups.code, normalizedCode))
    .limit(1);

  if (!group.length) {
    throw new Error("No group found with this code.");
  }

  const groupId = group[0].id;
  const existingMember = await db
    .select()
    .from(studyGroupMembers)
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, userId)))
    .limit(1);

  if (existingMember.length) {
    return { success: true, group: group[0], alreadyMember: true };
  }

  await db.insert(studyGroupMembers).values({
    groupId,
    userId,
    role: "member",
  });

  return { success: true, group: group[0], alreadyMember: false };
}

// ----------------------------------------------------
// Join Requests
// ----------------------------------------------------

export async function requestToJoinGroup(groupId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const isMember = await isUserInStudyGroup(groupId, userId);
  if (isMember) {
    return { success: true, alreadyMember: true };
  }

  const existingRequest = await db
    .select()
    .from(groupJoinRequests)
    .where(
      and(
        eq(groupJoinRequests.groupId, groupId),
        eq(groupJoinRequests.userId, userId),
        eq(groupJoinRequests.status, "pending"),
      ),
    )
    .limit(1);

  if (existingRequest.length) {
    return { success: true, alreadyPending: true };
  }

  await db.insert(groupJoinRequests).values({
    groupId,
    userId,
    status: "pending",
  });

  return { success: true, alreadyPending: false };
}

export async function decideJoinRequest(
  requestId: number,
  accept: boolean,
  actorUserId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const req = (
    await db.select().from(groupJoinRequests).where(eq(groupJoinRequests.id, requestId)).limit(1)
  )[0];
  if (!req) throw new Error("Join request not found.");

  const actorRole = await getUserGroupRole(req.groupId, actorUserId);
  if (!canManageGroup(actorRole)) {
    throw new Error("Only group owners and managers can review join requests.");
  }

  const newStatus = accept ? "accepted" : "rejected";
  await db
    .update(groupJoinRequests)
    .set({
      status: newStatus,
      decidedAt: new Date(),
      decidedByUserId: actorUserId,
    })
    .where(eq(groupJoinRequests.id, requestId));

  if (accept) {
    const isMember = await isUserInStudyGroup(req.groupId, req.userId);
    if (!isMember) {
      await db.insert(studyGroupMembers).values({
        groupId: req.groupId,
        userId: req.userId,
        role: "member",
      });
    }

    await createNotification({
      userId: req.userId,
      actorId: actorUserId,
      type: "request_accepted",
      title: "Join Request Approved",
      message: "Your request to join the group was approved.",
      linkUrl: "/groups",
    });
  }

  return { success: true };
}

export async function listJoinRequestsForGroup(groupId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) return [];

  const actorRole = await getUserGroupRole(groupId, actorUserId);
  if (!canManageGroup(actorRole)) {
    throw new Error("Only group owners and managers can view join requests.");
  }

  return db
    .select({
      id: groupJoinRequests.id,
      groupId: groupJoinRequests.groupId,
      userId: groupJoinRequests.userId,
      status: groupJoinRequests.status,
      createdAt: groupJoinRequests.createdAt,
      name: users.name,
      email: users.email,
      platformRole: users.role,
      avatarUrl: users.avatarUrl,
    })
    .from(groupJoinRequests)
    .leftJoin(users, eq(groupJoinRequests.userId, users.id))
    .where(
      and(
        eq(groupJoinRequests.groupId, groupId),
        eq(groupJoinRequests.status, "pending"),
      ),
    )
    .orderBy(desc(groupJoinRequests.createdAt));
}

// ----------------------------------------------------
// Exact Role-Based Invitations (Section 17)
// ----------------------------------------------------

export async function inviteUserToGroup(
  groupId: number,
  inviterId: number,
  inviteeId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const inviterRoleInGroup = await getUserGroupRole(groupId, inviterId);
  if (!canManageGroup(inviterRoleInGroup)) {
    throw new Error("Only group owners and managers can invite members.");
  }

  const isAlreadyMember = await isUserInStudyGroup(groupId, inviteeId);
  if (isAlreadyMember) {
    return { success: true, alreadyMember: true };
  }

  const inviter = await getUserById(inviterId);
  const invitee = await getUserById(inviteeId);
  if (!inviter || !invitee) throw new Error("User record not found.");

  const action = determineInvitationAction(inviter.role, invitee.role);

  if (action === "auto_join") {
    // Auto-joins immediately!
    await db.insert(studyGroupMembers).values({
      groupId,
      userId: inviteeId,
      role: "member",
    });

    await db.insert(groupInvitations).values({
      groupId,
      inviterId,
      inviteeId,
      status: "auto_joined",
      decidedAt: new Date(),
    });

    await createNotification({
      userId: inviteeId,
      actorId: inviterId,
      type: "group_invite",
      title: "Added to Group",
      message: `${inviter.name || "A user"} added you directly to a study group.`,
      linkUrl: "/groups",
    });

    return { success: true, autoJoined: true };
  } else {
    // Requires acceptance
    const existing = await db
      .select()
      .from(groupInvitations)
      .where(
        and(
          eq(groupInvitations.groupId, groupId),
          eq(groupInvitations.inviteeId, inviteeId),
          eq(groupInvitations.status, "pending"),
        ),
      )
      .limit(1);

    if (existing.length) {
      return { success: true, alreadyPending: true };
    }

    await db.insert(groupInvitations).values({
      groupId,
      inviterId,
      inviteeId,
      status: "pending",
    });

    await createNotification({
      userId: inviteeId,
      actorId: inviterId,
      type: "group_invite",
      title: "Group Invitation",
      message: `${inviter.name || "A user"} invited you to join a study group.`,
      linkUrl: "/groups",
    });

    return { success: true, autoJoined: false };
  }
}

export async function decideInvitation(
  invitationId: number,
  accept: boolean,
  userId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const inv = (
    await db
      .select()
      .from(groupInvitations)
      .where(and(eq(groupInvitations.id, invitationId), eq(groupInvitations.inviteeId, userId)))
      .limit(1)
  )[0];

  if (!inv) throw new Error("Invitation not found or not addressed to you.");

  const newStatus = accept ? "accepted" : "rejected";
  await db
    .update(groupInvitations)
    .set({ status: newStatus, decidedAt: new Date() })
    .where(eq(groupInvitations.id, invitationId));

  if (accept) {
    const isMember = await isUserInStudyGroup(inv.groupId, userId);
    if (!isMember) {
      await db.insert(studyGroupMembers).values({
        groupId: inv.groupId,
        userId,
        role: "member",
      });
    }
  }

  return { success: true };
}

export async function listInvitationsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: groupInvitations.id,
      groupId: groupInvitations.groupId,
      inviterId: groupInvitations.inviterId,
      status: groupInvitations.status,
      createdAt: groupInvitations.createdAt,
      groupName: studyGroups.name,
      groupDescription: studyGroups.description,
      inviterName: users.name,
    })
    .from(groupInvitations)
    .innerJoin(studyGroups, eq(groupInvitations.groupId, studyGroups.id))
    .leftJoin(users, eq(groupInvitations.inviterId, users.id))
    .where(and(eq(groupInvitations.inviteeId, userId), eq(groupInvitations.status, "pending")))
    .orderBy(desc(groupInvitations.createdAt));
}

// ----------------------------------------------------
// Group Authority Delegation & Ownership
// ----------------------------------------------------

export async function promoteToManager(groupId: number, targetUserId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const actorRole = await getUserGroupRole(groupId, actorUserId);
  if (!isGroupOwner(actorRole)) {
    throw new Error("Only the group owner can promote a member to manager.");
  }

  await db
    .update(studyGroupMembers)
    .set({ role: "manager" })
    .where(
      and(
        eq(studyGroupMembers.groupId, groupId),
        eq(studyGroupMembers.userId, targetUserId),
      ),
    );

  return { success: true };
}

export async function removeManager(groupId: number, targetUserId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const actorRole = await getUserGroupRole(groupId, actorUserId);
  if (!isGroupOwner(actorRole)) {
    throw new Error("Only the group owner can demote a manager.");
  }

  await db
    .update(studyGroupMembers)
    .set({ role: "member" })
    .where(
      and(
        eq(studyGroupMembers.groupId, groupId),
        eq(studyGroupMembers.userId, targetUserId),
      ),
    );

  return { success: true };
}

export const demoteManager = removeManager;

export async function transferGroupOwnership(
  groupId: number,
  newOwnerId: number,
  currentOwnerId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const group = (await db.select().from(studyGroups).where(eq(studyGroups.id, groupId)).limit(1))[0];
  if (!group || group.ownerId !== currentOwnerId) {
    throw new Error("Only the current group owner can transfer ownership.");
  }

  const isTargetMember = await isUserInStudyGroup(groupId, newOwnerId);
  if (!isTargetMember) {
    throw new Error("The selected user must be a member of the group.");
  }

  // 1. Update group owner
  await db
    .update(studyGroups)
    .set({ ownerId: newOwnerId, updatedAt: new Date() })
    .where(eq(studyGroups.id, groupId));

  // 2. Promote new owner in members table
  await db
    .update(studyGroupMembers)
    .set({ role: "owner" })
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, newOwnerId)));

  // 3. Demote previous owner to manager
  await db
    .update(studyGroupMembers)
    .set({ role: "manager" })
    .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, currentOwnerId)));

  return { success: true };
}

export async function removeGroupMember(
  groupId: number,
  targetUserId: number,
  actorUserId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const actorRole = await getUserGroupRole(groupId, actorUserId);
  const targetRole = await getUserGroupRole(groupId, targetUserId);

  if (!actorRole || !targetRole) throw new Error("Membership record not found.");

  // Self-leave is always allowed (unless owner)
  if (targetUserId === actorUserId) {
    if (actorRole === "owner") {
      throw new Error("Group owners cannot leave without transferring ownership or deleting the group.");
    }
    await db
      .delete(studyGroupMembers)
      .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, actorUserId)));
    return { success: true };
  }

  // Owner can remove anyone except self
  if (actorRole === "owner") {
    await db
      .delete(studyGroupMembers)
      .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, targetUserId)));
    return { success: true };
  }

  // Manager can only remove regular members (cannot remove Owner or another Manager)
  if (actorRole === "manager") {
    if (targetRole === "owner" || targetRole === "manager") {
      throw new Error("Group managers cannot remove owners or other managers.");
    }
    await db
      .delete(studyGroupMembers)
      .where(and(eq(studyGroupMembers.groupId, groupId), eq(studyGroupMembers.userId, targetUserId)));
    return { success: true };
  }

  throw new Error("You do not have permission to remove members from this group.");
}

export async function deleteStudyGroup(groupId: number, actorUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const group = (await db.select().from(studyGroups).where(eq(studyGroups.id, groupId)).limit(1))[0];
  if (!group || group.ownerId !== actorUserId) {
    throw new Error("Only the group owner can delete the group.");
  }

  await db.delete(studyGroupNotes).where(eq(studyGroupNotes.groupId, groupId));
  await db.delete(groupJoinRequests).where(eq(groupJoinRequests.groupId, groupId));
  await db.delete(groupInvitations).where(eq(groupInvitations.groupId, groupId));
  await db.delete(studyGroupMembers).where(eq(studyGroupMembers.groupId, groupId));
  await db.delete(studyGroups).where(eq(studyGroups.id, groupId));

  return { success: true };
}

// ----------------------------------------------------
// Note Sharing to Groups
// ----------------------------------------------------

export async function shareNoteToStudyGroup(groupId: number, noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const isMember = await isUserInStudyGroup(groupId, userId);
  if (!isMember) throw new Error("You are not a member of this study group");

  // User must own the note or have saved it
  const ownedNote = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .limit(1);

  const savedNote = await db
    .select()
    .from(savedNotes)
    .where(and(eq(savedNotes.originalNoteId, noteId), eq(savedNotes.userId, userId)))
    .limit(1);

  if (!ownedNote.length && !savedNote.length) {
    throw new Error("You can only share notes from your personal library.");
  }

  // Check if already shared
  const existing = await db
    .select()
    .from(studyGroupNotes)
    .where(and(eq(studyGroupNotes.groupId, groupId), eq(studyGroupNotes.noteId, noteId)))
    .limit(1);

  if (existing.length) {
    return { success: true, alreadyShared: true };
  }

  await db.insert(studyGroupNotes).values({
    groupId,
    noteId,
    sharedByUserId: userId,
  });

  return { success: true, alreadyShared: false };
}

export async function removeNoteFromStudyGroup(groupId: number, noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const isMember = await isUserInStudyGroup(groupId, userId);
  if (!isMember) throw new Error("You are not a member of this study group");

  const actorRole = await getUserGroupRole(groupId, userId);
  const isManagerOrOwner = canManageGroup(actorRole);

  const shared = (
    await db
      .select()
      .from(studyGroupNotes)
      .where(and(eq(studyGroupNotes.groupId, groupId), eq(studyGroupNotes.noteId, noteId)))
      .limit(1)
  )[0];

  if (!shared) return { success: true };

  // Allow the author who shared it OR a group manager/owner to remove it
  if (shared.sharedByUserId !== userId && !isManagerOrOwner) {
    throw new Error("Only the user who shared the note or a group manager can remove it.");
  }

  await db
    .delete(studyGroupNotes)
    .where(and(eq(studyGroupNotes.groupId, groupId), eq(studyGroupNotes.noteId, noteId)));

  return { success: true };
}

// ==========================================
// 6. Notifications
// ==========================================

export async function createNotification(input: {
  userId: number;
  actorId?: number;
  type: string;
  title: string;
  message: string;
  linkUrl?: string;
}) {
  const db = await getDb();
  if (!db) return;

  await db.insert(notifications).values({
    userId: input.userId,
    actorId: input.actorId || null,
    type: input.type,
    title: input.title,
    message: input.message,
    linkUrl: input.linkUrl || null,
  });
}

export async function listNotificationsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(30);
}

export async function markNotificationAsRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}

export async function markAllNotificationsAsRead(userId: number) {
  const db = await getDb();
  if (!db) return;

  await db
    .update(notifications)
    .set({ isRead: 1 })
    .where(eq(notifications.userId, userId));
}

// ==========================================
// 7. AI Retrieval & Chunk Scoping
// ==========================================

export async function getAuthorizedChunks(
  studentId: number,
  options?: { collectionId?: number; subjectId?: number },
) {
  const db = await getDb();
  if (!db) return [];

  // 1. Owned active notes
  const ownNoteConditions: any[] = [eq(notes.ownerId, studentId), eq(notes.isTrash, 0)];
  if (options?.collectionId) {
    ownNoteConditions.push(eq(notes.collectionId, options.collectionId));
  }
  const ownNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(and(...ownNoteConditions));

  // 2. Saved notes in student's personal library
  const savedConditions: any[] = [eq(savedNotes.userId, studentId)];
  if (options?.collectionId) {
    savedConditions.push(eq(savedNotes.collectionId, options.collectionId));
  }
  const savedRecords = await db
    .select({ originalNoteId: savedNotes.originalNoteId })
    .from(savedNotes)
    .where(and(...savedConditions));

  const noteIds = Array.from(
    new Set([...ownNotes.map((n) => n.id), ...savedRecords.map((s) => s.originalNoteId)]),
  );

  if (!noteIds.length) return [];

  const chunks = await db
    .select()
    .from(noteChunks)
    .where(and(inArray(noteChunks.noteId, noteIds), eq(noteChunks.isActive, 1)))
    .orderBy(desc(noteChunks.createdAt));

  return chunks;
}

export async function getAuthorizedChunksForGroup(groupId: number) {
  const db = await getDb();
  if (!db) return [];

  const shared = await db
    .select({ noteId: studyGroupNotes.noteId })
    .from(studyGroupNotes)
    .where(eq(studyGroupNotes.groupId, groupId));

  if (!shared.length) return [];
  const noteIds = shared.map((s) => s.noteId);

  return db
    .select()
    .from(noteChunks)
    .where(and(inArray(noteChunks.noteId, noteIds), eq(noteChunks.isActive, 1)));
}

export async function getNotesByIds(noteIds: number[]) {
  const db = await getDb();
  if (!db || !noteIds.length) return [];
  return db.select().from(notes).where(inArray(notes.id, noteIds));
}

export async function getVisualsForNotes(noteIds: number[]) {
  const db = await getDb();
  if (!db || !noteIds.length) return [];
  return db.select().from(noteVisuals).where(inArray(noteVisuals.noteId, noteIds));
}

export async function getChunksWithoutEmbeddings(limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({ id: noteChunks.id, content: noteChunks.content })
    .from(noteChunks)
    .where(and(isNull(noteChunks.embedding), eq(noteChunks.isActive, 1)))
    .limit(limit);
}

export async function updateChunkEmbedding(chunkId: number, embedding: number[]) {
  const db = await getDb();
  if (!db) return;
  await db.update(noteChunks).set({ embedding }).where(eq(noteChunks.id, chunkId));
}

// ==========================================
// 8. AI Conversations & Audit
// ==========================================

export async function createConversation(studentId: number, subjectId?: number, title?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(aiConversations)
    .values({ studentId, subjectId: subjectId || null, title: title?.trim() || "Study conversation" })
    .returning({ id: aiConversations.id });
  return getInsertId(result);
}

export async function saveAiQuestion(input: {
  conversationId: number;
  studentId: number;
  question: string;
  answer: string;
  foundInNotes: boolean;
  model?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(aiQuestions)
    .values({
      ...input,
      foundInNotes: input.foundInNotes ? 1 : 0,
      model: input.model || null,
    })
    .returning({ id: aiQuestions.id });
  return getInsertId(result);
}

export async function listAiConversations(studentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiConversations)
    .where(eq(aiConversations.studentId, studentId))
    .orderBy(desc(aiConversations.updatedAt));
}

export async function getConversationQuestions(conversationId: number, studentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(aiQuestions)
    .where(
      and(
        eq(aiQuestions.conversationId, conversationId),
        eq(aiQuestions.studentId, studentId),
      ),
    )
    .orderBy(aiQuestions.createdAt);
}

export async function saveAnswerSources(
  questionId: number,
  sources: Array<{
    noteId: number;
    chunkId?: number;
    visualId?: number;
    sourceLabel: string;
    pageRef?: string;
    relevanceScore: number;
  }>,
) {
  const db = await getDb();
  if (!db || !sources.length) return;
  await db.insert(aiAnswerSources).values(
    sources.map((item) => ({
      questionId,
      noteId: item.noteId,
      chunkId: item.chunkId || null,
      visualId: item.visualId || null,
      sourceLabel: item.sourceLabel,
      pageRef: item.pageRef || null,
      relevanceScore: item.relevanceScore,
    })),
  );
}

export async function recordAudit(
  actorId: number,
  action: string,
  entityType: string,
  entityId?: number,
  metadata?: Record<string, unknown>,
) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditEvents).values({
    actorId,
    action,
    entityType,
    entityId: entityId || null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

export async function listAuditEvents() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(100);
}

// ==========================================
// 9. Legacy Compatibility (Subjects, Classes, Teacher Resources)
// ==========================================

export async function listSubjects(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(subjects)
    .where(
      and(
        or(eq(subjects.isGlobal, 1), eq(subjects.ownerId, ownerId)),
        eq(subjects.status, "active"),
      ),
    )
    .orderBy(desc(subjects.isGlobal), desc(subjects.updatedAt));
}

export async function createSubject(input: {
  ownerId: number;
  name: string;
  code?: string;
  term?: string;
  description?: string;
  isGlobal?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(subjects)
    .values({
      ownerId: input.ownerId,
      name: input.name,
      code: input.code ? input.code.trim().toUpperCase() : null,
      term: input.term ? input.term.trim() : null,
      description: input.description ? input.description.trim() : null,
      isGlobal: input.isGlobal !== undefined ? input.isGlobal : 0,
    })
    .returning({ id: subjects.id });
  return getInsertId(result);
}

export async function listSubjectsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subjects).orderBy(desc(subjects.updatedAt));
}

export async function listClassesForTeacher(teacherId: number) {
  const db = await getDb();
  if (!db) return [];
  const assignments = await db
    .select()
    .from(classTeachers)
    .where(eq(classTeachers.teacherId, teacherId));
  if (!assignments.length) return [];
  return db
    .select()
    .from(classes)
    .where(inArray(classes.id, assignments.map((item) => item.classId)))
    .orderBy(desc(classes.updatedAt));
}

export async function listAllClasses() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(classes).orderBy(desc(classes.updatedAt));
}

export async function createClass(input: {
  name: string;
  subjectId: number;
  term?: string;
  description?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(classes)
    .values({
      name: input.name.trim(),
      subjectId: input.subjectId,
      term: input.term ? input.term.trim() : null,
      description: input.description ? input.description.trim() : null,
      status: "active",
    })
    .returning({ id: classes.id });
  return getInsertId(result);
}

export async function assignTeacher(classId: number, teacherId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)))
    .limit(1);
  if (existing.length) return existing[0].id;
  const result = await db
    .insert(classTeachers)
    .values({ classId, teacherId })
    .returning({ id: classTeachers.id });
  return getInsertId(result);
}

export async function assignStudent(classId: number, studentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(classStudents)
    .where(and(eq(classStudents.classId, classId), eq(classStudents.studentId, studentId)))
    .limit(1);
  if (existing.length) return existing[0].id;
  const result = await db
    .insert(classStudents)
    .values({ classId, studentId })
    .returning({ id: classStudents.id });
  return getInsertId(result);
}

export async function getClassForTeacher(classId: number, teacherId: number) {
  const db = await getDb();
  if (!db) return null;
  const assigned = await db
    .select()
    .from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, teacherId)))
    .limit(1);
  if (!assigned.length) return null;
  const match = await db.select().from(classes).where(eq(classes.id, classId)).limit(1);
  return match[0] || null;
}

export async function listPublishedResources(studentId: number, search?: string) {
  const db = await getDb();
  if (!db) return [];
  const memberships = await db
    .select()
    .from(classStudents)
    .where(eq(classStudents.studentId, studentId));
  if (!memberships.length) return [];
  const conditions: any[] = [
    eq(teacherResources.status, "published"),
    inArray(
      teacherResources.classId,
      memberships.map((item) => item.classId),
    ),
  ];
  if (search?.trim()) conditions.push(ilike(teacherResources.title, `%${search.trim()}%`));
  return db
    .select()
    .from(teacherResources)
    .where(and(...conditions))
    .orderBy(desc(teacherResources.publishedAt));
}

export async function getPublishedResource(resourceId: number, studentId: number) {
  const db = await getDb();
  if (!db) return null;
  const memberships = await db
    .select()
    .from(classStudents)
    .where(eq(classStudents.studentId, studentId));
  if (!memberships.length) return null;
  const assignedClassIds = memberships.map((item) => item.classId);
  const resource = (
    await db
      .select()
      .from(teacherResources)
      .where(eq(teacherResources.id, resourceId))
      .limit(1)
  )[0];
  if (
    !resource ||
    !canViewPublishedResource(resource.status, resource.classId, assignedClassIds)
  )
    return null;
  const note = (await db.select().from(notes).where(eq(notes.id, resource.noteId)).limit(1))[0];
  const files = await db.select().from(noteFiles).where(eq(noteFiles.noteId, resource.noteId));
  return { resource, note, files };
}

export async function listTeacherResources(teacherId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(teacherResources)
    .where(eq(teacherResources.teacherId, teacherId))
    .orderBy(desc(teacherResources.updatedAt));
}

export async function listAllTeacherResources() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(teacherResources).orderBy(desc(teacherResources.updatedAt)).limit(100);
}

export async function createTeacherResource(input: {
  teacherId: number;
  classId: number;
  subjectId: number;
  noteId: number;
  title: string;
  description?: string;
  status?: "draft" | "published" | "unpublished";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(teacherResources)
    .values({
      teacherId: input.teacherId,
      classId: input.classId,
      subjectId: input.subjectId,
      noteId: input.noteId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status: input.status || "draft",
      publishedAt: input.status === "published" ? new Date() : null,
    })
    .returning({ id: teacherResources.id });
  return getInsertId(result);
}

export async function updateTeacherResource(
  resourceId: number,
  teacherId: number,
  status: "draft" | "published" | "unpublished",
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = (
    await db
      .select()
      .from(teacherResources)
      .where(eq(teacherResources.id, resourceId))
      .limit(1)
  )[0];
  if (!existing || !canManageTeacherResource(existing.teacherId, teacherId)) {
    throw new Error("You do not own this resource.");
  }
  await db
    .update(teacherResources)
    .set({
      status,
      publishedAt: status === "published" ? new Date() : existing.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(teacherResources.id, resourceId));
}

export async function replaceTeacherResource(
  resourceId: number,
  teacherId: number,
  noteId: number,
  title: string,
  description?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = (
    await db
      .select()
      .from(teacherResources)
      .where(eq(teacherResources.id, resourceId))
      .limit(1)
  )[0];
  if (!existing || !canManageTeacherResource(existing.teacherId, teacherId)) {
    throw new Error("You do not own this resource.");
  }
  await db
    .update(teacherResources)
    .set({
      noteId,
      title: title.trim(),
      description: description?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(teacherResources.id, resourceId));
}

export async function moderateTeacherResource(
  resourceId: number,
  status: "published" | "unpublished",
  actorId: number,
  reason?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db
    .update(teacherResources)
    .set({ status, updatedAt: new Date() })
    .where(eq(teacherResources.id, resourceId));
  await recordAudit(actorId, `admin_${status}_resource`, "teacher_resource", resourceId, {
    reason: reason || null,
  });
}

export async function saveResource(
  studentId: number,
  resourceId: number,
  personalSubjectId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(savedResources)
    .where(
      and(
        eq(savedResources.studentId, studentId),
        eq(savedResources.resourceId, resourceId),
      ),
    )
    .limit(1);
  if (existing.length) return existing[0].id;
  const result = await db
    .insert(savedResources)
    .values({
      studentId,
      resourceId,
      personalSubjectId: personalSubjectId || null,
    })
    .returning({ id: savedResources.id });
  return getInsertId(result);
}

export async function listSavedResources(studentId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(savedResources)
    .where(eq(savedResources.studentId, studentId))
    .orderBy(desc(savedResources.createdAt));
}
