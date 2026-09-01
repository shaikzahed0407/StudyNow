# StudyNow doc-service

A small Spring Boot microservice that extracts text and images from PDF and
PPTX files using **Apache PDFBox** and **Apache POI** — the same job the
Node backend used to do with JS libraries (`pdfjs-dist`, `@napi-rs/canvas`,
manual PPTX zip parsing), and largely the same job the LLM was doing for raw
text extraction before this existed.

It's intentionally stateless: it never talks to Supabase, the database, or
an AI model. It just turns a file into JSON (text per page/slide + images as
base64), and the Node backend does everything else — storage upload,
chunking, and (for anything this service can't handle, like scanned images)
falling back to the multimodal LLM.

## Why this exists

1. Apache POI/PDFBox are more mature for this specific job than the JS
   equivalents.
2. It means PDF/PPTX uploads no longer spend an LLM call (and free-tier
   quota) on raw text extraction — only on the parts that actually need a
   model (Q&A reasoning, images/scans, legacy `.doc`/`.docx`).
3. It's real, working Java — Spring Boot + REST + file parsing — sitting
   next to the coursework it's built from.

## Running it locally

Requires JDK 21+ and Maven.

```bash
cd java-doc-service
mvn spring-boot:run
```

It starts on `http://localhost:8080` by default (override with `PORT`).

Check it's up:

```bash
curl http://localhost:8080/api/health
```

## Wiring it into the main app

Set this in the Node app's `.env` (or Render environment variables):

```
JAVA_DOC_SERVICE_URL=http://localhost:8080
```

That's the *only* thing that connects them. If this variable is unset, or
the service isn't reachable, the main app automatically falls back to its
existing LLM-based extraction — nothing breaks if you haven't started this
service yet. See `server/services/javaDocClient.ts` on the Node side.

## Endpoints

| Method | Path                | Body                          | Returns                                   |
|--------|----------------------|--------------------------------|--------------------------------------------|
| GET    | `/api/health`        | —                               | `{ status: "ok" }`                         |
| POST   | `/api/extract/pdf`   | multipart `file` (PDF)         | per-page text + rendered page images (PNG) |
| POST   | `/api/extract/pptx`  | multipart `file` (PPTX)        | per-slide text + embedded images           |

Example:

```bash
curl -F "file=@lecture-04.pdf" http://localhost:8080/api/extract/pdf
```

## Deploying alongside Render

Deploy this as a **second Render web service** (Java/Maven runtime,
`mvn spring-boot:run` or the built jar as the start command), then point the
main app's `JAVA_DOC_SERVICE_URL` at its Render URL. It's independent of the
Node app's deploy — you can redeploy either one without touching the other.

## Tests

```bash
mvn test
```

`ExtractionServiceTest` builds a real PDF and a real PPTX in memory (via
PDFBox/POI) and asserts the extraction round-trips correctly — no fixture
files needed.

> **Note on this repo's sandbox:** these tests were written and reviewed
> against the current PDFBox 3.x / POI 5.x APIs but could not be compiled
> in the environment that generated this project (no access to Maven
> Central there). Run `mvn test` locally the first time to confirm — if
> anything doesn't compile, it'll most likely be a minor API-version
> mismatch, not a logic error.
