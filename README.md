# Zelosify — Multi-Tenant AI-Assisted Contract Hiring Platform

A production-grade, multi-tenant contract hiring module with an **IT Vendor** persona, a **Hiring Manager** persona, and a **dynamic LLM tool-calling AI recommendation agent**. Built with a clean layered architecture, strict RBAC, deterministic scoring, bounded async queues, and observability.

This is **not** a CRUD assignment — the AI agent orchestrates real tool calls (resume parsing, feature extraction, skill normalization, deterministic scoring), validates structured output, mitigates prompt injection, and persists token/latency metadata.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Frontend (Next.js)                        │
│   /vendor/openings            IT Vendor routes                        │
│   /hiring-manager/openings    Hiring Manager routes                   │
│   App Router + shadcn/ui + Tailwind (light/dark, responsive)          │
└───────────────┬──────────────────────────────────────────────────────┘
                │ HTTPS (Axios instance, auth cookies)
┌───────────────▼──────────────────────────────────────────────────────┐
│                           Backend (Express)                          │
│   Controllers (thin, no business logic)                              │
│   ├─ Vendor controllers  → openings, presign, upload, soft delete    │
│   └─ Hiring manager ctrl → own openings, profiles, shortlist, reject │
│   Middleware: authenticate (JWT) + authorize (role) + tenant scope   │
└───────────────┬──────────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────────┐
│                     Recommendation Pipeline (async)                  │
│   RecommendationService  →  Agent Orchestrator  →  LLM Core (Groq)   │
│        │                        │                    (tool calling)   │
│        │                        ▼                                    │
│        │                  Tool Registry                              │
│        │                  ├─ parse_resume_document  (PDF/PPTX + S3)  │
│        │                  ├─ extract_candidate_features              │
│        │                  ├─ normalize_skills                        │
│        │                  ├─ calculate_deterministic_score           │
│        │                  └─ (Schema Validator on every tool output) │
│        │                        │                                    │
│        │                        ▼                                    │
│        │                  Decision Policy (thresholds)               │
│        │                        │                                    │
│        └──────────────►  Persist Result (transaction + AgentRun)     │
│                                                                      │
│   Queue: RecommendationQueue (bounded concurrency, coalescing)       │
│   Recovery: startupRecovery (stale PROCESSING reset, bounded)        │
│   SLA: 1500ms deadline per profile; P95 < 2000ms                     │
└───────────────┬──────────────────────────────────────────────────────┘
                │
  ┌─────────────┴──────────────┬──────────────────┬──────────────────┐
  ▼                            ▼                  ▼                  ▼
PostgreSQL (Prisma)        Keycloak (auth)     MinIO / S3 (files)  Groq (LLM)
```

**Layering rules enforced by design:**
- Controllers contain **no business logic** — they delegate to services.
- The LLM never reads raw DB models and never calculates scores.
- The deterministic scoring engine is a **callable tool** the agent invokes.
- Every tool output passes an AJV schema validator before persistence.
- Resume content is sanitized before entering any prompt.

---

## Prerequisites

- Node.js 18+ (tested with Node 24)
- Docker + Docker Compose (PostgreSQL, Keycloak, MinIO)
- A Groq API key for **live** AI recommendations (optional — the system degrades to terminal FAILED with a safe message if absent)

---

## Setup

### 1. Backend

```bash
cd Zelosify-Backend/Server
npm install
cp .env.example .env        # then fill in local values
npx prisma generate
```

### 2. Frontend

```bash
cd Zelosify-Frontend
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_BACKEND_URL
```

---

## Docker / MinIO setup

```bash
cd Zelosify-Backend/Server
docker compose up -d
```

This starts (see `docker-compose.yml`):

| Service   | Port  | Purpose                          |
|-----------|-------|----------------------------------|
| PostgreSQL | 5445 | Primary database (`zelosify_recruit_test`) |
| Keycloak  | 8080  | OIDC identity provider (realm `zelosify`) |
| MinIO     | 9000  | S3-compatible object storage     |

### MinIO notes

- Default local credentials are set in `docker-compose.yml` (dev-only).
- Files are stored under `<bucket>/<tenantId>/<openingId>/<timestamp>_<filename>`.
- The frontend never talks to MinIO directly — it uses backend presigned URLs.

### Keycloak setup

1. Realm `zelosify` must exist with a dynamic client (e.g. `zelosify-dynamic-client`).
2. The backend validates JWTs against the realm's RS256 signature (`KEYCLOAK_RS256_SIG`).
3. Users register via the app's register flow (creates the Keycloak user + DB user with role IT_VENDOR or HIRING_MANAGER) and complete TOTP enrollment.
4. Login is password-grant + TOTP verify; the backend sets auth cookies.

---

## Database migration and seed

```bash
cd Zelosify-Backend/Server

