This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

# Implementation Overview

SonicSeeker is an AI-assisted media intelligence platform with a backend focused on speech processing workflows: authentication, audio/video transcription, optional speaker diarization, multilingual translation, transcript summarization, YouTube transcript ingestion, transcript persistence, media retrieval, and mind map generation.

The backend is implemented primarily through Next.js Route Handlers with a Python ML layer invoked through controlled subprocess execution. It combines database persistence (MongoDB), secure user authentication (JWT + hashed passwords), AI inference orchestration (Whisper, pyannote, Hugging Face, Ollama), and operational safeguards (timeouts, temporary file isolation, cleanup routines, and structured error handling).

It explains what was built, why it was built that way, and what concrete backend evidence exists in the implementation, without including code snippets.

## 1. Architecture Overview

The backend follows a hybrid layered architecture:

- HTTP API layer via Next.js app router endpoints
- Authentication layer using JWT and password hashing
- Python inference layer for heavy AI/ML workloads
- Persistence layer using MongoDB collections
- File and media handling layer for upload, conversion, and retrieval
- AI utility layer for summarization, translation, and mind-map generation

Primary technologies in active backend use:

- Next.js (Route Handlers), TypeScript, Node.js runtime
- MongoDB (native driver)
- bcryptjs and jsonwebtoken
- Python subprocess integration (`exec`/`spawn`)
- faster-whisper and pyannote.audio (transcription + diarization)
- Hugging Face inference APIs and transformers models
- youtube-transcript-api
- Ollama (local LLM execution for mind map generation)

Why this architecture is strong in practice:

- It keeps HTTP concerns and ML execution concerns separated.
- It prevents long ML tasks from blocking frontend logic by delegating to Python scripts.
- It uses explicit temp-file orchestration and cleanup to reduce runtime residue.
- It supports both cloud AI APIs and local model inference.

## 2. System Structure

The backend is organized around clear feature modules:

- user signup, login, and profile retrieval
- transcription pipeline for uploaded audio/video
- transcript persistence and history retrieval
- media storage and media retrieval by ID
- transcript translation pipeline
- transcript summarization pipeline
- YouTube transcript ingestion
- transcript-to-paragraph transformation for downstream LLM tasks
- AI mind-map generation from transcript text
- transcript comparison pipeline integration (designed for metrics/WER workflows)

This structure demonstrates real backend modularity: each concern is exposed through focused endpoints and utility scripts rather than one monolithic controller.

## 3. Data Model and Schema Complexity

SonicSeeker uses MongoDB with practical document-level modeling for media intelligence workflows.

Core collections and data entities:

- `users`: username, email, hashed password
- `transcriptions`: user linkage, file metadata, transcript segments, timestamps
- `mediaFiles`: media payload (base64), MIME type, upload date

Key data interfaces modeled in TypeScript:

- `User`
- `Transcription`
- `TranscriptSegment`

### Schema Diagram

User
  ├── Login credentials (hashed)
  ├── Profile metadata
  └── Transcriptions (1-to-many)

Transcription
  ├── userId (ObjectId reference)
  ├── fileName
  ├── fileType (audio/video)
  ├── mimeType
  ├── mediaFileId (ObjectId reference)
  ├── uploadDate
  └── transcript[]

MediaFile
  ├── _id (same as mediaFileId)
  ├── file (base64 payload)
  ├── mimeType
  └── uploadDate

This model is backend-appropriate for the project stage: it preserves referential linkage between transcript metadata and media payload while keeping user identity separate.

## 4. Authentication and Access Control

Authentication is implemented with JWT-based sessions and bcrypt password hashing.

Implemented capabilities:

- signup with duplicate-user check and hashed password storage
- login with credential verification and signed token issuance
- token payload includes user ID and username
- token expiration enforced (`30m`)
- user profile retrieval endpoint excludes password field

A credible backend implementation:

- passwords are never stored in plain text
- token signing is secret-backed via environment variable
- profile reads enforce ID validation before database lookup
- response payloads avoid exposing sensitive password data

## 5. Core Feature Implementation

### 5.1 Transcription and Diarization Workflow

This is the primary backend workflow and is implemented end-to-end:

- receives multipart media upload from client
- stores media temporarily in OS temp directory
- resolves Python executable cross-platform
- executes `transcribe.py` with file path and output JSON path
- optionally enables diarization and passes Hugging Face token
- reads structured JSON output generated by Python
- appends execution-time metrics in API response
- cleans temp input/output files in `finally` blocks

Python-side implementation demonstrates advanced backend handling:

- ffmpeg pre-check and media-to-WAV conversion for diarization
- faster-whisper model loading with configurable device/compute settings
- word-level timestamp extraction and confidence logging
- pyannote diarization integration with speaker-turn alignment
- structured output (`transcription` + `metrics`) for frontend consumption

