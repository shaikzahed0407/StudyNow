import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import {
  addNoteChunks,
  addNoteFile,
  addNoteVisual,
  approveTeacher,
  assignStudent,
  assignTeacher,
  changeUserPlatformRole,
  createClass,
  createCollection,
  createConversation,
  createNote,
  createStudyGroup,
  createSubject,
  createTeacherResource,
  decideInvitation,
  decideJoinRequest,
  deleteCollection,
  deleteNote,
  deleteStudyGroup,
  demoteManager,
  discoverPublicGroups,
  getAuthorizedChunks,
  getAuthorizedChunksForGroup,
  getClassForTeacher,
  getConversationQuestions,
  getNotesByIds,
  getNoteWithFiles,
  getPublicUserProfile,
  getPublishedResource,
  getStudyGroupWithDetails,
  getUserById,
  getUserByEmail,
  getUserByOpenId,
  getVisualsForNotes,
  inviteUserToGroup,
  isUserInStudyGroup,
  joinStudyGroupByCode,
  listAiConversations,
  listAllClasses,
  listAllTeacherResources,
  listAuditEvents,
  listClassesForTeacher,
  listCollections,
  listInvitationsForUser,
  listJoinRequestsForGroup,
  listNotesForUser,
  listNotificationsForUser,
  listPendingTeachers,
  listPublishedResources,
  listRoleChangeAudits,
  listSavedResources,
  listStudyGroupsForUser,
  listSubjects,
  listSubjectsForAdmin,
  listTeacherResources,
  listUsers,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  moderateTeacherResource,
  moveNoteToCollection,
  promoteToManager,
  recordAudit,
  rejectTeacher,
  removeGroupMember,
  removeManager,
  removeNoteFromStudyGroup,
  renameCollection,
  replaceTeacherResource,
  requestToJoinGroup,
  restoreNote,
  saveAiQuestion,
  saveAnswerSources,
  saveResource,
  saveSharedNoteToPersonal,
  shareNoteToStudyGroup,
  toggleFavoriteNote,
  transferGroupOwnership,
  trashNote,
  unsaveNote,
  updateNoteProcessing,
  updateTeacherResource,
  updateUserAccess,
  updateUserProfile,
  upsertUser,
} from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import type { DocumentProcessingResult } from "./services/documentProcessor";
import { extractDocumentVisualAssets } from "./documentVisuals";
import { hybridRetrieveChunks } from "./services/hybridRetrieval";
import type { RankedChunk } from "./services/hybridRetrieval";
import { backfillMissingEmbeddings } from "./services/backfillEmbeddings";
import { canAccessTeacherPortal } from "./authorization";

const role = (value: string) => (value === "user" ? "student" : value);

const workspaceProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.status === "disabled") {
    throw new TRPCError({ code: "FORBIDDEN", message: "This account is disabled." });
  }
  return next({ ctx });
});

const studentProcedure = workspaceProcedure.use(({ ctx, next }) => {
  return next({ ctx });
});

const teacherProcedure = workspaceProcedure.use(({ ctx, next }) => {
  const currentRole = role(ctx.user.role);
  if (!canAccessTeacherPortal(currentRole, ctx.user.teacherApproval)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        ctx.user.teacherApproval === "pending"
          ? "Teacher account pending administrator approval."
          : "Teacher portal access is required.",
    });
  }
  return next({ ctx });
});

const searchInput = z.object({
  search: z.string().max(160).optional(),
  collectionId: z.number().int().positive().optional(),
  filter: z.enum(["all", "favorites", "uncategorized", "trash"]).optional(),
});

const noteInput = z.object({
  collectionId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(220),
  source: z.string().trim().max(120).optional(),
  tags: z.string().trim().max(500).optional(),
  content: z.string().max(50000).optional(),
});

const fileInput = z.object({
  collectionId: z.number().int().positive().optional(),
  subjectId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(220),
  source: z.string().trim().max(120).optional(),
  tags: z.string().trim().max(500).optional(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(160),
  base64: z.string().min(1),
});

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-180);

const aiRateLimits = new Map<number, { startedAt: number; count: number }>();
const enforceAiRateLimit = (userId: number) => {
  const now = Date.now();
  const current = aiRateLimits.get(userId);
  if (!current || now - current.startedAt >= 60_000) {
    aiRateLimits.set(userId, { startedAt: now, count: 1 });
    return;
  }
  if (current.count >= 30) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Please wait a minute before asking more study questions.",
    });
  }
  current.count += 1;
};

const supportedMimeTypes = new Set([
  "text/plain",
  "text/markdown",
  "text/html",
  "application/pdf",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
]);