# Apply migrations (non-destructive)
npm run prisma:deploy

# Generate the Prisma client
npm run prisma:generate

# Seed: creates tenant "Bruce Wayne Corp", baseline hiring manager bruce.wayne, and 12 openings
npm run seed:openings
```

**Seed baseline (verified):**
- 1 tenant: `Bruce Wayne Corp`
- 12 openings (10 OPEN, 1 ON_HOLD, 1 CLOSED) across varied roles, experience ranges, and contract types
- 1 baseline user: `bruce.wayne` (HIRING_MANAGER)
- 0 profiles, 0 AgentRuns

> ⚠️ Never run `npm run prisma:reset` against a shared/live database — it drops all data.

---

## Environment variables

See `Zelosify-Backend/Server/.env.example` and `Zelosify-Frontend/.env.local.example`. All values are placeholders:

```
DATABASE_URL=postgresql://replace_with_local_user:replace_with_local_password@localhost:5445/zelosify_recruit_test
KEYCLOAK_CLIENT_SECRET=replace_with_local_secret
SESSION_SECRET=replace_with_local_secret
JWT_SECRET=replace_with_local_secret
S3_ACCESS_KEY_ID=replace_with_local_secret
S3_SECRET_ACCESS_KEY=replace_with_local_secret
GROQ_API_KEY=replace_with_local_secret
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

Never commit real `.env` files, tokens, TOTP secrets, presigned URLs, or private keys.

---

## User roles

| Role | Permissions |
|------|-------------|
| **IT_VENDOR** | View openings in their tenant; upload profiles (PDF/PPTX); view only their own uploads; preview; soft delete. **Cannot** see other vendors' uploads, AI recommendations, or shortlist/reject. |
| **HIRING_MANAGER** | View only their own openings; view submitted profiles; see AI recommendation (badge, score %, confidence %, explanation, latency); shortlist; reject. Enforced: `opening.hiringManagerId === loggedInUser.id`. |
| (Blocked) | Any cross-role access is denied with 403 by the backend; UI hides unauthorized actions. |

---

## API endpoint table

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/vendor/openings?page&limit` | IT_VENDOR | Paginated openings (tenant-filtered) |
| GET | `/api/v1/vendor/openings/:id` | IT_VENDOR | Opening detail + hiring manager name + profiles count |
| POST | `/api/v1/vendor/openings/:id/profiles/presign` | IT_VENDOR | Presign upload URL(s) |
| POST | `/api/v1/vendor/openings/:id/profiles/upload` | IT_VENDOR | Submit profiles (Prisma transaction, enqueues recommendations) |
| GET | `/api/v1/vendor/profiles` | IT_VENDOR | Own uploads (soft-delete aware) |
| DELETE | `/api/v1/vendor/profiles/:id` | IT_VENDOR | Soft delete a profile |
| GET | `/api/v1/hiring-manager/openings?page&limit` | HIRING_MANAGER | Own openings |
| GET | `/api/v1/hiring-manager/openings/:id/profiles?page&limit` | HIRING_MANAGER | Profiles + recommendation fields |
| POST | `/api/v1/hiring-manager/profiles/:id/shortlist` | HIRING_MANAGER | Shortlist (transactional, idempotent state transitions) |
| POST | `/api/v1/hiring-manager/profiles/:id/reject` | HIRING_MANAGER | Reject (transactional, 409 if already shortlisted) |

*Prefix paths may differ from the assessment shorthand — confirm exact routes in `src/routers/`.*

---

## AI agent tool architecture

The agent is a **multi-turn tool-calling loop** (`agentOrchestrator.ts`):

1. Builds an initial message from opening criteria (no raw resume in prompts).
2. Calls the LLM (`GroqLlmClient.complete`) with tool definitions.
3. The LLM **dynamically decides** which tool to invoke each turn.
4. Each tool result is **AJV-validated** before being appended to the conversation.
5. The deterministic scoring tool returns a validated breakdown; the agent builds the final explanation from it.
6. The final structured output (`recommended`, `score`, `confidence`, `reason`) is schema-validated, then persisted in a transaction with an `AgentRun` row (tokens, tool invocations, latency).

**Tools:** `parse_resume_document` (PDF/PPTX via S3), `extract_candidate_features`, `normalize_skills`, `calculate_deterministic_score`.

**Prompt-injection mitigation:** resume text passes through `promptSanitizer.ts` (PII redaction, length bounds, control-character stripping) before any prompt construction; raw resume content is never injected into system prompts.

---

## Deterministic scoring formula

```
experienceMatchScore:
  candidateExp < minExp        → 0
  minExp ≤ candidateExp ≤ maxExp → 1
  candidateExp > maxExp       → 0.8

