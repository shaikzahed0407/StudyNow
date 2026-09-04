import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
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
  InsertUser,
  noteChunks,
  noteFiles,
  notes,
  noteVisuals,
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
  canManageTeacherResource,
  canViewPublishedResource,
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
  if (Array.isArray(result)) {
    if (result.length > 0) {
      const first = result[0];
      if (typeof first === "object" && first !== null) {
        if ("id" in first) {
          id = (first as { id: unknown }).id;
        } else if ("insertId" in first) {
          id = (first as { insertId?: unknown }).insertId;
        }
      }
    }
  } else if (typeof result === "object" && result !== null) {
    if ("id" in result) {
      id = (result as { id: unknown }).id;
    } else if ("insertId" in result) {
      id = (result as { insertId?: unknown }).insertId;
    }
  }

  const num = Number(id);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Insert did not return a valid ID (got ${JSON.stringify(id ?? result)})`);
  }
  return num;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === "demo_admin") {
    values.role = "admin";
    updateSet.role = "admin";
  }

  if (user.status !== undefined) {
    values.status = user.status;
    updateSet.status = user.status;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();

  await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

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

export async function listSubjectsForAdmin() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(subjects).orderBy(desc(subjects.updatedAt));
}

export async function listNotesForStudent(studentId: number, search?: string, subjectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [eq(notes.ownerId, studentId)];
  if (subjectId) conditions.push(eq(notes.subjectId, subjectId));
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      or(
        ilike(notes.title, term),
        ilike(notes.tags, term),
        ilike(notes.source, term),
        ilike(notes.content, term),
      ),
    );
  }
  return db.select().from(notes).where(and(...conditions)).orderBy(desc(notes.updatedAt));
}

export async function createNote(input: {
  ownerId: number;
  subjectId: number;
  title: string;
  source?: string;
  tags?: string;
  kind: "rich_text" | "file";
  content?: string;
  processingStatus?: "uploaded" | "processing" | "ready" | "failed";
  visibility?: "private" | "class_material";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(notes)
    .values({
      ...input,
      source: input.source || null,
      tags: input.tags || null,
      content: input.content || null,
      processingStatus: input.processingStatus || "uploaded",
      visibility: input.visibility || "private",
    })
    .returning({ id: notes.id });
  return getInsertId(result);
}

export async function getNoteWithFiles(noteId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return null;
  const note = (await db.select().from(notes).where(eq(notes.id, noteId)).limit(1))[0];
  if (!note || !canAccessOwnedNote(note.ownerId, ownerId)) return null;
  const files = await db.select().from(noteFiles).where(eq(noteFiles.noteId, noteId));
  const visuals = await db.select().from(noteVisuals).where(eq(noteVisuals.noteId, noteId));
  return { note, files, visuals };
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
  await db.insert(noteFiles).values(input);
}

export async function updateNoteProcessing(
  noteId: number,
  processingStatus: "uploaded" | "processing" | "ready" | "failed",
  processingError?: string,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(notes)
    .set({ processingStatus, processingError: processingError || null })
    .where(eq(notes.id, noteId));
}

export async function deleteNote(noteId: number, ownerId: number) {
  const db = await getDb();
  if (!db) return false;
  const note = (await db.select().from(notes).where(eq(notes.id, noteId)).limit(1))[0];
  if (!note || !canAccessOwnedNote(note.ownerId, ownerId)) return false;
  await db.delete(noteChunks).where(eq(noteChunks.noteId, noteId));
  await db.delete(noteFiles).where(eq(noteFiles.noteId, noteId));
  await db.delete(noteVisuals).where(eq(noteVisuals.noteId, noteId));
  await db.delete(notes).where(and(eq(notes.id, noteId), eq(notes.ownerId, ownerId)));
  return true;
}

export async function addNoteChunks(
  noteId: number,
  chunks: Array<{ pageRef?: string; content: string; keywords?: string; chunkOrder: number }>,
) {
  const db = await getDb();
  if (!db || !chunks.length) return;
  await db.update(noteChunks).set({ isActive: 0 }).where(eq(noteChunks.noteId, noteId));
  await db.insert(noteChunks).values(
    chunks.map((chunk) => ({
      noteId,
      pageRef: chunk.pageRef || null,
      content: chunk.content,
      keywords: chunk.keywords || null,
      chunkOrder: chunk.chunkOrder,
      isActive: 1,
    })),
  );
}

export async function addNoteVisual(input: {
  noteId: number;
  pageRef?: string;
  storageKey: string;
  storageUrl: string;
  caption?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(noteVisuals).values({
    ...input,
    pageRef: input.pageRef || null,
    caption: input.caption || null,
  });
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
  const status = input.status || "draft";
  const result = await db
    .insert(teacherResources)
    .values({
      ...input,
      description: input.description || null,
      status,
      publishedAt: status === "published" ? new Date() : null,
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
  if (!db) return;
  await db
    .update(teacherResources)
    .set({ status, publishedAt: status === "published" ? new Date() : null })
    .where(
      and(
        eq(teacherResources.id, resourceId),
        eq(teacherResources.teacherId, teacherId),
      ),
    );
}

export async function replaceTeacherResource(
  resourceId: number,
  teacherId: number,
  noteId: number,
  title: string,
  description?: string,
) {
  const db = await getDb();
  if (!db) return;
  const resource = (
    await db
      .select()
      .from(teacherResources)
      .where(eq(teacherResources.id, resourceId))
      .limit(1)
  )[0];
  if (!resource || !canManageTeacherResource(resource.teacherId, teacherId)) return;
  await db
    .update(teacherResources)
    .set({ noteId, title, description: description || null })
    .where(
      and(
        eq(teacherResources.id, resourceId),
        eq(teacherResources.teacherId, teacherId),
      ),
    );
}

export async function moderateTeacherResource(
  resourceId: number,
  status: "published" | "unpublished",
  actorId: number,
  reason?: string,
) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(teacherResources)
    .set({ status, publishedAt: status === "published" ? new Date() : null })
    .where(eq(teacherResources.id, resourceId));
  await db.insert(auditEvents).values({
    actorId,
    action:
      status === "unpublished"
        ? "moderate_unpublish_resource"
        : "moderate_restore_resource",
    entityType: "teacher_resource",
    entityId: resourceId,
    metadata: reason ? JSON.stringify({ reason }) : null,
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

export async function getAuthorizedChunks(studentId: number, subjectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const ownNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(
      and(
        eq(notes.ownerId, studentId),
        subjectId ? eq(notes.subjectId, subjectId) : sql`1=1`,
      ),
    );
  const savedResourceNotes = await db
    .select({ noteId: teacherResources.noteId })
    .from(savedResources)
    .innerJoin(
      teacherResources,
      eq(savedResources.resourceId, teacherResources.id),
    )
    .innerJoin(
      classStudents,
      and(
        eq(classStudents.classId, teacherResources.classId),
        eq(classStudents.studentId, studentId),
      ),
    )
    .where(
      and(
        eq(savedResources.studentId, studentId),
        eq(teacherResources.status, "published"),
        subjectId
          ? or(
              eq(savedResources.personalSubjectId, subjectId),
              eq(teacherResources.subjectId, subjectId),
            )
          : sql`1=1`,
      ),
    );
  const noteIds = Array.from(
    new Set([...ownNotes.map((item) => item.id), ...savedResourceNotes.map((item) => item.noteId)]),
  );
  if (!noteIds.length) return [];
  const chunks = await db
    .select()
    .from(noteChunks)
    .where(and(inArray(noteChunks.noteId, noteIds), eq(noteChunks.isActive, 1)))
    .orderBy(desc(noteChunks.createdAt));
  return chunks.filter((chunk) => noteIds.indexOf(chunk.noteId) >= 0 && chunk.isActive === 1);
}

export async function getNotesByIds(noteIds: number[]) {
  const db = await getDb();
  if (!db || !noteIds.length) return [];
  return db.select().from(notes).where(inArray(notes.id, noteIds));
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
      ...input,
      term: input.term || null,
      description: input.description || null,
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
    .where(
      and(
        eq(classTeachers.classId, classId),
        eq(classTeachers.teacherId, teacherId),
      ),
    )
    .limit(1);
  if (!existing.length) await db.insert(classTeachers).values({ classId, teacherId });
}

export async function assignStudent(classId: number, studentId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db
    .select()
    .from(classStudents)
    .where(
      and(
        eq(classStudents.classId, classId),
        eq(classStudents.studentId, studentId),
      ),
    )
    .limit(1);
  if (!existing.length) await db.insert(classStudents).values({ classId, studentId });
}

export async function getClassForTeacher(classId: number, teacherId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db
    .select({ classRow: classes })
    .from(classes)
    .innerJoin(classTeachers, eq(classTeachers.classId, classes.id))
    .where(
      and(
        eq(classes.id, classId),
        eq(classTeachers.teacherId, teacherId),
      ),
    )
    .limit(1);
  return result[0]?.classRow || null;
}

export async function getVisualsForNotes(noteIds: number[]) {
  const db = await getDb();
  if (!db || !noteIds.length) return [];
  return db.select().from(noteVisuals).where(inArray(noteVisuals.noteId, noteIds));
}

export async function createConversation(
  studentId: number,
  subjectId?: number,
  title?: string,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db
    .insert(aiConversations)
    .values({
      studentId,
      subjectId: subjectId || null,
      title: title || "Untitled study session",
    })
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
    .values({ ...input, foundInNotes: input.foundInNotes ? 1 : 0, model: input.model || null })
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
    .orderBy(desc(aiConversations.updatedAt))
    .limit(30);
}

export async function getConversationQuestions(conversationId: number, studentId: number) {
  const db = await getDb();
  if (!db) return [];
  const conversation = (
    await db
      .select()
      .from(aiConversations)
      .where(
        and(
          eq(aiConversations.id, conversationId),
          eq(aiConversations.studentId, studentId),
        ),
      )
      .limit(1)
  )[0];
  if (!conversation) return [];
  const questions = await db
    .select()
    .from(aiQuestions)
    .where(
      and(
        eq(aiQuestions.conversationId, conversationId),
        eq(aiQuestions.studentId, studentId),
      ),
    )
    .orderBy(aiQuestions.createdAt);
  return questions;
}

export async function saveAnswerSources(
  questionId: number,
  sources: Array<{
    noteId: number;
    chunkId?: number;
    visualId?: number;
    sourceLabel: string;
    pageRef?: string;
    relevanceScore?: number;
  }>,
) {
  const db = await getDb();
  if (!db || !sources.length) return;
  await db.insert(aiAnswerSources).values(
    sources.map((source) => ({
      ...source,
      questionId,
      chunkId: source.chunkId || null,
      visualId: source.visualId || null,
      pageRef: source.pageRef || null,
      relevanceScore: source.relevanceScore || 0,
    })),
  );
}

export async function listUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function updateUserAccess(
  userId: number,
  role: "student" | "teacher" | "admin" | "user",
  status: "active" | "pending" | "disabled",
  actorId: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(users).set({ role, status }).where(eq(users.id, userId));
  await db.insert(auditEvents).values({
    actorId,
    action: "update_user_access",
    entityType: "user",
    entityId: userId,
    metadata: JSON.stringify({ role, status }),
  });
}

export async function recordAudit(
  actorId: number,
  action: string,
  entityType: string,
  entityId?: number,
  metadata?: unknown,
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
  return db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(50);
}

// -------------------------------------------------------------
// Study Groups & Note Circles ("WhatsApp for Notes")
// -------------------------------------------------------------

function generateGroupCode(name: string): string {
  const prefix = name
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 4)
    .toUpperCase() || "GRP";
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${randomSuffix}`;
}

