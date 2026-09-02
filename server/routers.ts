import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  getUserByOpenId,
  upsertUser,
  addNoteChunks,
  addNoteFile,
  addNoteVisual,
  assignStudent,
  assignTeacher,
  createClass,
  createConversation,
  createNote,
  createSubject,
  createTeacherResource,
  deleteNote,
  getAuthorizedChunks,
  getClassForTeacher,
  getConversationQuestions,
  getNotesByIds,
  getNoteWithFiles,
  getPublishedResource,
  getVisualsForNotes,
  listAllClasses,
  listAllTeacherResources,
  listAuditEvents,
  listClassesForTeacher,
  listAiConversations,
  listNotesForStudent,
  listPublishedResources,
  listSavedResources,
  listSubjects,
  listSubjectsForAdmin,
  listTeacherResources,
  moderateTeacherResource,
  listUsers,
  recordAudit,
  replaceTeacherResource,
  saveAiQuestion,
  saveAnswerSources,
  saveResource,
  updateNoteProcessing,
  updateTeacherResource,
  updateUserAccess,
} from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import type { DocumentProcessingResult } from "./services/documentProcessor";
import { extractDocumentVisualAssets } from "./documentVisuals";
import { tryJavaExtraction } from "./services/javaDocClient";

const role = (value: string) => (value === "user" ? "student" : value);
const workspaceProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.status === "disabled") throw new TRPCError({ code: "FORBIDDEN", message: "This account is disabled." });
  if (!["student", "teacher", "admin"].includes(role(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Your account has no active portal." });
  return next({ ctx });
});
const studentProcedure = workspaceProcedure.use(({ ctx, next }) => {
  if (!["student", "admin"].includes(role(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Student workspace access is required." });
  return next({ ctx });
});
const teacherProcedure = workspaceProcedure.use(({ ctx, next }) => {
  if (!["teacher", "admin"].includes(role(ctx.user.role))) throw new TRPCError({ code: "FORBIDDEN", message: "Teacher workspace access is required." });
  return next({ ctx });
});

const searchInput = z.object({ search: z.string().max(160).optional(), subjectId: z.number().int().positive().optional() });
const noteInput = z.object({
  subjectId: z.number().int().positive(),
  title: z.string().trim().min(1).max(220),
  source: z.string().trim().max(120).optional(),
  tags: z.string().trim().max(500).optional(),
  content: z.string().max(50000).optional(),
});
const fileInput = z.object({
  subjectId: z.number().int().positive(),
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
  if (!current || now - current.startedAt >= 60_000) { aiRateLimits.set(userId, { startedAt: now, count: 1 }); return; }
  if (current.count >= 30) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Please wait a minute before asking more study questions." });
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
  const chunks: Array<{ content: string; chunkOrder: number; pageRef?: string; keywords?: string }> = [];
  for (let index = 0; index < normalized.length; index += size) {
    const part = normalized.slice(index, index + size);
    chunks.push({ content: part, chunkOrder: chunks.length, pageRef: `Section ${chunks.length + 1}`, keywords: part.toLowerCase().split(/\W+/).filter(Boolean).slice(0, 24).join(",") });
  }
  return chunks;
}

export function rankChunks(chunks: any[], question: string) {
  const terms = question.toLowerCase().split(/\W+/).filter(term => term.length > 2);
  return chunks
    .map(chunk => {
      const haystack = `${chunk.content} ${chunk.keywords || ""}`.toLowerCase();
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
      return { ...chunk, relevanceScore: score };
    })
    .filter(chunk => chunk.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 6);
}

async function chooseModel() {
  try {
    const result = await listLLMModels();
    const ids = result.data.map((model) => model.id);
    return (
      ids.find((id) => id.includes("gemini-3.7-flash")) ||
      ids.find((id) => id.includes("gemini-3.5-flash-lite")) ||
      ids[0]
    );
  } catch {
    return undefined;
  }
}

export function sourceReferenceMatches(chunkPageRef: string | undefined, visualPageRef: string | null | undefined) {
  if (!chunkPageRef || !visualPageRef) return false;
  const chunkRef = chunkPageRef.trim().toLowerCase();
  const visualRef = visualPageRef.trim().toLowerCase();
  if (chunkRef === visualRef) return true;
  const chunkNumber = chunkRef.match(/(?:page|slide|section)\s*(\d+)/)?.[1];
  const visualNumber = visualRef.match(/(?:page|slide|section)\s*(\d+)/)?.[1];
  return Boolean(chunkNumber && visualNumber && chunkNumber === visualNumber);
}

export function validateCitations(chunks: any[], sourceNotes: any[]) {
  const noteIds = new Set(sourceNotes.map(note => note.id));
  return chunks.filter(chunk => noteIds.has(chunk.noteId) && Number.isInteger(chunk.id) && typeof chunk.pageRef === "string" && chunk.pageRef.trim().length > 0 && typeof chunk.content === "string" && chunk.content.trim().length > 0);
}

async function extractUploadedFile(input: { fileName: string; mimeType: string; buffer: Buffer; storageKey: string }): Promise<DocumentProcessingResult> {
  if (input.mimeType.startsWith("text/") || input.mimeType === "text/markdown" || input.mimeType === "text/html") {
    return { chunks: chunkText(input.buffer.toString("utf8")), visuals: [] };
  }

  // 1. PDF/PPTX go through the Java (Apache PDFBox/POI) extraction service first
  const javaResult = await tryJavaExtraction(input);
  if (javaResult && javaResult.chunks.length) return javaResult;

  // 2. Multimodal Gemini extraction
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
    console.warn("[DocumentExtraction] AI extraction failed or key invalid, falling back to document chunking:", error);
  }

  return { chunks: chunkText(`Uploaded document: ${input.fileName}`), visuals: [] };
}

export const appRouter = router({
  system: systemRouter,
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
        const openId = input.email
          ? `user_${input.email.toLowerCase().replace(/[^a-z0-9]/g, "_")}`
          : `demo_${input.role}_${Date.now()}`;

        await upsertUser({
          openId,
          name: input.name,
          email: input.email || null,
          role: input.role === "user" ? "student" : input.role,
          status: "active",
          loginMethod: "local",
          lastSignedIn: new Date(),
        });

        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          email: input.email,
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
  }),
  dashboard: router({
    summary: workspaceProcedure.query(async ({ ctx }) => {
      const currentRole = role(ctx.user.role);
      const subjects = await listSubjects(ctx.user.id);
      const notes = await listNotesForStudent(ctx.user.id);
      const classes = currentRole === "teacher" || currentRole === "admin" ? await listClassesForTeacher(ctx.user.id) : [];
      const resources = currentRole === "teacher" || currentRole === "admin" ? await listTeacherResources(ctx.user.id) : await listPublishedResources(ctx.user.id);
      return { role: currentRole, subjects, notes, classes, resources };
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
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const isGlobal = role(ctx.user.role) === "admin" ? 1 : 0;
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
  notes: router({
    list: workspaceProcedure.input(searchInput.optional()).query(({ ctx, input }) => listNotesForStudent(ctx.user.id, input?.search, input?.subjectId)),
    get: workspaceProcedure.input(z.object({ noteId: z.number().int().positive() })).query(({ ctx, input }) => getNoteWithFiles(input.noteId, ctx.user.id)),
    createText: workspaceProcedure.input(noteInput).mutation(async ({ ctx, input }) => {
      const id = await createNote({ ownerId: ctx.user.id, ...input, kind: "rich_text", content: input.content || "", processingStatus: "ready" });
      await addNoteChunks(id, chunkText(input.content || input.title));
      await recordAudit(ctx.user.id, "create_note", "note", id, { kind: "rich_text" });
      return { id };
    }),
    createFile: workspaceProcedure.input(fileInput).mutation(async ({ ctx, input }) => {
      if (!supportedMimeTypes.has(input.mimeType)) throw new TRPCError({ code: "BAD_REQUEST", message: "This file type is not supported yet." });
      const raw = input.base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(raw, "base64");
      if (buffer.byteLength > 15 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Files must be 15 MB or smaller." });
      const id = await createNote({ ownerId: ctx.user.id, subjectId: input.subjectId, title: input.title, source: input.source, tags: input.tags, kind: "file", processingStatus: "processing" });
      try {
        const uploaded = await storagePut(`users/${ctx.user.id}/notes/${safeFileName(input.fileName)}`, buffer, input.mimeType);
        await addNoteFile({ noteId: id, storageKey: uploaded.key, storageUrl: uploaded.url, originalName: input.fileName, mimeType: input.mimeType, sizeBytes: buffer.byteLength });
        const extracted = await extractUploadedFile({ fileName: input.fileName, mimeType: input.mimeType, buffer, storageKey: uploaded.key });
        await addNoteChunks(id, extracted.chunks.length ? extracted.chunks : chunkText(input.title));
        for (const visual of extracted.visuals || []) { const asset = visual.asset || { storageKey: uploaded.key, storageUrl: uploaded.url }; await addNoteVisual({ noteId: id, pageRef: visual.pageRef, storageKey: asset.storageKey, storageUrl: asset.storageUrl, caption: visual.caption }); }
        if (input.mimeType.startsWith("image/") && !(extracted.visuals || []).length) await addNoteVisual({ noteId: id, storageKey: uploaded.key, storageUrl: uploaded.url, caption: `Visual evidence from ${input.fileName}` });
        await updateNoteProcessing(id, "ready");
      } catch (error) {
        await updateNoteProcessing(id, "failed", error instanceof Error ? error.message : "Upload processing failed");
        throw error;
      }
      await recordAudit(ctx.user.id, "upload_note_file", "note", id, { fileName: input.fileName, mimeType: input.mimeType });
      return { id };
    }),
    delete: workspaceProcedure.input(z.object({ noteId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const deleted = await deleteNote(input.noteId, ctx.user.id);
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "That note does not exist or is not yours." });
      await recordAudit(ctx.user.id, "delete_note", "note", input.noteId);
      return { success: true };
    }),
  }),
  teacher: router({
    classes: teacherProcedure.query(({ ctx }) => listClassesForTeacher(ctx.user.id)),
    resources: teacherProcedure.query(({ ctx }) => listTeacherResources(ctx.user.id)),
    createResource: teacherProcedure.input(z.object({ classId: z.number().int().positive(), subjectId: z.number().int().positive(), noteId: z.number().int().positive(), title: z.string().trim().min(1).max(220), description: z.string().trim().max(600).optional(), status: z.enum(["draft", "published"]).default("draft") })).mutation(async ({ ctx, input }) => {
      const managedClass = await getClassForTeacher(input.classId, ctx.user.id);
      if (!managedClass) throw new TRPCError({ code: "FORBIDDEN", message: "You can only publish to classes assigned to you." });
      const ownedNote = await getNoteWithFiles(input.noteId, ctx.user.id);
      if (!ownedNote) throw new TRPCError({ code: "FORBIDDEN", message: "You can only publish notes that belong to your account." });
      const id = await createTeacherResource({ teacherId: ctx.user.id, ...input });
      await recordAudit(ctx.user.id, input.status === "published" ? "publish_resource" : "save_resource_draft", "teacher_resource", id);
      return { id };
    }),
    replaceResource: teacherProcedure.input(z.object({ resourceId: z.number().int().positive(), noteId: z.number().int().positive(), title: z.string().trim().min(1).max(220), description: z.string().trim().max(600).optional() })).mutation(async ({ ctx, input }) => {
      const ownedNote = await getNoteWithFiles(input.noteId, ctx.user.id);
      if (!ownedNote) throw new TRPCError({ code: "FORBIDDEN", message: "You can only replace a resource with a note that belongs to your account." });
      await replaceTeacherResource(input.resourceId, ctx.user.id, input.noteId, input.title, input.description);
      await recordAudit(ctx.user.id, "replace_resource_source", "teacher_resource", input.resourceId, { noteId: input.noteId });
      return { success: true };
    }),
    setStatus: teacherProcedure.input(z.object({ resourceId: z.number().int().positive(), status: z.enum(["draft", "published", "unpublished"]) })).mutation(async ({ ctx, input }) => {
      await updateTeacherResource(input.resourceId, ctx.user.id, input.status);
      await recordAudit(ctx.user.id, `${input.status}_resource`, "teacher_resource", input.resourceId);
      return { success: true };
    }),
  }),
  library: router({
    published: studentProcedure.input(z.object({ search: z.string().max(160).optional() }).optional()).query(({ ctx, input }) => listPublishedResources(ctx.user.id, input?.search)),
    get: studentProcedure.input(z.object({ resourceId: z.number().int().positive() })).query(({ ctx, input }) => getPublishedResource(input.resourceId, ctx.user.id)),
    saved: studentProcedure.query(({ ctx }) => listSavedResources(ctx.user.id)),
    save: studentProcedure.input(z.object({ resourceId: z.number().int().positive(), personalSubjectId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const permitted = await getPublishedResource(input.resourceId, ctx.user.id);
      if (!permitted) throw new TRPCError({ code: "FORBIDDEN", message: "You can only save resources published to your assigned classes." });
      if (input.personalSubjectId && !(await listSubjects(ctx.user.id)).some(subject => subject.id === input.personalSubjectId)) throw new TRPCError({ code: "FORBIDDEN", message: "Choose one of your own personal subjects." });
      const id = await saveResource(ctx.user.id, input.resourceId, input.personalSubjectId);
      await recordAudit(ctx.user.id, "save_teacher_resource", "teacher_resource", input.resourceId, { savedResourceId: id });
      return { id };
    }),
  }),
  ai: router({
    history: studentProcedure.query(({ ctx }) => listAiConversations(ctx.user.id)),
    conversation: studentProcedure.input(z.object({ conversationId: z.number().int().positive() })).query(({ ctx, input }) => getConversationQuestions(input.conversationId, ctx.user.id)),
    ask: studentProcedure.input(z.object({ question: z.string().trim().min(3).max(2000), subjectId: z.number().int().positive().optional(), conversationId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      enforceAiRateLimit(ctx.user.id);
      const chunks = await getAuthorizedChunks(ctx.user.id, input.subjectId);
      const rankedCandidates = rankChunks(chunks, input.question);
      const sourceNoteIds = Array.from(new Set(rankedCandidates.map(chunk => chunk.noteId)));
      const sourceNotes = await getNotesByIds(sourceNoteIds);
      const visuals = await getVisualsForNotes(sourceNoteIds);
      const ranked = validateCitations(rankedCandidates, sourceNotes);
      let conversationId = input.conversationId;
      if (conversationId && !(await getConversationQuestions(conversationId, ctx.user.id)).length) conversationId = undefined;
      conversationId = conversationId || await createConversation(ctx.user.id, input.subjectId, input.question.slice(0, 90));
      let answer = "I couldn't find that in your stored notes. Try selecting a different subject or saving the relevant class material first.";
      let model: string | undefined;
      if (ranked.length) {
        model = await chooseModel();
        const evidence = ranked.map((chunk, index) => {
          const note = sourceNotes.find(item => item.id === chunk.noteId);
          return `[Source ${index + 1}] ${note?.title || "Stored note"} — ${chunk.pageRef || "Note section"}\n${chunk.content}`;
        }).join("\n\n");
        try {
          const response = await invokeLLM({
            model,
            messages: [
              { role: "system", content: "You are StudyNow's grounded study assistant. Answer only from the supplied stored-note evidence. If the evidence is insufficient, say exactly that the answer was not found in stored notes. Do not invent facts, citations, page numbers, or diagrams. Use concise markdown with a direct answer and a short evidence note." },
              { role: "user", content: `Question: ${input.question}\n\nAuthorized evidence:\n${evidence}` },
            ],
          });
          const content = response.choices[0]?.message?.content;
          if (typeof content === "string" && content.trim()) answer = content;
        } catch {
          answer = `I found relevant material, but the AI answer service is temporarily unavailable. Review these cited notes: ${ranked.map(chunk => chunk.pageRef || "note section").join(", ")}.`;
        }
      }
      const questionId = await saveAiQuestion({ conversationId, studentId: ctx.user.id, question: input.question, answer, foundInNotes: ranked.length > 0, model });
      await saveAnswerSources(questionId, ranked.map(chunk => {
        const note = sourceNotes.find(item => item.id === chunk.noteId);
        const visual = visuals.find(item => item.noteId === chunk.noteId && sourceReferenceMatches(chunk.pageRef, item.pageRef));
        return { noteId: chunk.noteId, chunkId: chunk.id, visualId: visual?.id, sourceLabel: note?.title || "Stored note", pageRef: chunk.pageRef || undefined, relevanceScore: chunk.relevanceScore };
      }));
      return {
        conversationId,
        answer,
        foundInNotes: ranked.length > 0,
        sources: ranked.map(chunk => {
          const note = sourceNotes.find(item => item.id === chunk.noteId);
          const visual = visuals.find(item => item.noteId === chunk.noteId && sourceReferenceMatches(chunk.pageRef, item.pageRef));
          return { noteId: chunk.noteId, title: note?.title || "Stored note", pageRef: chunk.pageRef || "Note section", visualUrl: visual?.storageUrl || null, visualIsImage: Boolean(visual && /\.(png|jpe?g|webp|gif|svg)$/i.test(visual.storageKey)), visualCaption: visual?.caption || null };
        }),
      };
    }),
  }),
  admin: router({
    users: adminProcedure.query(() => listUsers()),
    resources: adminProcedure.query(() => listAllTeacherResources()),
    moderateResource: adminProcedure.input(z.object({ resourceId: z.number().int().positive(), status: z.enum(["published", "unpublished"]), reason: z.string().trim().max(500).optional() })).mutation(async ({ ctx, input }) => { await moderateTeacherResource(input.resourceId, input.status, ctx.user.id, input.reason); return { success: true }; }),
    updateUser: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["student", "teacher", "admin", "user"]), status: z.enum(["active", "pending", "disabled"]) })).mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.user.id && input.status === "disabled") throw new TRPCError({ code: "BAD_REQUEST", message: "You cannot disable your own administrator account." });
      await updateUserAccess(input.userId, input.role, input.status, ctx.user.id);
      return { success: true };
    }),
    subjects: adminProcedure.query(() => listSubjectsForAdmin()),
    classes: adminProcedure.query(() => listAllClasses()),
    createClass: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(160), subjectId: z.number().int().positive(), term: z.string().trim().max(80).optional(), description: z.string().trim().max(600).optional() })).mutation(async ({ ctx, input }) => {
      const id = await createClass(input);
      await recordAudit(ctx.user.id, "create_class", "class", id, input);
      return { id };
    }),
    assignTeacher: adminProcedure.input(z.object({ classId: z.number().int().positive(), teacherId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assignTeacher(input.classId, input.teacherId);
      await recordAudit(ctx.user.id, "assign_teacher", "class", input.classId, { teacherId: input.teacherId });
      return { success: true };
    }),
    assignStudent: adminProcedure.input(z.object({ classId: z.number().int().positive(), studentId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assignStudent(input.classId, input.studentId);
      await recordAudit(ctx.user.id, "assign_student", "class", input.classId, { studentId: input.studentId });
      return { success: true };
    }),
    audit: adminProcedure.query(() => listAuditEvents()),
  }),
});

export type AppRouter = typeof appRouter;
