import {
  customType,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * pgvector custom type for Drizzle ORM.
 * Stores/retrieves float arrays as PostgreSQL vector(768) values.
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(768)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .replace(/[\[\]]/g, "")
      .split(",")
      .map(Number);
  },
});

export const roleEnum = pgEnum("role", ["user", "student", "teacher", "admin"]);
export const userStatusEnum = pgEnum("user_status", ["active", "pending", "disabled"]);
export const subjectStatusEnum = pgEnum("subject_status", ["active", "archived"]);
export const classStatusEnum = pgEnum("class_status", ["active", "archived"]);
export const noteKindEnum = pgEnum("note_kind", ["rich_text", "file"]);
export const noteVisibilityEnum = pgEnum("note_visibility", ["private", "class_material"]);
export const noteProcessingStatusEnum = pgEnum("note_processing_status", [
  "uploaded",
  "processing",
  "ready",
  "failed",
]);
export const teacherResourceStatusEnum = pgEnum("teacher_resource_status", [
  "draft",
  "published",
  "unpublished",
]);
export const groupTypeEnum = pgEnum("group_type", ["class", "study_circle"]);
export const groupRoleEnum = pgEnum("group_role", ["owner", "admin", "manager", "member"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  avatarUrl: text("avatarUrl"),
  bio: text("bio"),
  externalLinks: text("externalLinks"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("student").notNull(),
  status: userStatusEnum("status").default("active").notNull(),
  teacherApproval: varchar("teacherApproval", { length: 32 }).default("approved").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const subjects = pgTable("subjects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 40 }),
  term: varchar("term", { length: 80 }),
  description: text("description"),
  ownerId: integer("ownerId").notNull(),
  isGlobal: integer("isGlobal").default(0).notNull(),
  status: subjectStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  subjectId: integer("subjectId").notNull(),
  term: varchar("term", { length: 80 }),
  description: text("description"),
  status: classStatusEnum("status").default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const classTeachers = pgTable("classTeachers", {
  id: serial("id").primaryKey(),
  classId: integer("classId").notNull(),
  teacherId: integer("teacherId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const classStudents = pgTable("classStudents", {
  id: serial("id").primaryKey(),
  classId: integer("classId").notNull(),
  studentId: integer("studentId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const collections = pgTable("collections", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  color: varchar("color", { length: 32 }),
  icon: varchar("icon", { length: 64 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  ownerId: integer("ownerId").notNull(),
  collectionId: integer("collectionId"),
  subjectId: integer("subjectId"),
  title: varchar("title", { length: 220 }).notNull(),
  source: varchar("source", { length: 120 }),
  tags: text("tags"),
  kind: noteKindEnum("kind").default("rich_text").notNull(),
  visibility: noteVisibilityEnum("visibility").default("private").notNull(),
  isFavorite: integer("isFavorite").default(0).notNull(),
  isTrash: integer("isTrash").default(0).notNull(),
  deletedAt: timestamp("deletedAt"),
  content: text("content"),
  processingStatus: noteProcessingStatusEnum("processingStatus").default("uploaded").notNull(),
  processingError: text("processingError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const noteFiles = pgTable("noteFiles", {
  id: serial("id").primaryKey(),
  noteId: integer("noteId").notNull(),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  originalName: varchar("originalName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 160 }).notNull(),
  sizeBytes: integer("sizeBytes").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const noteChunks = pgTable("noteChunks", {
  id: serial("id").primaryKey(),
  noteId: integer("noteId").notNull(),
  pageRef: varchar("pageRef", { length: 80 }),
  content: text("content").notNull(),
  keywords: text("keywords"),
  chunkOrder: integer("chunkOrder").default(0).notNull(),
  isActive: integer("isActive").default(1).notNull(),
  embedding: vector("embedding"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const noteVisuals = pgTable("noteVisuals", {
  id: serial("id").primaryKey(),
  noteId: integer("noteId").notNull(),
  pageRef: varchar("pageRef", { length: 80 }),
  storageKey: text("storageKey").notNull(),
  storageUrl: text("storageUrl").notNull(),
  caption: text("caption"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const teacherResources = pgTable("teacherResources", {
  id: serial("id").primaryKey(),
  teacherId: integer("teacherId").notNull(),
  classId: integer("classId").notNull(),
  subjectId: integer("subjectId").notNull(),
  noteId: integer("noteId").notNull(),
  title: varchar("title", { length: 220 }).notNull(),
  description: text("description"),
  status: teacherResourceStatusEnum("status").default("draft").notNull(),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const savedResources = pgTable("savedResources", {
  id: serial("id").primaryKey(),
  studentId: integer("studentId").notNull(),
  resourceId: integer("resourceId").notNull(),
  personalSubjectId: integer("personalSubjectId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiConversations = pgTable("aiConversations", {
  id: serial("id").primaryKey(),
  studentId: integer("studentId").notNull(),
  subjectId: integer("subjectId"),
  title: varchar("title", { length: 220 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const aiQuestions = pgTable("aiQuestions", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversationId").notNull(),
  studentId: integer("studentId").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  foundInNotes: integer("foundInNotes").default(0).notNull(),
  model: varchar("model", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const aiAnswerSources = pgTable("aiAnswerSources", {
  id: serial("id").primaryKey(),
  questionId: integer("questionId").notNull(),
  noteId: integer("noteId").notNull(),
  chunkId: integer("chunkId"),
  visualId: integer("visualId"),
  sourceLabel: varchar("sourceLabel", { length: 240 }).notNull(),
  pageRef: varchar("pageRef", { length: 80 }),
  relevanceScore: integer("relevanceScore").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = pgTable("auditEvents", {
  id: serial("id").primaryKey(),
  actorId: integer("actorId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  entityType: varchar("entityType", { length: 80 }).notNull(),
  entityId: integer("entityId"),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const studyGroups = pgTable("study_groups", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 16 }).notNull().unique(),
  description: text("description"),
  imageUrl: text("imageUrl"),
  type: groupTypeEnum("type").default("study_circle").notNull(),
  subjectId: integer("subjectId"),
  ownerId: integer("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export const studyGroupMembers = pgTable("study_group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull(),
  userId: integer("userId").notNull(),
  role: groupRoleEnum("role").default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});

export const studyGroupNotes = pgTable("study_group_notes", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull(),
  noteId: integer("noteId").notNull(),
  sharedByUserId: integer("sharedByUserId").notNull(),
  sharedAt: timestamp("sharedAt").defaultNow().notNull(),
});

export const groupJoinRequests = pgTable("group_join_requests", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull(),
  userId: integer("userId").notNull(),
  status: varchar("status", { length: 32 }).default("pending").notNull(), // pending | accepted | rejected
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
  decidedByUserId: integer("decidedByUserId"),
});

export const groupInvitations = pgTable("group_invitations", {
  id: serial("id").primaryKey(),
  groupId: integer("groupId").notNull(),
  inviterId: integer("inviterId").notNull(),
  inviteeId: integer("inviteeId").notNull(),
  status: varchar("status", { length: 32 }).default("pending").notNull(), // pending | accepted | rejected | auto_joined
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
});

export const savedNotes = pgTable("saved_notes", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  originalNoteId: integer("originalNoteId").notNull(),
  collectionId: integer("collectionId"),
  customTitle: varchar("customTitle", { length: 220 }),
  isFavorite: integer("isFavorite").default(0).notNull(),
  savedAt: timestamp("savedAt").defaultNow().notNull(),
});

export const roleChangeAudits = pgTable("role_change_audits", {
  id: serial("id").primaryKey(),
  actorId: integer("actorId").notNull(),
  targetUserId: integer("targetUserId").notNull(),
  oldRole: varchar("oldRole", { length: 32 }).notNull(),
  newRole: varchar("newRole", { length: 32 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  actorId: integer("actorId"),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  message: text("message").notNull(),
  linkUrl: text("linkUrl"),
  isRead: integer("isRead").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = typeof collections.$inferInsert;
export type Subject = typeof subjects.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type InsertNote = typeof notes.$inferInsert;
export type TeacherResource = typeof teacherResources.$inferSelect;
export type AiQuestion = typeof aiQuestions.$inferSelect;
export type StudyGroup = typeof studyGroups.$inferSelect;
export type StudyGroupMember = typeof studyGroupMembers.$inferSelect;
export type StudyGroupNote = typeof studyGroupNotes.$inferSelect;
export type GroupJoinRequest = typeof groupJoinRequests.$inferSelect;
export type GroupInvitation = typeof groupInvitations.$inferSelect;
export type SavedNote = typeof savedNotes.$inferSelect;
export type RoleChangeAudit = typeof roleChangeAudits.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
