CREATE TABLE `aiAnswerSources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`questionId` int NOT NULL,
	`noteId` int NOT NULL,
	`chunkId` int,
	`visualId` int,
	`sourceLabel` varchar(240) NOT NULL,
	`pageRef` varchar(80),
	`relevanceScore` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiAnswerSources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`subjectId` int,
	`title` varchar(220),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `aiConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `aiQuestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`studentId` int NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`foundInNotes` int NOT NULL DEFAULT 0,
	`model` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `aiQuestions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`actorId` int NOT NULL,
	`action` varchar(120) NOT NULL,
	`entityType` varchar(80) NOT NULL,
	`entityId` int,
	`metadata` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classStudents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classId` int NOT NULL,
	`studentId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classStudents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classTeachers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`classId` int NOT NULL,
	`teacherId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `classTeachers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`subjectId` int NOT NULL,
	`term` varchar(80),
	`description` text,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `classes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `noteChunks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`pageRef` varchar(80),
	`content` text NOT NULL,
	`keywords` text,
	`chunkOrder` int NOT NULL DEFAULT 0,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `noteChunks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `noteFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`originalName` varchar(255) NOT NULL,
	`mimeType` varchar(160) NOT NULL,
	`sizeBytes` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `noteFiles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `noteVisuals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`noteId` int NOT NULL,
	`pageRef` varchar(80),
	`storageKey` text NOT NULL,
	`storageUrl` text NOT NULL,
	`caption` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `noteVisuals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`subjectId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`source` varchar(120),
	`tags` text,
	`kind` enum('rich_text','file') NOT NULL DEFAULT 'rich_text',
	`visibility` enum('private','class_material') NOT NULL DEFAULT 'private',
	`content` text,
	`processingStatus` enum('uploaded','processing','ready','failed') NOT NULL DEFAULT 'uploaded',
	`processingError` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `savedResources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`studentId` int NOT NULL,
	`resourceId` int NOT NULL,
	`personalSubjectId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `savedResources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(40),
	`term` varchar(80),
	`description` text,
	`ownerId` int NOT NULL,
	`status` enum('active','archived') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teacherResources` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teacherId` int NOT NULL,
	`classId` int NOT NULL,
	`subjectId` int NOT NULL,
	`noteId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text,
	`status` enum('draft','published','unpublished') NOT NULL DEFAULT 'draft',
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `teacherResources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','student','teacher','admin') NOT NULL DEFAULT 'student';--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','pending','disabled') DEFAULT 'active' NOT NULL;