export function chunkText(content: string) {
  const normalized = content.trim();
  if (!normalized) return [];
  const size = 1800;
  const chunks: Array<{
    content: string;
    chunkOrder: number;
    pageRef?: string;
    keywords?: string;
  }> = [];
  for (let index = 0; index < normalized.length; index += size) {
    const part = normalized.slice(index, index + size);
    chunks.push({
      content: part,
      chunkOrder: chunks.length,
      pageRef: `Section ${chunks.length + 1}`,
      keywords: part
        .toLowerCase()
        .split(/\W+/)
        .filter(Boolean)
        .slice(0, 24)
        .join(","),
    });
  }
  return chunks;
}

export function rankChunks(chunks: any[], question: string) {
  const terms = question
    .toLowerCase()
    .split(/\W+/)
    .filter((term) => term.length > 2);
  return chunks
    .map((chunk) => {
      const haystack = `${chunk.content} ${chunk.keywords || ""}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...chunk, relevanceScore: score };
    })
    .filter((chunk) => chunk.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 6);
}

async function chooseModel() {
  if (ENV.geminiModel) {
    return ENV.geminiModel;
  }
  try {
    const result = await listLLMModels();
    const ids = result.data.map((model) => model.id);
    return (
      ids.find((id) => id.includes("gemini-3.7-flash")) ||
      ids.find((id) => id.includes("gemini-3.6-flash")) ||
      ids[0]
    );
  } catch {
    return "gemini-3.7-flash";
  }
}

export function sourceReferenceMatches(
  chunkPageRef: string | undefined,
  visualPageRef: string | null | undefined,
) {
  if (!chunkPageRef || !visualPageRef) return false;
  const chunkRef = chunkPageRef.trim().toLowerCase();
  const visualRef = visualPageRef.trim().toLowerCase();
  if (chunkRef === visualRef) return true;
  const chunkNumber = chunkRef.match(/(?:page|slide|section)\s*(\d+)/)?.[1];
  const visualNumber = visualRef.match(/(?:page|slide|section)\s*(\d+)/)?.[1];
  return Boolean(chunkNumber && visualNumber && chunkNumber === visualNumber);
}

export function validateCitations(chunks: any[], sourceNotes: any[]) {
  const noteIds = new Set(sourceNotes.map((note) => note.id));
  return chunks.filter(
    (chunk) =>
      noteIds.has(chunk.noteId) &&
      Number.isInteger(chunk.id) &&
      typeof chunk.pageRef === "string" &&
      chunk.pageRef.trim().length > 0 &&
      typeof chunk.content === "string" &&
      chunk.content.trim().length > 0,
  );
}

async function extractUploadedFile(input: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  storageKey: string;
}): Promise<DocumentProcessingResult> {
  if (
    input.mimeType.startsWith("text/") ||
    input.mimeType === "text/markdown" ||
    input.mimeType === "text/html"
  ) {
    return { chunks: chunkText(input.buffer.toString("utf8")), visuals: [] };
  }

  // Multimodal Gemini extraction
  try {
    const model = await chooseModel();
    const dataUri = `data:${input.mimeType};base64,${input.buffer.toString("base64")}`;
    const filePart = input.mimeType.startsWith("image/")
      ? { type: "image_url" as const, image_url: { url: dataUri, detail: "high" as const } }
      : { type: "file_url" as const, file_url: { url: dataUri, mime_type: input.mimeType as any } };

    const response = await invokeLLM({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a careful educational document analyzer. Extract only visible or readable information from the supplied study source. Return JSON with chunks and visual references, preserving real page or slide references when visible. For diagrams, charts, figures, or meaningful images, describe the visual precisely and keep it as evidence. Do not invent visuals that are not present.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze ${input.fileName}. Create concise searchable chunks with real page or slide references when available. Return visual references for diagrams, charts, figures, or meaningful images, including the page or slide and a concise description. Do not invent missing content.`,
            },
            filePart,
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "note_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              chunks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pageRef: { type: "string" },
                    content: { type: "string" },
                    keywords: { type: "string" },
                  },
                  required: ["pageRef", "content", "keywords"],
                  additionalProperties: false,
                },
              },
              visuals: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    pageRef: { type: "string" },
                    caption: { type: "string" },
                  },
                  required: ["pageRef", "caption"],
                  additionalProperties: false,
                },
              },
            },
            required: ["chunks", "visuals"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = response.choices[0]?.message?.content;
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw) as {
        chunks?: Array<{ pageRef?: string; content?: string; keywords?: string }>;
        visuals?: Array<{ pageRef?: string; caption?: string }>;
      };
      const chunks = (parsed.chunks || [])
        .filter((chunk) => chunk.content?.trim())
        .map((chunk, index) => ({
          content: chunk.content!.trim(),
          pageRef: chunk.pageRef || `Section ${index + 1}`,
          keywords: chunk.keywords || "",
          chunkOrder: index,
        }));
      const visualRefs = (parsed.visuals || [])
        .filter((visual) => visual.caption?.trim())
        .map((visual) => ({
          pageRef: visual.pageRef || "Visual reference",
          caption: visual.caption!.trim(),
        }));

      let assets: Array<{ pageRef: string; storageKey: string; storageUrl: string; caption: string }> = [];
      try {
        assets = await extractDocumentVisualAssets({
          buffer: input.buffer,
          mimeType: input.mimeType,
          storageKey: input.storageKey,
          references: visualRefs,
        });
      } catch (error) {
        console.warn("[DocumentVisuals] Could not extract visual assets:", error);
      }

      const visuals = assets.length
        ? assets.map((asset) => ({
            pageRef: asset.pageRef,
            caption: asset.caption,
            asset: { storageKey: asset.storageKey, storageUrl: asset.storageUrl },
          }))
        : visualRefs;

      if (chunks.length) {
        return { chunks, visuals };
      }
    }
  } catch (error) {
    console.warn(
      "[DocumentExtraction] AI extraction failed or key invalid, falling back to document chunking:",
      error,
    );
  }

  // Fallback: extract readable text from PDF files directly
  if (input.mimeType === "application/pdf") {
    try {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const pdf = await getDocument({ data: new Uint8Array(input.buffer), useWorkerFetch: false }).promise;
      const pdfChunks: Array<{ content: string; pageRef: string; keywords: string; chunkOrder: number }> = [];
      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = (textContent.items as any[])
          .map((item) => item?.str || "")
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (pageText) {
          pdfChunks.push({
            content: pageText,
            pageRef: `Page ${pageNum}`,
            keywords: "",
            chunkOrder: pageNum - 1,
          });
        }
      }
      if (pdfChunks.length) {
        return { chunks: pdfChunks, visuals: [] };
      }
    } catch (pdfErr) {
      console.warn("[DocumentExtraction] PDF text extraction fallback failed:", pdfErr);
    }
  }

  return { chunks: chunkText(`Uploaded document: ${input.fileName}`), visuals: [] };
}