export async function createStudyGroup(input: {
  name: string;
  description?: string;
  type?: "class" | "study_circle";
  subjectId?: number;
  ownerId: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  let code = generateGroupCode(input.name);
  // Ensure code uniqueness
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
      type: input.type || "study_circle",
      subjectId: input.subjectId || null,
      ownerId: input.ownerId,
    })
    .returning({ id: studyGroups.id });

  const groupId = getInsertId(result);

  // Add owner as member with 'owner' role
  await db.insert(studyGroupMembers).values({
    groupId,
    userId: input.ownerId,
    role: "owner",
  });

  return { id: groupId, code };
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
    throw new Error("No study group found with this join code");
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

export async function shareNoteToStudyGroup(groupId: number, noteId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const isMember = await isUserInStudyGroup(groupId, userId);
  if (!isMember) throw new Error("You are not a member of this study group");

  // Verify the user owns the note
  const ownedNote = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.ownerId, userId)))
    .limit(1);

  if (!ownedNote.length) {
    throw new Error("You can only share your own notes");
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

  // Allow note author or group owner to remove
  const group = await db.select().from(studyGroups).where(eq(studyGroups.id, groupId)).limit(1);
  const isOwner = group[0]?.ownerId === userId;

  const conditions = [
    eq(studyGroupNotes.groupId, groupId),
    eq(studyGroupNotes.noteId, noteId),
  ];

  if (!isOwner) {
    conditions.push(eq(studyGroupNotes.sharedByUserId, userId));
  }

  await db.delete(studyGroupNotes).where(and(...conditions));
  return { success: true };
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