skillMatchScore   = matchedRequiredSkills / totalRequiredSkills
locationMatchScore = Remote→1 | exact match→1 | onsite mismatch→0.5

FinalScore = (0.5 × skillMatchScore) + (0.3 × experienceMatchScore) + (0.2 × locationMatchScore)
```

Thresholds (applied outside the LLM):

| FinalScore   | Decision         |
|--------------|------------------|
| ≥ 0.75       | Recommended      |
| 0.50 – 0.74  | Borderline       |
| < 0.50       | Not Recommended  |

---

## Recommendation states

Persisted on `hiringProfile.recommendationStatus`:

| Status     | Meaning                                                        |
|------------|----------------------------------------------------------------|
| PENDING    | Uploaded; queued for processing                                |
| PROCESSING | Claimed by a worker (attempt count incremented atomically)     |
| COMPLETED  | Score/confidence/reason/latency persisted                      |
| FAILED     | Terminal failure (SLA exceeded, auth error, or attempts exhausted) |

---

## Retry and timeout semantics

- **Queue-level transient retries:** bounded (`MAX_TRANSIENT_RETRIES = 2`), for rate-limit/timeout/abort only. One worker execution.
- **Worker concurrency:** `MAX_CONCURRENCY = 3` concurrent workers (production default; benchmark mirrors this value).
- **Durable attempts:** `hiringProfile.recommendationAttemptCount`, incremented atomically on claim, capped at `MAX_RECOMMENDATION_ATTEMPTS = 3` across **process restarts**. At the cap the profile is terminal FAILED with `MAX_RECOMMENDATION_ATTEMPTS_EXCEEDED` and is never re-claimed.
- **Auth/config errors** (`LLM_AUTHENTICATION_ERROR`, `LLM_CLIENT_ERROR`, `GROQ_API_ERROR`) are terminal immediately — never retried.
- **Startup recovery:** resets only stale PROCESSING profiles (>60s), re-enqueues PENDING only if under the cap, never re-enqueues terminal FAILED.
- **SLA:** 1500ms deadline per profile; latency persisted in `recommendationLatencyMs`; P95 target < 2000ms.

---

## Testing

```bash
# Backend unit tests (fully isolated from the dev DB — mocked Prisma)
cd Zelosify-Backend/Server
npm test -- --run            # 166 tests

# TypeScript
npx tsc --noEmit

# Prisma status
npx prisma migrate status

# Performance benchmark (mocked provider, 100 profiles, P50/P95/max)
npx vitest run --config vitest.performance.config.ts

# Frontend lint + production build
cd Zelosify-Frontend
npm run lint
npm run build
```

The unit suite runs **without Docker/Postgres** — a test-isolation guard (`tests/setup/testIsolationGuard.ts`) throws if any test instantiates the real Prisma client.

---

## Known limitations

- **No retry endpoint for FAILED recommendations** — the UI shows a disabled informational note.
- **Virtualization for >50 records is not implemented** — no virtualization library is installed; the profile list relies on pagination.
- **P95 < 2000ms is verified via a mocked provider benchmark only.** A live Groq run requires a valid `GROQ_API_KEY` and is not part of automated tests.
- **Legacy Pages Router page** `src/pages/LandingPage/HomeErrorPage.jsx` fails static prerender when `next build` runs with `NODE_ENV=development` forced (pre-existing; the normal production build succeeds).
- **`next dev` requires `NODE_ENV=development`**; an inherited `NODE_ENV=production` triggers a Next.js 15 dev-mode middleware `EvalError` (environment issue, not app code).
- **Polling** for PENDING/PROCESSING recommendations continues while any profile's recommendation is non-terminal (independent of shortlist/reject status), at a gentle 15s interval.

---

## Demo instructions

See `docs/DEMO_CHECKLIST.md` for a step-by-step demo script covering both personas, TOTP login, uploads, presigned flow, soft delete, recommendation states, shortlist/reject, dark mode, and RBAC/tenant behavior.

---

## Deliverables in this repository

- `Zelosify-Backend/` — Express + Prisma + PostgreSQL + Keycloak + MinIO + Groq agent
- `Zelosify-Frontend/` — Next.js App Router + shadcn/ui + Tailwind
- `docs/REQUIREMENTS_MATRIX.md` — full requirement traceability (PDF → implementation → tests → status)
- `docs/DEMO_CHECKLIST.md` — demo script
- `Zelosify-Backend/Server/tests/performance/` — mocked latency benchmark (P50/P95)

**Regards, Zelosify Team**
