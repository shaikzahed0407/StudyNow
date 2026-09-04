CREATE TYPE "public"."group_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."group_type" AS ENUM('class', 'study_circle');--> statement-breakpoint
CREATE TABLE "study_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"groupId" integer NOT NULL,
	"userId" integer NOT NULL,
	"role" "group_role" DEFAULT 'member' NOT NULL,
	"joinedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_group_notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"groupId" integer NOT NULL,
	"noteId" integer NOT NULL,
	"sharedByUserId" integer NOT NULL,
	"sharedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"code" varchar(16) NOT NULL,
	"description" text,
	"type" "group_type" DEFAULT 'study_circle' NOT NULL,
	"subjectId" integer,
	"ownerId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "study_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "subjects" ADD COLUMN "isGlobal" integer DEFAULT 0 NOT NULL;