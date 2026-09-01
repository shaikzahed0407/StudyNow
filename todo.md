# StudyNow Project TODO

- [x] Establish the modern isometric visual system: clean white canvas, subtle grid texture, translucent teal/blue/coral geometric planes, bold heavy sans-serif typography, and replaceable centralized design tokens
- [x] Build the authenticated responsive dashboard shell with reusable navigation, cards, tables, dialogs, empty states, loading states, and accessible focus behavior
- [x] Extend the user model and authorization helpers for student, teacher, and administrator roles
- [x] Add backend-enforced admin-controlled role assignment, user activation/disablement, and portal access rules
- [x] Add relational schema for subjects, classes, teacher assignments, notes, files, chunks, visuals, publications, saved resources, conversations, answer sources, and audit events
- [x] Add subjects and class management with admin controls and student subject organization
- [x] Add private student notes with rich text, title, tags, source, subject, and metadata
- [x] Add secure server-side uploads to managed object storage for PDFs, presentations, images, and supported documents
- [x] Add file metadata, validation, preview/download references, and uploaded/processing/failed/ready states
- [x] Add student note library with metadata search, filters, subject views, preview, download, and deletion flows
- [x] Add teacher portal for class notes and syllabus resources, drafts, publication, unpublication, replacement, and assigned class/subject visibility
- [x] Add student teacher-resource library with permission-scoped browsing, downloads, and save-to-personal-subject-library flow
- [x] Add admin workspace for users, roles, subjects/classes, teacher assignments, content moderation, and audit activity
- [x] Add text/PDF/PPT/PPTX/image ingestion with page/slide-aware extracted text and processing status
- [x] Add server-side language-model adapter for note extraction, diagram/image analysis, retrieval, and grounded answer generation
- [x] Add authorized retrieval scoped to the student’s own notes and permitted saved/published resources only
- [x] Add Q&A workspace with follow-up conversations, cited answers, page/slide references, and explicit not-found-in-notes behavior
- [x] Add cited diagram/image visual evidence from retrieved note sources
- [x] Add server-side citation validation and answer-source integrity checks
- [x] Add audit logging, rate/size limits, and permission regression coverage
- [x] Add Vitest tests for roles, ownership, class visibility, retrieval ranking, citation integrity, and portal boundary enforcement
- [x] Run type checks, tests, and responsive visual verification; fix discovered issues
- [x] Save the final project checkpoint and deliver the StudyNow version to the user

## Change history

- [x] User supplied detailed functional requirements, explicit authorization constraints, and isometric visual direction on 2026-08-30

## Follow-up hardening

- [x] Add note deletion backend procedures and UI actions with confirmation and refresh states
- [x] Add teacher resource replacement workflow for updating an existing published source file or note
- [x] Let students choose the destination personal subject when saving a class resource
- [x] Implement admin content moderation actions and corresponding backend audit-backed procedures
- [x] Add persisted conversation/history support to the Q&A workspace and reuse conversation IDs for follow-ups
- [x] Extract/store diagram visuals from supported document types such as PDFs and presentations and map them to cited sources
- [x] Add explicit server-side citation integrity validation and regression tests for citations, retrieval scope, and not-found responses

## Final authorization regression coverage

- [x] Add Vitest tests for owner-only note deletion and teacher resource replacement
- [x] Add Vitest tests proving students can access only resources published to their assigned classes and cannot access others

## Final hardening corrections

- [x] Fix the teacher replacement form so replace mode does not require unrelated class/subject re-selection and is prefilled consistently
- [x] Implement real diagram/image extraction for PDFs and presentations, store extracted visual assets separately, and return/display them as cited evidence
- [x] Add Vitest coverage for the AI not-found response and real retrieval-scope enforcement through protected access paths
- [x] Add procedure/helper tests for owner-only note deletion and teacher resource replacement
- [x] Add backend tests proving students can access only published resources for assigned classes and are denied others

## Citation and real-backend validation corrections

- [x] Match AI visual evidence to the cited chunk/page/slide instead of the first visual on the note, and make PPTX visual references slide-aware
- [x] Add Vitest coverage for ai.ask proving retrieval is limited to the student’s own notes plus explicitly saved/permitted resources, including denied or out-of-scope cases
- [x] Add backend tests against the real resource access helpers/router flow to verify assigned-class published resources are accessible and other class resources are denied

## Evidence-quality test corrections

- [x] Add ai.ask tests that exercise owned-note and saved-resource retrieval together while excluding denied or out-of-scope resources from citations and answers
- [x] Add a positive real backend access test for an assigned published resource and negative tests for unassigned or unpublished resources
- [x] Add regression tests for page- and slide-matched visual evidence references

## Final Q&A evidence hardening

- [x] Add an ai.ask regression fixture containing owned, saved, and denied note chunks in the same dataset, then assert denied note IDs are excluded from sources, persisted answer sources, and LLM evidence
- [x] Assert out-of-scope material never appears in cited metadata or answer-generation evidence even when it competes with authorized chunks

## Final persisted evidence assertion

- [x] Assert mixed owned, saved, and denied ai.ask fixtures exclude denied note IDs from saveAnswerSources persisted-source arguments

## Bug fixes — /notes upload

- [x] Fix note/file upload inserts that currently send NaN for noteId and createdAt/insert identifiers
- [x] Add regression coverage for upload ID generation and database insert result handling
- [x] Fix the React DOM nesting warning caused by a div rendered inside a p element on the notes route
- [x] Re-run type checks, tests, build, and /notes visual/runtime verification
- [ ] Save and deliver the corrected StudyNow checkpoint

## Bug fix follow-up — student /notes upload

- [x] Normalize every MySQL insert result before using generated IDs so student uploads cannot pass NaN note IDs into noteFiles or processing updates
- [x] Add regression coverage for insert results shaped as ResultSetHeader, arrays, and invalid values
- [x] Re-check the /notes preview markup for the reported invalid p/div nesting warning
- [x] Validate the fix with the reported student upload context and rerun type checks, tests, build, and visual verification
- [ ] Save and deliver the corrected checkpoint

## Claude fix notes (2026-08-31)

- Root cause of the NaN bug: `drizzle-orm/mysql2` resolves an INSERT to the tuple
  `[ResultSetHeader, FieldPacket[]]`, not a plain `{ insertId }` object. Every
  `createX()` helper in `server/db.ts` was doing `Number((result as any).insertId)`,
  which read `undefined` off the array and silently produced `NaN`. That `NaN` then
  flowed into `noteId` on the `/notes` upload flow and any other create-then-reference
  flow (teacher resources, subjects, classes, conversations, questions, saved resources).
- Fix: added `getInsertId()` in `server/db.ts` that normalizes both the mysql2 tuple
  shape and plain-object shape, and throws instead of returning NaN if no valid id is
  found. All 7 call sites now use it. See `server/insertId.test.ts` for regression
  coverage of both shapes plus the "throws instead of NaN" behavior.
- DOM nesting bug: found in three stat-card components (`Dashboard.tsx`, `Teacher.tsx`,
  `Admin.tsx`) rendering `<p>{isLoading ? <Skeleton/> : value}</p>` — `Skeleton` renders
  a `<div>`, which is invalid inside a `<p>`. Swapped the wrapping `<p>` for a `<div>`
  with identical classes in all four occurrences. (Did not find this specific pattern
  inside `Notes.tsx` itself despite the original note — fixed everywhere the pattern
  actually occurs app-wide as a precaution.)
- Verified: `npx tsc --noEmit` clean, `npx vitest run` 27/27 passing (23 original + 4
  new), `npx vite build` succeeds.