### 5.2 Translation, Summarization, and Language AI Utilities

Translation workflow:

- accepts transcript text + target language
- base64-encodes input for command-line safety
- calls `translate.py` (NLLB model path)
- writes translation to temp output file to avoid encoding issues
- returns normalized `translatedText` response

Summarization workflow:

- receives transcript text
- truncates to bounded length for inference safety
- calls Hugging Face inference endpoint (`facebook/bart-large-cnn`)
- returns summary text when model output is valid

These flows prove backend experience with both local-model and hosted-model integration patterns.

### 5.3 Persistence, History, Profile, and Media Retrieval

Persistence and retrieval subsystem includes:

- `POST /api/transcription` for storing transcript metadata and media payload
- `POST /api/phistory` for user-specific transcription history
- `GET /api/user/[userId]` for profile retrieval
- media retrieval endpoint for streaming binary media from DB records

The persistence design separates transcript metadata from raw media payload by using linked IDs, which is a practical backend modeling choice.

### 5.4 YouTube Ingestion, Mind Map Generation, and Comparison Pipeline

YouTube ingestion:

- validates URL format server-side
- calls Python script to extract transcript by video ID
- prioritizes preferred language transcripts with fallbacks
- returns normalized transcript segments and combined text

Mind map generation:

- derives paragraph text from saved transcript JSON
- executes local Ollama (`llama3`) for structured topic extraction
- performs JSON sanitation and fallback parsing
- writes debug artifacts for failed parse cases

Comparison pipeline:

- endpoint supports file-vs-file and text-vs-text comparison modes
- creates temporary normalized inputs for script processing
- designed to return WER/metrics JSON output

## 6. Error Handling Strategy

The backend consistently uses defensive error handling at route and subprocess levels.

Key implemented strategies:

- early validation for required request fields and payload types
- explicit 400/401/404/415/500 response handling across endpoints
- script existence checks before execution
- graceful fallback parsing and secondary reads on partial failure
- non-fatal handling for stderr where output may still be valid
- structured error payloads including details where useful
- guaranteed cleanup routines in `finally` blocks for temp files

## 7. Security Checklist

Implemented security controls:

- bcrypt hashing for passwords
- JWT token generation with expiry
- secrets read from environment variables
- ObjectId validation on user-facing identity routes
- password field excluded from profile responses
- basic input validation before DB and script operations

Security maturity notes (important in interviews):

- authentication exists and is functional
- several data routes currently rely on client-provided identity and should be upgraded to strict server-side token verification middleware for full zero-trust route protection

## 8. API Reference Summary

| Area | Main Capability | What It Demonstrates |
|---|---|---|
| Authentication | Signup, login, JWT issue | Identity and session management |
| User Profile | Fetch current user by ID | Protected profile retrieval pattern |
| Transcription AI | Upload media, run Whisper/diarization | ML orchestration via backend |
| Transcript Storage | Save transcript + media linkage | Persistent processing history |
| History | User-specific transcript history | Query, projection, sorting |
| Media | Retrieve stored media payload | Binary serving from DB |
| Translation | Multilingual transcript translation | Cross-language AI utility |
| Summarization | Transcript summarization via HF API | Hosted inference integration |
| YouTube | Fetch transcript from video URL | External source ingestion |
| Mind Map | Transcript-to-knowledge-map generation | LLM post-processing workflow |
| Transcript Utilities | Save raw transcript, paragraph extraction | Pipeline preprocessing |
| Comparison | WER/metrics integration endpoint | Evaluation-oriented backend design |

## 9. API Response Examples

To demonstrate behavior in interviews, describe response shapes in plain language:

- login response: success message, non-sensitive user details, signed token
- signup response: creation success/failure message
- transcription response: segment array with timestamps/speakers plus runtime metrics
- translation response: translated text field or structured error
- summarization response: summary text from model output
- YouTube transcript response: normalized transcript object with segments
- history response: list of transcription records sorted by latest upload
- user response: profile data excluding password
- mind map response: hierarchical topic tree JSON

Evidence-oriented response interpretation:

- backend returns domain-shaped payloads, not generic placeholders
- error payloads preserve diagnostics for debugging and support
- ML endpoints return both content output and processing metadata when relevant
  
## 10. Conclusion

SonicSeeker demonstrates a practical and credible backend implementation for placement evaluation because it combines application APIs, data persistence, security primitives, ML orchestration, and operational safeguards into one integrated system. The project is not limited to simple CRUD; it implements multi-stage AI workflows, handles external and local inference paths, and returns structured outputs usable by production UI flows.

