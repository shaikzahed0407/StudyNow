-- Redesign Architecture Migration
ALTER TYPE "group_role" ADD VALUE IF NOT EXISTS 'manager';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatarUrl" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bio" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "externalLinks" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "teacherApproval" varchar(32) DEFAULT 'approved' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "collections" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "name" varchar(160) NOT NULL,
  "color" varchar(32),
  "icon" varchar(64),
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "collectionId" integer;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "isFavorite" integer DEFAULT 0 NOT NULL;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "isTrash" integer DEFAULT 0 NOT NULL;
ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp;
ALTER TABLE "notes" ALTER COLUMN "subjectId" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "study_groups" ADD COLUMN IF NOT EXISTS "imageUrl" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_join_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "groupId" integer NOT NULL,
  "userId" integer NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "decidedAt" timestamp,
  "decidedByUserId" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "groupId" integer NOT NULL,
  "inviterId" integer NOT NULL,
  "inviteeId" integer NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "decidedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "saved_notes" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "originalNoteId" integer NOT NULL,
  "collectionId" integer,
  "customTitle" varchar(220),
  "isFavorite" integer DEFAULT 0 NOT NULL,
  "savedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "role_change_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "actorId" integer NOT NULL,
  "targetUserId" integer NOT NULL,
  "oldRole" varchar(32) NOT NULL,
  "newRole" varchar(32) NOT NULL,
  "reason" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL,
  "actorId" integer,
  "type" varchar(64) NOT NULL,
  "title" varchar(200) NOT NULL,
  "message" text NOT NULL,
  "linkUrl" text,
  "isRead" integer DEFAULT 0 NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