export const appRouter = router({
  system: systemRouter,

  // ==========================================
  // Auth & Multi-Account Switching
  // ==========================================
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    login: publicProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100).default("Student Demo"),
          email: z.string().email().optional(),
          role: z.enum(["student", "teacher", "admin", "user"]).default("student"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const normalizedRole = input.role === "user" ? "student" : input.role;
        const openId = input.email
          ? `user_${input.email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
          : `demo_${normalizedRole}`;

        const defaultName =
          input.name ||
          (normalizedRole === "teacher"
            ? "Professor Smith"
            : normalizedRole === "admin"
              ? "System Administrator"
              : "Demo Student");

        // Self-registered teachers are marked 'pending', students and admins 'approved'
        const teacherApproval = normalizedRole === "teacher" ? "pending" : "approved";

        await upsertUser({
          openId,
          name: defaultName,
          email: input.email || null,
          role: normalizedRole,
          status: "active",
          teacherApproval,
          loginMethod: "local",
          lastSignedIn: new Date(),
        });

        // Retrieve existing session cookie to link accounts if switching/adding
        const cookies = sdk.parseCookies(ctx.req.headers.cookie);
        const existingToken = cookies.get(COOKIE_NAME);
        let existingAccounts: string[] = [];
        if (existingToken) {
          const verified = await sdk.verifySession(existingToken);
          if (verified) existingAccounts = verified.accounts;
        }

        const sessionToken = await sdk.createSessionToken(openId, {
          name: defaultName,
          email: input.email,
          // Deduplicate to prevent repeated logins accumulating duplicate openId entries
          accounts: Array.from(new Set([...existingAccounts, openId])),
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        const user = await getUserByOpenId(openId);
        return { success: true, user, token: sessionToken };
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    listAccounts: workspaceProcedure.query(async ({ ctx }) => {
      const cookies = sdk.parseCookies(ctx.req.headers.cookie);
      const token = cookies.get(COOKIE_NAME);
      const verified = await sdk.verifySession(token);
      const openIds = verified?.accounts || [ctx.user.openId];

      const allUsers = await listUsers();
      return allUsers.filter((u) => openIds.includes(u.openId));
    }),
    switchAccount: workspaceProcedure
      .input(z.object({ openId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const cookies = sdk.parseCookies(ctx.req.headers.cookie);
        const token = cookies.get(COOKIE_NAME);

        const switched = await sdk.switchSessionAccount(token, input.openId);
        if (!switched) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Cannot switch to this account or session expired.",
          });
        }

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, switched.token, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return { success: true, user: switched.user, token: switched.token };
      }),
  }),

  // ==========================================
  // Profiles
  // ==========================================
  profiles: router({
    getProfile: workspaceProcedure.query(({ ctx }) => ctx.user),
    updateProfile: workspaceProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(100).optional(),
          avatarUrl: z.string().url().max(1000).or(z.literal("")).optional(),
          bio: z.string().trim().max(1000).optional(),
          externalLinks: z.string().max(2000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const updated = await updateUserProfile(ctx.user.id, input);
        return { success: true, user: updated };
      }),
    getPublicProfile: workspaceProcedure
      .input(z.object({ userId: z.number().int().positive() }))
      .query(async ({ input }) => {
        const profile = await getPublicUserProfile(input.userId);
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "User not found." });
        return profile;
      }),
  }),

  // ==========================================
  // Personal Collections (Raindrop-style)
  // ==========================================
  collections: router({
    list: workspaceProcedure.query(({ ctx }) => listCollections(ctx.user.id)),
    create: workspaceProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(160),
          color: z.string().trim().max(32).optional(),
          icon: z.string().trim().max(64).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createCollection({ userId: ctx.user.id, ...input });
        return { id };
      }),
    rename: workspaceProcedure
      .input(
        z.object({
          collectionId: z.number().int().positive(),
          name: z.string().trim().min(1).max(160),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return renameCollection(input.collectionId, ctx.user.id, input.name);
      }),
    delete: workspaceProcedure
      .input(z.object({ collectionId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return deleteCollection(input.collectionId, ctx.user.id);
      }),
  }),

  // ==========================================
  // Personal Notes & Library Organization
  // ==========================================
  notes: router({
    list: workspaceProcedure
      .input(searchInput.optional())
      .query(({ ctx, input }) =>
        listNotesForUser(ctx.user.id, {
          search: input?.search,
          collectionId: input?.collectionId,
          filter: input?.filter,
        }),
      ),
    get: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const details = await getNoteWithFiles(input.noteId, ctx.user.id, ctx.user.role);
        if (!details) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found or access denied." });
        return details;
      }),
    createText: workspaceProcedure.input(noteInput).mutation(async ({ ctx, input }) => {
      const id = await createNote({
        ownerId: ctx.user.id,
        collectionId: input.collectionId,
        title: input.title,
        source: input.source,
        tags: input.tags,
        content: input.content || "",
        kind: "rich_text",
        processingStatus: "ready",
      });
      await addNoteChunks(id, chunkText(input.content || input.title));
      await recordAudit(ctx.user.id, "create_note", "note", id, { kind: "rich_text" });
      return { id };
    }),
    createFile: workspaceProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
      if (!supportedMimeTypes.has(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This file type is not supported yet." });
      }
      const raw = input.base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      if (buffer.byteLength > 15 * 1024 * 1024) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 15 MB or smaller." });
      }

      const id = await createNote({
        ownerId: ctx.user.id,
        collectionId: input.collectionId,
        title: input.title,
        source: input.source,
        tags: input.tags,
        kind: "file",
        processingStatus: "processing",
      });

      try {
        const uploaded = await storagePut(
          `users/${ctx.user.id}/notes/${safeFileName(input.fileName)}`,
          buffer,
          input.mimeType,
        );
        await addNoteFile({
          noteId: id,
          storageKey: uploaded.key,
          storageUrl: uploaded.url,
          originalName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: buffer.byteLength,
        });
        const extracted = await extractUploadedFile({
          fileName: input.fileName,
          mimeType: input.mimeType,
          buffer,
          storageKey: uploaded.key,
        });
        await addNoteChunks(id, extracted.chunks.length ? extracted.chunks : chunkText(input.title));
        for (const visual of extracted.visuals || []) {
          const asset = visual.asset || { storageKey: uploaded.key, storageUrl: uploaded.url };
          await addNoteVisual({
            noteId: id,
            pageRef: visual.pageRef,
            storageKey: asset.storageKey,
            storageUrl: asset.storageUrl,
            caption: visual.caption,
          });
        }
        if (input.mimeType.startsWith("image/") && !(extracted.visuals || []).length) {
          await addNoteVisual({
            noteId: id,
            storageKey: uploaded.key,
            storageUrl: uploaded.url,
            caption: `Visual evidence from ${input.fileName}`,
          });
        }
        const extractedContent = extracted.chunks
          .map((c) => c.content)
          .filter(Boolean)
          .join("\n\n");
        await updateNoteProcessing(id, "ready", undefined, extractedContent || undefined);
      } catch (error) {
        await updateNoteProcessing(
          id,
          "failed",
          error instanceof Error ? error.message : "Upload processing failed",
        );
        throw error;
      }
      await recordAudit(ctx.user.id, "upload_note_file", "note", id, {
        fileName: input.fileName,
        mimeType: input.mimeType,
      });
      return { id };
    }),
    favorite: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return toggleFavoriteNote(input.noteId, ctx.user.id);
      }),
    moveToCollection: workspaceProcedure
      .input(
        z.object({
          noteId: z.number().int().positive(),
          collectionId: z.number().int().positive().nullable(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return moveNoteToCollection(input.noteId, ctx.user.id, input.collectionId);
      }),
    trash: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const trashed = await trashNote(input.noteId, ctx.user.id);
        if (!trashed) throw new TRPCError({ code: "FORBIDDEN", message: "Only the note owner can trash a note." });
        return { success: true };
      }),
    restore: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const restored = await restoreNote(input.noteId, ctx.user.id);
        if (!restored) throw new TRPCError({ code: "FORBIDDEN", message: "Only the note owner can restore a note." });
        return { success: true };
      }),
    delete: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const deleted = await deleteNote(input.noteId, ctx.user.id);
        if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "That note does not exist or is not yours." });
        await recordAudit(ctx.user.id, "delete_note", "note", input.noteId);
        return { success: true };
      }),
  }),

  // ==========================================
  // Note Sharing & Saved Notes
  // ==========================================
  sharing: router({
    shareToGroup: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          noteId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return shareNoteToStudyGroup(input.groupId, input.noteId, ctx.user.id);
      }),
    removeFromGroup: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          noteId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return removeNoteFromStudyGroup(input.groupId, input.noteId, ctx.user.id);
      }),
    saveToPersonal: workspaceProcedure
      .input(
        z.object({
          noteId: z.number().int().positive(),
          collectionId: z.number().int().positive().optional(),
          customTitle: z.string().trim().max(220).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return saveSharedNoteToPersonal(ctx.user.id, input.noteId, input.collectionId, input.customTitle);
      }),
    unsave: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return unsaveNote(ctx.user.id, input.noteId);
      }),
    getDownloadUrl: workspaceProcedure
      .input(z.object({ noteId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const details = await getNoteWithFiles(input.noteId, ctx.user.id);
        if (!details || !details.files.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "File not found or access denied." });
        }
        const file = details.files[0];
        const signedUrl = await storageGetSignedUrl(file.storageKey);
        return { url: signedUrl, originalName: file.originalName, mimeType: file.mimeType };
      }),
  }),

  // ==========================================
  // Groups & Membership (NO CHAT)
  // ==========================================
  groups: router({
    list: workspaceProcedure.query(({ ctx }) => listStudyGroupsForUser(ctx.user.id)),
    get: workspaceProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const group = await getStudyGroupWithDetails(input.groupId, ctx.user.id);
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Group not found or access denied" });
        return group;
      }),
    create: workspaceProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(160),
          description: z.string().trim().max(500).optional(),
          imageUrl: z.string().url().max(1000).optional(),
          type: z.enum(["class", "study_circle"]).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return createStudyGroup({ ...input, ownerId: ctx.user.id });
      }),
    discover: workspaceProcedure
      .input(z.object({ search: z.string().max(100).optional() }).optional())
      .query(({ ctx, input }) => discoverPublicGroups(input?.search, ctx.user.id)),
    joinByCode: workspaceProcedure
      .input(z.object({ code: z.string().trim().min(1).max(20) }))
      .mutation(async ({ ctx, input }) => {
        return joinStudyGroupByCode(input.code, ctx.user.id);
      }),
    shareNote: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          noteId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return shareNoteToStudyGroup(input.groupId, input.noteId, ctx.user.id);
      }),
    removeNote: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          noteId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return removeNoteFromStudyGroup(input.groupId, input.noteId, ctx.user.id);
      }),
    requestJoin: workspaceProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return requestToJoinGroup(input.groupId, ctx.user.id);
      }),
    decideJoinRequest: workspaceProcedure
      .input(
        z.object({
          requestId: z.number().int().positive(),
          accept: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return decideJoinRequest(input.requestId, input.accept, ctx.user.id);
      }),
    listJoinRequests: workspaceProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return listJoinRequestsForGroup(input.groupId, ctx.user.id);
      }),
    invite: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          inviteeId: z.number().int().positive().optional(),
          inviteeEmail: z.string().email().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        let targetId = input.inviteeId;
        if (!targetId && input.inviteeEmail) {
          const user = await getUserByEmail(input.inviteeEmail);
          if (!user) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "No user found with that email address. Make sure they are registered on StudyNow.",
            });
          }
          targetId = user.id;
        }
        if (!targetId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Please specify an invitee ID or registered email address.",
          });
        }
        return inviteUserToGroup(input.groupId, ctx.user.id, targetId);
      }),
    decideInvitation: workspaceProcedure
      .input(
        z.object({
          invitationId: z.number().int().positive(),
          accept: z.boolean(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return decideInvitation(input.invitationId, input.accept, ctx.user.id);
      }),
    listInvitations: workspaceProcedure.query(({ ctx }) => listInvitationsForUser(ctx.user.id)),
    promoteManager: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          targetUserId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return promoteToManager(input.groupId, input.targetUserId, ctx.user.id);
      }),
    demoteManager: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          targetUserId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return removeManager(input.groupId, input.targetUserId, ctx.user.id);
      }),
    transferOwnership: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          newOwnerId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return transferGroupOwnership(input.groupId, input.newOwnerId, ctx.user.id);
      }),
    removeMember: workspaceProcedure
      .input(
        z.object({
          groupId: z.number().int().positive(),
          targetUserId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return removeGroupMember(input.groupId, input.targetUserId, ctx.user.id);
      }),
    leave: workspaceProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return removeGroupMember(input.groupId, ctx.user.id, ctx.user.id);
      }),
    delete: workspaceProcedure
      .input(z.object({ groupId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return deleteStudyGroup(input.groupId, ctx.user.id);
      }),
  }),

  // ==========================================
  // Notifications
  // ==========================================
  notifications: router({
    list: workspaceProcedure.query(({ ctx }) => listNotificationsForUser(ctx.user.id)),
    markRead: workspaceProcedure
      .input(z.object({ notificationId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return markNotificationAsRead(input.notificationId, ctx.user.id);
      }),
    markAllRead: workspaceProcedure.mutation(async ({ ctx }) => {
      return markAllNotificationsAsRead(ctx.user.id);
    }),
  }),

  // ==========================================
  // AI Study Assistant (Preserved Grounded RAG)
  // ==========================================
  ai: router({
    history: studentProcedure.query(({ ctx }) => listAiConversations(ctx.user.id)),
    conversation: studentProcedure
      .input(z.object({ conversationId: z.number().int().positive() }))
      .query(({ ctx, input }) => getConversationQuestions(input.conversationId, ctx.user.id)),
    ask: studentProcedure
      .input(
        z.object({
          question: z.string().trim().min(3).max(2000),
          collectionId: z.number().int().positive().optional(),
          groupId: z.number().int().positive().optional(),
          subjectId: z.number().int().positive().optional(),
          conversationId: z.number().int().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        enforceAiRateLimit(ctx.user.id);
        if (input.groupId) {
          const isMember = await isUserInStudyGroup(input.groupId, ctx.user.id);
          if (!isMember) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "You are not a member of this study group.",
            });
          }
        }

        // Retrieve authorized chunks: either group-scoped or user-personal-scoped (own notes + saved notes)
        const authorizedChunks = input.groupId
          ? await getAuthorizedChunksForGroup(input.groupId)
          : await getAuthorizedChunks(ctx.user.id, {
              collectionId: input.collectionId,
              subjectId: input.subjectId,
            });

        const ranked: RankedChunk[] = await hybridRetrieveChunks(
          authorizedChunks as any,
          input.question,
        );

        const sourceNoteIds = Array.from(new Set(ranked.map((chunk) => chunk.noteId)));
        const sourceNotes = await getNotesByIds(sourceNoteIds);
        const visuals = await getVisualsForNotes(sourceNoteIds);
        const validatedRanked = validateCitations(ranked, sourceNotes);

        let conversationId = input.conversationId;
        if (
          conversationId &&
          !(await getConversationQuestions(conversationId, ctx.user.id)).length
        ) {
          conversationId = undefined;
        }
        conversationId =
          conversationId ||
          (await createConversation(ctx.user.id, input.subjectId, input.question.slice(0, 90)));

        let answer =
          "I couldn't find that in your stored notes. Try selecting a different collection or saving relevant material first.";
        let model: string | undefined;

        if (validatedRanked.length) {
          model = await chooseModel();
          const evidence = validatedRanked
            .map((chunk, index) => {
              const note = sourceNotes.find((item) => item.id === chunk.noteId);
              return `[Source ${index + 1}] ${note?.title || "Stored note"} — ${chunk.pageRef || "Note section"}\n${chunk.content}`;
            })
            .join("\n\n");
          try {
            const response = await invokeLLM({
              model,
              messages: [
                {
                  role: "system",
                  content: `You are StudyNow's grounded study assistant.

Answer using only the supplied authorized evidence.
Do not invent facts, citations, page numbers, slide numbers, diagrams, or sources.
If the supplied evidence is insufficient to answer the question, clearly state that the answer was not found in the stored study material.
Do not use unsupported outside information.
When possible, identify the relevant source/page/slide using the [Source N] labels provided.
Use concise markdown with a direct answer.`,
                },
                {
                  role: "user",
                  content: `Question: ${input.question}\n\nAuthorized evidence:\n${evidence}`,
                },
              ],
            });
            const content = response.choices[0]?.message?.content;
            if (typeof content === "string" && content.trim()) answer = content;
          } catch {
            answer = `I found relevant material, but the AI answer service is temporarily unavailable. Review these cited notes: ${validatedRanked.map((chunk) => chunk.pageRef || "note section").join(", ")}.`;
          }
        }

        const questionId = await saveAiQuestion({
          conversationId,
          studentId: ctx.user.id,
          question: input.question,
          answer,
          foundInNotes: validatedRanked.length > 0,
          model,
        });

        await saveAnswerSources(
          questionId,
          validatedRanked.map((chunk) => {
            const note = sourceNotes.find((item) => item.id === chunk.noteId);
            const visual = visuals.find(
              (item) =>
                item.noteId === chunk.noteId && sourceReferenceMatches(chunk.pageRef, item.pageRef),
            );
            return {
              noteId: chunk.noteId,
              chunkId: chunk.id,
              visualId: visual?.id,
              sourceLabel: note?.title || "Stored note",
              pageRef: chunk.pageRef || undefined,
              relevanceScore: Math.round(chunk.relevanceScore * 100),
            };
          }),
        );

        return {
          conversationId,
          answer,
          foundInNotes: validatedRanked.length > 0,
          sources: validatedRanked.map((chunk) => {
            const note = sourceNotes.find((item) => item.id === chunk.noteId);
            const visual = visuals.find(
              (item) =>
                item.noteId === chunk.noteId && sourceReferenceMatches(chunk.pageRef, item.pageRef),
            );
            return {
              noteId: chunk.noteId,
              title: note?.title || "Stored note",
              pageRef: chunk.pageRef || "Note section",
              visualUrl: visual?.storageUrl || null,
              visualIsImage: Boolean(
                visual && /\.(png|jpe?g|webp|gif|svg)$/i.test(visual.storageKey),
              ),
              visualCaption: visual?.caption || null,
            };
          }),
        };
      }),
  }),

  // ==========================================
  // Teacher Portal (Clean & Focused)
  // ==========================================
  teacher: router({
    status: workspaceProcedure.query(({ ctx }) => ({
      role: ctx.user.role,
      teacherApproval: ctx.user.teacherApproval,
      hasAccess: canAccessTeacherPortal(ctx.user.role, ctx.user.teacherApproval),
    })),
    managedGroups: teacherProcedure.query(({ ctx }) => listStudyGroupsForUser(ctx.user.id)),
    classes: teacherProcedure.query(({ ctx }) => listClassesForTeacher(ctx.user.id)),
    resources: teacherProcedure.query(({ ctx }) => listTeacherResources(ctx.user.id)),
    createResource: teacherProcedure
      .input(
        z.object({
          classId: z.number().int().positive(),
          subjectId: z.number().int().positive(),
          noteId: z.number().int().positive(),
          title: z.string().trim().min(1).max(220),
          description: z.string().trim().max(600).optional(),
          status: z.enum(["draft", "published"]).default("draft"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const managedClass = await getClassForTeacher(input.classId, ctx.user.id);
        if (!managedClass) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only publish to classes assigned to you.",
          });
        }
        const ownedNote = await getNoteWithFiles(input.noteId, ctx.user.id);
        if (!ownedNote) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only publish notes that belong to your account.",
          });
        }
        const id = await createTeacherResource({ teacherId: ctx.user.id, ...input });
        await recordAudit(
          ctx.user.id,
          input.status === "published" ? "publish_resource" : "save_resource_draft",
          "teacher_resource",
          id,
        );
        return { id };
      }),
    replaceResource: teacherProcedure
      .input(
        z.object({
          resourceId: z.number().int().positive(),
          noteId: z.number().int().positive(),
          title: z.string().trim().min(1).max(220),
          description: z.string().trim().max(600).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const ownedNote = await getNoteWithFiles(input.noteId, ctx.user.id);
        if (!ownedNote) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only replace a resource with a note that belongs to your account.",
          });
        }
        await replaceTeacherResource(
          input.resourceId,
          ctx.user.id,
          input.noteId,
          input.title,
          input.description,
        );
        return { success: true };
      }),
    setStatus: teacherProcedure
      .input(
        z.object({
          resourceId: z.number().int().positive(),
          status: z.enum(["draft", "published", "unpublished"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await updateTeacherResource(input.resourceId, ctx.user.id, input.status);
        return { success: true };
      }),
  }),

  // ==========================================
  // Platform Admin
  // ==========================================
  admin: router({
    users: adminProcedure.query(() => listUsers()),
    resources: adminProcedure.query(() => listAllTeacherResources()),
    moderateResource: adminProcedure
      .input(
        z.object({
          resourceId: z.number().int().positive(),
          status: z.enum(["published", "unpublished"]),
          reason: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await moderateTeacherResource(input.resourceId, input.status, ctx.user.id, input.reason);
        return { success: true };
      }),
    pendingTeachers: adminProcedure.query(() => listPendingTeachers()),
    approveTeacher: adminProcedure
      .input(z.object({ teacherUserId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return approveTeacher(ctx.user.id, input.teacherUserId);
      }),
    rejectTeacher: adminProcedure
      .input(z.object({ teacherUserId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        return rejectTeacher(ctx.user.id, input.teacherUserId);
      }),
    changeRole: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["student", "teacher", "admin", "user"]),
          reason: z.string().trim().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        return changeUserPlatformRole(ctx.user.id, input.userId, input.role, input.reason);
      }),
    updateUser: adminProcedure
      .input(
        z.object({
          userId: z.number().int().positive(),
          role: z.enum(["student", "teacher", "admin", "user"]),
          status: z.enum(["active", "pending", "disabled"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.userId === ctx.user.id && input.status === "disabled") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You cannot disable your own administrator account.",
          });
        }
        await updateUserAccess(input.userId, input.role, input.status, ctx.user.id);
        return { success: true };
      }),
    audit: adminProcedure.query(() => listRoleChangeAudits()),
    backfillEmbeddings: adminProcedure.mutation(async () => {
      return backfillMissingEmbeddings();
    }),
    // Legacy support for classes/subjects queries
    subjects: adminProcedure.query(() => listSubjectsForAdmin()),
    classes: adminProcedure.query(() => listAllClasses()),
    createClass: adminProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(160),
          subjectId: z.number().int().positive(),
          term: z.string().trim().max(80).optional(),
          description: z.string().trim().max(600).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const id = await createClass(input);
        await recordAudit(ctx.user.id, "create_class", "class", id, input);
        return { id };
      }),
    assignTeacher: adminProcedure
      .input(
        z.object({
          classId: z.number().int().positive(),
          teacherId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assignTeacher(input.classId, input.teacherId);
        return { success: true };
      }),
    assignStudent: adminProcedure
      .input(
        z.object({
          classId: z.number().int().positive(),
          studentId: z.number().int().positive(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await assignStudent(input.classId, input.studentId);
        return { success: true };
      }),
  }),

  // ==========================================
  // Legacy Library & Dashboard Routes (Backward Compat)
  // ==========================================
  dashboard: router({
    summary: workspaceProcedure.query(async ({ ctx }) => {
      const currentRole = role(ctx.user.role);
      const collectionsList = await listCollections(ctx.user.id);
      const notesList = await listNotesForUser(ctx.user.id);
      const groupsList = await listStudyGroupsForUser(ctx.user.id);
      return { role: currentRole, collections: collectionsList, notes: notesList, groups: groupsList };
    }),
  }),
  subjects: router({
    list: workspaceProcedure.query(({ ctx }) => listSubjects(ctx.user.id)),
    create: workspaceProcedure
      .input(
        z.object({
          name: z.string().trim().min(1).max(160),
          code: z.string().trim().max(40).optional(),
          term: z.string().trim().max(80).optional(),
          description: z.string().trim().max(600).optional(),
          isGlobal: z.boolean().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isAdmin = role(ctx.user.role) === "admin";
        const isGlobal = isAdmin ? (input.isGlobal !== false ? 1 : 0) : 0;
        const code = input.code ? input.code.trim().toUpperCase() : undefined;
        const id = await createSubject({
          ownerId: ctx.user.id,
          name: input.name,
          code,
          term: input.term,
          description: input.description,
          isGlobal,
        });
        await recordAudit(
          ctx.user.id,
          isGlobal ? "create_global_subject" : "create_subject",
          "subject",
          id,
          { name: input.name, code, isGlobal: Boolean(isGlobal) },
        );
        return { id };
      }),
    adminList: adminProcedure.query(() => listSubjectsForAdmin()),
  }),
  library: router({
    published: studentProcedure
      .input(z.object({ search: z.string().max(160).optional() }).optional())
      .query(({ ctx, input }) => listPublishedResources(ctx.user.id, input?.search)),
    get: studentProcedure
      .input(z.object({ resourceId: z.number().int().positive() }))
      .query(({ ctx, input }) => getPublishedResource(input.resourceId, ctx.user.id)),
    saved: studentProcedure.query(({ ctx }) => listSavedResources(ctx.user.id)),
    save: studentProcedure
      .input(
        z.object({
          resourceId: z.number().int().positive(),
          personalSubjectId: z.number().int().positive().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const accessible = await getPublishedResource(input.resourceId, ctx.user.id);
        if (!accessible) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You can only save published resources from classes you are assigned to.",
          });
        }
        const id = await saveResource(ctx.user.id, input.resourceId, input.personalSubjectId);
        return { id };
      }),
  }),
});

export type AppRouter = typeof appRouter;
