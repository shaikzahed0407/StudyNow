CREATE TYPE "public"."class_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."note_kind" AS ENUM('rich_text', 'file');--> statement-breakpoint
CREATE TYPE "public"."note_processing_status" AS ENUM('uploaded', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."note_visibility" AS ENUM('private', 'class_material');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'student', 'teacher', 'admin');--> statement-breakpoint
CREATE TYPE "public"."subject_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."teacher_resource_status" AS ENUM('draft', 'published', 'unpublished');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending', 'disabled');--> statement-breakpoint
CREATE TABLE "aiAnswerSources" (
	"id" serial PRIMARY KEY NOT NULL,
	"questionId" integer NOT NULL,
	"noteId" integer NOT NULL,
	"chunkId" integer,
	"visualId" integer,
	"sourceLabel" varchar(240) NOT NULL,
	"pageRef" varchar(80),
	"relevanceScore" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiConversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"subjectId" integer,
	"title" varchar(220),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aiQuestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversationId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"foundInNotes" integer DEFAULT 0 NOT NULL,
	"model" varchar(120),
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditEvents" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer NOT NULL,
	"action" varchar(120) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" integer,
	"metadata" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classStudents" (
	"id" serial PRIMARY KEY NOT NULL,
	"classId" integer NOT NULL,
	"studentId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classTeachers" (
	"id" serial PRIMARY KEY NOT NULL,
	"classId" integer NOT NULL,
	"teacherId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"subjectId" integer NOT NULL,
	"term" varchar(80),
	"description" text,
	"status" "class_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteChunks" (
	"id" serial PRIMARY KEY NOT NULL,
	"noteId" integer NOT NULL,
	"pageRef" varchar(80),
	"content" text NOT NULL,
	"keywords" text,
	"chunkOrder" integer DEFAULT 0 NOT NULL,
	"isActive" integer DEFAULT 1 NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteFiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"noteId" integer NOT NULL,
	"storageKey" text NOT NULL,
	"storageUrl" text NOT NULL,
	"originalName" varchar(255) NOT NULL,
	"mimeType" varchar(160) NOT NULL,
	"sizeBytes" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteVisuals" (
	"id" serial PRIMARY KEY NOT NULL,
	"noteId" integer NOT NULL,
	"pageRef" varchar(80),
	"storageKey" text NOT NULL,
	"storageUrl" text NOT NULL,
	"caption" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"ownerId" integer NOT NULL,
	"subjectId" integer NOT NULL,
	"title" varchar(220) NOT NULL,
	"source" varchar(120),
	"tags" text,
	"kind" "note_kind" DEFAULT 'rich_text' NOT NULL,
	"visibility" "note_visibility" DEFAULT 'private' NOT NULL,
	"content" text,
	"processingStatus" "note_processing_status" DEFAULT 'uploaded' NOT NULL,
	"processingError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "savedResources" (
	"id" serial PRIMARY KEY NOT NULL,
	"studentId" integer NOT NULL,
	"resourceId" integer NOT NULL,
	"personalSubjectId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(40),
	"term" varchar(80),
	"description" text,
	"ownerId" integer NOT NULL,
	"status" "subject_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacherResources" (
	"id" serial PRIMARY KEY NOT NULL,
	"teacherId" integer NOT NULL,
	"classId" integer NOT NULL,
	"subjectId" integer NOT NULL,
	"noteId" integer NOT NULL,
	"title" varchar(220) NOT NULL,
	"description" text,
	"status" "teacher_resource_status" DEFAULT 'draft' NOT NULL,
	"publishedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'student' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
