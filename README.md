# Continuum

**Memory for the patients the system forgets.**

Continuum is a cross-institutional patient memory layer built on Cognee's hybrid
graph-vector reasoning. It reconciles scattered, multi-format medical fragments —
clinical notes, lab results, prescriptions, voice notes, scanned documents — into
one coherent, queryable patient timeline that any participating institution can
read from, without having been told the history directly.

Built for the [WeMakeDevs × Cognee Hackathon](https://www.wemakedevs.org/hackathons/cognee)
(June 29 – July 5, 2026). SDG alignment: **SDG 3 — Good Health and Well-Being**
(continuity of care across fragmented systems, especially relevant to
under-resourced clinics and patients who see a different provider every visit).

Built with the help of AI assistants: Codex 
---

## The demo, in one sentence

Log a fragment as **Hospital A** in one browser session. Open a **second**,
completely independent session as **Hospital B** and ask a plain-language
question about the same patient — it answers correctly, sourced from history
it was never directly given, and the knowledge graph visibly grows as you watch.

---

## Table of contents

- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Setup](#setup)
  - [1. Prerequisites](#1-prerequisites)
  - [2. Neon Postgres](#2-neon-postgres)
  - [3. Backend (Express + Prisma)](#3-backend-express--prisma)
  - [4. Cognee service (Python + FastAPI)](#4-cognee-service-python--fastapi)
  - [Cognee Cloud vs. self-hosted](#cognee-cloud-vs-self-hosted)
  - [5. Frontend (React + Vite + Tailwind)](#5-frontend-react--vite--tailwind)
- [Running the live demo](#running-the-live-demo)
- [API reference](#api-reference)
- [Data model](#data-model)
- [Design decisions & honesty notes](#design-decisions--honesty-notes)
- [What's genuinely "Cognee" here vs. what isn't](#whats-genuinely-cognee-here-vs-what-isnt)
- [What's wired vs. verified](#whats-wired-vs-verified)
- [Known limitations](#known-limitations)
- [Roadmap / build phases](#roadmap--build-phases)
- [Hackathon judging notes](#hackathon-judging-notes)

---

## Architecture

```
┌─────────────────────┐      HTTP (JSON)      ┌──────────────────────┐
│   React frontend     │ ───────────────────▶ │   Express backend     │
│   (Vite, Tailwind,   │ ◀─────────────────── │   (TypeScript,        │
│   React Router, d3)  │                       │   Prisma, Neon)       │
└─────────────────────┘                       └──────────┬───────────┘
                                                          │ HTTP (JSON)
                                                          ▼
                                              ┌──────────────────────┐
                                              │  cognee-service       │
                                              │  (Python, FastAPI)    │
                                              │  wraps the `cognee`   │
                                              │  package directly     │
                                              └──────────┬───────────┘
                                                          │
                                                          ▼
                                              Cognee's hybrid graph-vector
                                              engine (needs an LLM API key)
```

**Why three services instead of one?** `cognee` is a Python package — the rest
of this project is TypeScript/Node. Rather than shell out to Python from Node
(fragile) or rewrite the frontend/backend in Python, the Express API talks to
a small dedicated FastAPI service over HTTP. That's also the *only* place in
the whole codebase that imports `cognee` directly.

**Why is the graph visualization powered by Postgres, not Cognee's internal
graph export?** Cognee's own graph store is the thing actually doing the
reconciliation reasoning (via `cognee.cognify()` / `cognee.search()`), but
exporting its *internal* graph structure varies across versions and storage
backends, which makes it a fragile thing to depend on for a live demo. So the
force-directed graph you see in the UI is derived straight from our own
Patient → Visit → Fragment data in Postgres — guaranteed to render correctly
and grow live every time a fragment is logged. Cognee still does the actual
semantic reconciliation and answers the natural-language `recall()` queries;
it's just not also the thing rendering the picture.

---

## Tech stack

| Layer | Tool | Why |
|---|---|---|
| Memory/reasoning engine | **Cognee** (Python) | Hybrid graph-vector ingestion (`add`/`cognify`) and reasoning (`search`) over unstructured, multi-format fragments |
| Cognee service | **FastAPI** | Thin HTTP wrapper so Node never has to import a Python package |
| Backend | **Express.js + TypeScript** | API layer connecting frontend, database, and the Cognee service |
| ORM | **Prisma** | Patient / Visit / Fragment / GraphSyncLog data modeling |
| Database | **Neon (serverless Postgres)** | Structured metadata + provenance, source of truth for the graph visualization |
| Voice transcription | **Groq (Whisper)** | Transcribes recorded voice notes |
| Document OCR | **Gemini 2.5 Flash** | Extracts text from scanned documents/photos (multimodal, not a dedicated OCR engine) |
| File storage | **Cloudinary** | Stores voice-note audio and scan/photo files as source-proof attachments |
| Frontend | **React + Vite + TypeScript** | Dashboard, Timeline, Knowledge Graph, Conflicts, Verifiable Proof pages |
| Styling | **Tailwind CSS** | Light, clinical-chart-inspired theme — see Design decisions below |
| Graph visualization | **d3-force** | Force-directed live graph rendering |
| Icons | **lucide-react** | |
| Routing | **react-router-dom** | |

---

## Project structure

```
continuum/
├── README.md                    ← you are here
├── backend/                      Express + TypeScript + Prisma
│   ├── prisma/
│   │   ├── schema.prisma         Patient, Visit, Fragment, GraphSyncLog
│   │   └── seed.ts               Seeds 1 demo patient, 2 fake hospitals, 5 fragments
│   ├── src/
│   │   ├── index.ts              App entrypoint
│   │   ├── db.ts                 Prisma client
│   │   ├── cogneeClient.ts        HTTP client for cognee-service
│   │   ├── conflictDetection.ts   Dosage-mismatch heuristic
│   │   └── routes/
│   │       ├── patients.ts
│   │       ├── fragments.ts
│   │       ├── recall.ts
│   │       └── graph.ts
│   └── .env.example
├── cognee-service/                Python + FastAPI, the only `cognee` import
│   ├── main.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                      React + Vite + Tailwind
    ├── index.html
    ├── tailwind.config.js
    └── src/
        ├── main.tsx               Routes + providers
        ├── context/AppContext.tsx Session, selected patient, fragments cache
        ├── layout/AppShell.tsx    Sidebar + topbar shell
        ├── routes/ProtectedRoute.tsx
        ├── api.ts                 Backend HTTP client
        ├── types.ts
        ├── components/
        │   ├── ui.tsx             Card, Badge, Buttons, EmptyState
        │   └── KnowledgeGraph.tsx d3-force canvas
        └── pages/
            ├── Login.tsx
            ├── Dashboard.tsx
            ├── Patients.tsx
            ├── Timeline.tsx
            ├── KnowledgeGraphPage.tsx
            ├── Conflicts.tsx
            ├── VerifiableProof.tsx
            └── Settings.tsx
```

---

## Setup

### 1. Prerequisites

- **Node.js 18+** and npm
- **Python 3.10+**
- A **Neon** Postgres database (free tier is fine) — [neon.tech](https://neon.tech)
- Either a **Cognee Cloud / "Pro" API key** (if you were given one, e.g. for
  a hackathon) **or** your own **LLM API key** (OpenAI by default) — see
  [Cognee Cloud vs. self-hosted](#cognee-cloud-vs-self-hosted) below for
  which one you need and where it goes
- A **Cloudinary** account (free tier) — stores voice-note audio and scanned
  document/photo files as source-proof attachments
- A **Groq** API key — transcribes voice notes (Whisper, hosted by Groq)
- A **Gemini** API key — OCRs/extracts text from scanned documents (Gemini
  2.5 Flash, multimodal)

All three of Cloudinary/Groq/Gemini are optional in the sense that the app
still runs without them — only the Voice Note and Scanned Document quick
actions on the Dashboard need them. Plain Text Note logging works with just
the backend + cognee-service.

### 2. Neon Postgres

1. Create a free project at [neon.tech](https://neon.tech)
2. Copy the connection string from the dashboard (it looks like
   `postgresql://user:password@host.neon.tech/dbname?sslmode=require`)

### 3. Backend (Express + Prisma)

```bash
cd backend
cp .env.example .env
# edit .env: paste your Neon DATABASE_URL, and (optional but needed for
# Voice Note / Scanned Document) your CLOUDINARY_*, GROQ_API_KEY, and
# GEMINI_API_KEY

npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed        # optional — seeds one demo patient with 5 fragments
npm run dev          # starts on http://localhost:4000
```

### Cognee Cloud vs. self-hosted

If the hackathon (or anyone) gave you a **Cognee Pro / Cloud API key**, that's
a different credential from an OpenAI key, and it goes in a different place:

```bash
# cognee-service/.env
COGNEE_API_KEY=ck_...your-pro-key...
COGNEE_SERVICE_URL=https://your-instance.cognee.ai
```

When `COGNEE_API_KEY` is set, `cognee-service/main.py` connects through
`cognee.serve()` and routes `remember()` / `recall()` to Cognee Cloud. In a
cloud-capable SDK, you do **not** need your own OpenAI key in this mode -
Cognee Cloud handles the model calls on its end.

If the installed `cognee` package does not expose the cloud client API, the
service now stops with a clear 503 instead of silently falling back to local
mode. That is deliberate - it is better to see "cloud mode is unsupported in
this install" than a confusing graph-sync failure that is really a version
mismatch.

If you want to run fully self-hosted instead, leave `COGNEE_API_KEY` blank and
set `LLM_API_KEY` so the service can use `add()`/`cognify()`/`search()`
locally.

Either way, the rest of Continuum (the Express backend) talks to the same
`/remember` and `/recall` endpoints on this service and doesn't know or care
which mode is active. Check `GET /health` on the cognee-service — it reports
`"mode": "cloud"` or `"mode": "self-hosted"` so you can confirm which one is
live.

### 4. Cognee service (Python + FastAPI)

```bash
cd cognee-service
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

pip install -r requirements.txt
cp .env.example .env
# edit .env: paste EITHER your COGNEE_API_KEY (Pro/hackathon key)
# OR your own LLM_API_KEY — see "Cognee Cloud vs. self-hosted" above

uvicorn main:app --reload --port 8088
```

Verify it's up: `curl http://localhost:8088/health`. In cloud mode it should
return `{"ok": true, "mode": "cloud", "cloud_url": "https://your-instance.cognee.ai"}`.
In self-hosted mode it returns `{"ok": true, "mode": "self-hosted",
"llm_configured": true}` — if `llm_configured` is `false`, the `/remember`
and `/recall` endpoints will return a clear 503 instead of silently failing.

### 5. Frontend (React + Vite + Tailwind)

```bash
cd frontend
npm install
npm run dev          # starts on http://localhost:5173
```

All three services need to be running at once for the full demo
(backend on :4000, cognee-service on :8088, frontend on :5173).

---

## Running the live demo

1. Open `http://localhost:5173` in one browser (or browser profile).
2. **Sign in** as `Hospital A — Lagos General` (or any name — it's a session
   identity for provenance, not real auth; see [Design decisions](#design-decisions--honesty-notes)).
3. Go to **Patients**, enroll a patient (or use the seeded one).
4. Go to **Dashboard**, log a fragment — e.g. *"Patient reports recurring
   abdominal pain. Prescribed omeprazole 20mg."*
5. Open a **second, independent browser session** (a different browser, or an
   incognito window) at the same URL.
6. **Sign in** as `Hospital B — Eko Community Clinic`.
7. Select the **same patient**, go to **Timeline**, and ask: *"Anything I
   should know about this patient before I prescribe something for fatigue?"*
8. Watch it answer using Hospital A's fragment — which this session never saw
   logged — and watch the **Knowledge Graph** page grow a new node live the
   moment either session logs something new.
9. Log a second fragment mentioning the same drug at a different dosage from
   either session to see the **Conflicts** page light up.

---

### Patient portal & consent

The public landing page now lives at `http://localhost:5173/`. It introduces the
product and links to two different experiences:

- `http://localhost:5173/portal` for the patient-facing consent portal
- `http://localhost:5173/login` for the clinician app

The patient portal is not a fake settings screen. It writes real consent state
to Postgres:

- `ConsentProfile` controls shared-care and emergency-override behavior.
- `ConsentRule` controls whether each sensitive category is visible, clinician-only, or emergency-only.
- `AccessGrant` tracks which institutions currently have access.
- `AccessAudit` records consent edits and break-glass events.

Important nuance: hiding something from the patient portal does **not** mean
clinicians lose access forever. Emergency-only items still have an audited
break-glass path so care teams can recover clinically important information
when needed.

## API reference

All routes are mounted under `http://localhost:4000/api`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/patients` | List all enrolled patients |
| `POST` | `/patients` | Enroll a patient — `{ displayName }` |
| `GET` | `/patients/:id` | Get a patient with visits + fragments |
| `POST` | `/patients/:id/visits` | Log a visit — `{ institutionName, visitDate, notes? }` |
| `GET` | `/fragments/patient/:patientId` | All fragments for a patient |
| `POST` | `/fragments` | Log a fragment (writes to Postgres, then pushes into Cognee) |
| `POST` | `/recall` | Ask a natural-language question — `{ patientId, query }` |
| `GET` | `/graph/:patientId` | Nodes/edges for the live force-graph |
| `GET` | `/graph/:patientId/log` | Sync activity log for the Knowledge Graph page |
| `POST` | `/uploads/transcribe` | Multipart `audio` field → Cloudinary upload + Groq transcription, returns `{ transcript, sourceFileUrl }` |
| `POST` | `/uploads/ocr` | Multipart `image` field → Cloudinary upload + Gemini 2.5 Flash OCR, returns `{ extractedText, sourceFileUrl }` |

The `cognee-service` (port 8088 by default) exposes `/remember`, `/recall`,
and `/forget/:patientId` — the Express backend is the only thing that should
call these directly.

---

## Data model

- **Patient** — network-wide identity, not tied to any single hospital's
  internal ID system. `consentedAt` records enrollment consent.
- **Visit** — a logged encounter at a specific institution, on a specific
  date.
- **Fragment** — one piece of evidence (note, lab result, prescription, voice
  note, image) with origin institution/author, source type, optional
  attached file, a sensitive-category flag, and sync status against Cognee.
- **GraphSyncLog** — append-only record of every attempt to push a fragment
  into Cognee's graph, success or failure, powering the Knowledge Graph
  page's growth log.

See `backend/prisma/schema.prisma` for the full schema with inline comments
explaining each design choice.

---

## Design decisions & honesty notes

A few choices in this build are deliberate scope/safety calls, not
oversights — worth knowing before a judge or a real clinician asks:

- **No per-hospital "hide this from other providers" feature.** Selective
  hiding is a treatment risk in a system other providers act on, not a
  privacy feature — see `Settings` page and the schema comments. Patient
  consent here means *consent to be in the network*, not à la carte hiding
  once enrolled.
- **"Login" is a session identity, not real authentication.** There's no
  password hashing, no real access control — it's how the demo represents
  "which institution is asking." A real deployment needs actual auth,
  role-based access, and almost certainly a break-the-glass emergency-access
  pattern for sensitive categories.
- **Conflict detection is a simple regex heuristic**, not a clinically
  validated system — it looks for the same drug name with a different
  dosage number across fragments. It's there to demonstrate Continuum's
  philosophy (surface disagreement, don't silently merge it), not to be
  trusted as-is.
- **"Verifiable Proof" computes a real SHA-256 hash of fragment content in
  the browser** so it's independently reproducible — but there's no
  blockchain or external ledger anchoring it. If your hackathon pitch implies
  blockchain-grade tamper-evidence, that would need real work (e.g. anchoring
  hashes to a ledger) this build doesn't do.
- **Voice transcription and document OCR are wired up, but unverified live
  in the build environment.** The Dashboard's "Record voice note" button uses
  the browser's `MediaRecorder` API, sends the recording to a backend
  endpoint that uploads it to Cloudinary and transcribes it via Groq's hosted
  Whisper; "Upload Scan" sends an image to a backend endpoint that uploads it
  to Cloudinary and runs OCR/extraction via Gemini 2.5 Flash. Both return
  editable text into the fragment form before anything is committed — see
  [What's wired vs. verified](#whats-wired-vs-verified) for why "wired" and
  "tested" aren't the same claim here.
- **Sensitive-category flags (mental health, reproductive health, substance
  use, HIV status, IPV-related) are visible labels, not enforcement.**
  Real-world handling of these categories needs actual consent workflows and
  access restriction this build only signals, doesn't implement.

---

## What's genuinely "Cognee" here vs. what isn't

- **Genuinely Cognee:** `cognee-service/main.py` calls `cognee.add()` →
  `cognee.cognify()` to ingest fragments (scoped per-patient via
  `dataset_name`), and `cognee.search(query_type=SearchType.GRAPH_COMPLETION)`
  to answer natural-language `recall()` queries. This is the actual
  hybrid graph-vector reasoning doing the cross-institution reconciliation —
  it's what makes the Hospital-A-to-Hospital-B demo moment real and not
  scripted.
- **Not Cognee internals:** the picture you see on the Knowledge Graph page
  is derived from Postgres (Patient/Visit/Fragment relationships), for the
  reliability reasons explained in [Architecture](#architecture). If you'd
  rather make the visual a literal rendering of Cognee's own graph (e.g. via
  `cognee.visualize_graph()`), that's a reasonable swap — see the comment at
  the top of `cognee-service/main.py` for where to start.

---

## What's wired vs. verified

This code was written in a sandbox whose network access is restricted to
npm/pypi/GitHub — it can't reach `api.groq.com`, `generativelanguage.googleapis.com`,
or Cloudinary's API. So `backend/src/groqClient.ts`, `geminiClient.ts`, and
`cloudinaryClient.ts` are written carefully against each provider's documented
REST API and the rest of the backend typechecks clean around them, but they
have **not** been exercised against a real request in this environment.
Quick ways to verify each one yourself once your `.env` has real keys:

```bash
# Cognee service health (confirms LLM key is picked up)
curl http://localhost:8088/health

# Groq transcription — record a short voice memo first
curl -X POST https://api.groq.com/openai/v1/audio/transcriptions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -F file=@your-recording.webm \
  -F model=whisper-large-v3-turbo

# Gemini OCR — try it on any photo of text
curl -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"What does this say?"}]}]}'
```

If something doesn't behave as documented here, the error messages from
`/api/uploads/transcribe` and `/api/uploads/ocr` are passed straight through
from the provider — they should tell you exactly what's wrong (bad key,
wrong field name, file too large, etc).

This same caveat applies to **Cognee Cloud mode**: `cognee.serve()`,
`cognee.remember()`, and `cognee.recall()` are called exactly as the
installed `cognee==1.2.2` package's own signatures specify (verified by
inspecting the installed package directly — see the comments in
`cognee-service/main.py`), but no live cloud request has actually
round-tripped in this sandbox. The one soft spot worth knowing about:
`cognee.recall()` returns a list of differently-shaped entries (QA /
graph-context / session entries), and `_extract_answer()` in `main.py` takes
the first one with an `answer` field and falls back to graph-context text
otherwise — if your account's responses come back shaped differently than
expected, that function is the one place to adjust.

## Known limitations

- **Prisma Client must be generated with full network access.** The sandbox
  this was built in restricts network egress, so `npx prisma generate`
  couldn't download its query-engine binary here — the schema and route code
  are typechecked logically correct, but you should run `npx prisma generate`
  yourself on a machine with normal internet access before first use. (This
  README's setup steps already include that command.)
- **`cognee`'s API surface has been evolving.** This build pins to the
  `add()`/`cognify()`/`search()` calling convention confirmed against
  `cognee==1.2.1` at the time of writing. If you install a newer version and
  something errors, check [docs.cognee.ai](https://docs.cognee.ai) - the
  comment block at the top of `cognee-service/main.py` explains the choice
  and what to adjust.
- **Cloud mode is version-sensitive.** A Cloud API key is not enough if the
  installed Python package does not expose the cloud client methods. In that
  case, either switch to self-hosted mode with `LLM_API_KEY` or upgrade the
  Cognee package to a cloud-capable release.
- **No automated tests.** Given the hackathon timeline, this prioritizes a
  working core loop over test coverage. The TypeScript backend and frontend
  both typecheck cleanly (`tsc -b` / `tsc --noEmit`) and the frontend
  production build (`vite build`) succeeds.

---

## Roadmap / build phases

This mirrors the original build plan this project was scoped from:

- **Phase 0 — Setup** ✅ Cognee service, Express+Prisma+Neon scaffold, data model
- **Phase 1 — Core memory loop** ✅ `/remember` and `/recall` endpoints, per-patient dataset scoping
- **Phase 2 — Demo flow** ✅ Fragment logging, recall with provenance, sync status
- **Phase 3 — The wow visual** ✅ Live force-graph, conflict flagging
- **Phase 4 — Safety/credibility features** ✅ Verify-before-treating banner, sensitive-category tagging, scope disclaimer (this README + Settings page)
- **Phase 5 — Multimodal stretch** ✅ Voice note ingestion via Groq transcription, scanned-document OCR via Gemini 2.5 Flash, both with Cloudinary-backed source proof — see [What's wired vs. verified](#whats-wired-vs-verified) for testing notes

---

## Hackathon judging notes

See [`docs/PITCH_SCRIPT.md`](docs/PITCH_SCRIPT.md) for a timed pitch script
(hook, live demo walkthrough, scope-honesty talking points, and likely judge
questions with answers) written to be said out loud, not read off a slide.

- **Best use of Cognee:** uses `add`/`cognify` (memory write) and `search`
  with `GRAPH_COMPLETION` (memory read/reasoning) scoped per patient —
  the cross-institution recall is genuinely synthesized by Cognee, not
  scripted.
- **Potential impact:** SDG 3, framed around under-resourced clinics and
  patients who fall through continuity-of-care gaps — a real, named problem,
  not a hypothetical.
- **Creativity:** multimodal fragment types + live cross-session proof +
  conflict surfacing in one coherent product, rather than a single feature
  demo.
- **Presentation:** the two-session live demo and the growing graph do the
  convincing without narration — see [Running the live demo](#running-the-live-demo).
- **Scope honesty:** this README's [Design decisions](#design-decisions--honesty-notes)
  section is written to be read out loud in a pitch — it's the "what we
  solved vs. what we're naming as out of scope" boundary a sharp judge will
  ask about anyway.




## Consent quick note

The patient portal at `http://localhost:5173/portal` now stores real consent state in Postgres. Patients can mark categories as `VISIBLE`, `CLINICIAN_ONLY`, or `EMERGENCY_ONLY`, but clinicians still have an audited break-glass path for care-critical information. That is intentional: hidden from the patient portal does not mean hidden from the care team when the case demands it.

## Vercel note

If you host the frontend on Vercel, set the project root to `frontend/` so
Vercel reads [frontend/vercel.json](</C:/Users/USER/Desktop/hackathon/continuum/frontend/vercel.json>).
That rewrite keeps client-side routes like `/portal` and `/login` from
404ing on refresh.
