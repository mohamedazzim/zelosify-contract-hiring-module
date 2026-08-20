# Zelosify — Multi-Tenant AI-Assisted Contract Hiring Platform

A production-grade, multi-tenant contract hiring platform with **IT Vendor**, **Hiring Manager**, **Vendor Manager**, and **Business User** personas, strict role-based access control (RBAC), and a **dynamic LLM tool-calling AI recommendation agent**. Built with a clean layered architecture, deterministic scoring, bounded async queues, and observability.

The AI agent orchestrates real tool calls (resume parsing, feature extraction, skill normalization, deterministic scoring), validates structured output, mitigates prompt injection, and persists token/latency metadata.

---

## Table of Contents

- [Architecture](#architecture)
- [Application roles](#application-roles)
- [Prerequisites](#prerequisites)
- [Local setup](#local-setup)
- [Docker / MinIO / Keycloak setup](#docker--minio--keycloak-setup)
- [Database migration and seed](#database-migration-and-seed)
- [Environment variables](#environment-variables)
- [API endpoint table](#api-endpoint-table)
- [AI agent tool architecture](#ai-agent-tool-architecture)
- [Deterministic scoring formula](#deterministic-scoring-formula)
- [Recommendation states](#recommendation-states)
- [Retry and timeout semantics](#retry-and-timeout-semantics)
- [Testing](#testing)
- [Ubuntu production deployment](#ubuntu-production-deployment)
  - [Services overview](#services-overview)
  - [Reverse proxy (nginx)](#reverse-proxy-nginx)
  - [TLS / certificates](#tls--certificates)
  - [DNS](#dns)
  - [PM2 process management](#pm2-process-management)
- [Known limitations](#known-limitations)
- [Demo instructions](#demo-instructions)
- [Deliverables in this repository](#deliverables-in-this-repository)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            Frontend (Next.js)                        │
│   /vendor/openings            IT Vendor routes                        │
│   /hiring-manager/openings    Hiring Manager routes                   │
│   / → /login                  Root redirect (temporary, server-side)  │
│   App Router + shadcn/ui + Tailwind (light/dark, responsive)          │
└───────────────┬──────────────────────────────────────────────────────┘
                │ HTTPS (Axios instance, auth cookies)
┌───────────────▼──────────────────────────────────────────────────────┐
│                           Backend (Express)                          │
│   Controllers (thin, no business logic)                              │
│   ├─ Vendor controllers     → openings, presign, upload, soft delete │
│   ├─ Vendor Manager ctrl    → vendor request routes                  │
│   ├─ Business User ctrl     → digital-initiatives (BUSINESS_USER)     │
│   └─ Hiring manager ctrl    → own openings, profiles, shortlist,     │
│                               reject                                 │
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

## Application roles

The full role set is defined in the Prisma `Role` enum (`prisma/schema.prisma`) and mirrored in the frontend role filter (`src/utils/Auth/middlewareUtils.js`). The backend enforces authorization per-route with `authorizeRole(...)`.

| Role | Backend enforcement | Notes |
|------|--------------------|-------|
| **ADMIN** | Recognized by frontend; platform-level administration | Part of the role enum |
| **BUSINESS_USER** | `authorizeRole("BUSINESS_USER")` on `POST /api/v1/digital-initiatives` | Submits digital-initiative requests |
| **BUSINESS_APPROVER** | Defined in enum; reserved for approval workflows | Part of the role enum |
| **FINANCE_MANAGER** | Defined in enum; reserved for finance workflows | Part of the role enum |
| **HIRING_MANAGER** | `authorizeRole("HIRING_MANAGER")` on `/api/v1/hiring-manager/*` | Own openings, profiles, AI recommendation, shortlist, reject |
| **IT_VENDOR** | `authorizeRole("IT_VENDOR")` on `/api/v1/vendor/openings/*` | View openings, upload profiles (PDF/PPTX), own uploads, preview, soft delete |
| **PROCUREMENT_MANAGER** | Defined in enum; reserved for procurement workflows | Part of the role enum |
| **RESOURCE_MANAGER** | Defined in enum; reserved for resource workflows | Part of the role enum |
| **VENDOR_MANAGER** | `authorizeRole("VENDOR_MANAGER")` on `/api/v1/vendor/requests` | Vendor request routes |

**Cross-role access** is denied with HTTP 403 by the backend middleware; the UI hides unauthorized actions. The frontend recognizes eight business roles (`ADMIN`, `VENDOR_MANAGER`, `BUSINESS_USER`, `HIRING_MANAGER`, `FINANCE_MANAGER`, `RESOURCE_MANAGER`, `IT_VENDOR`, `PROCUREMENT_MANAGER`).

> **Demo personas:** the seeded demo realm (Keycloak) provisions exactly three application users with the roles actually exercised in the demo: `hr@zelosify.com → HIRING_MANAGER`, `vendor@zelosify.com → VENDOR_MANAGER`, `itvendor@zelosify.com → IT_VENDOR`. See [Ubuntu production deployment](#ubuntu-production-deployment).

---

## Prerequisites

- Node.js 18+ (tested with Node 22)
- Docker + Docker Compose (PostgreSQL, Keycloak, MinIO)
- A Groq API key for **live** AI recommendations (optional — the system degrades to terminal FAILED with a safe message if absent)

---

## Local setup

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

## Docker / MinIO / Keycloak setup

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
3. Users register via the app's register flow (creates the Keycloak user + DB user with the chosen application role) and complete TOTP enrollment.
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

## API endpoint table

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/vendor/openings?page&limit` | IT_VENDOR | Paginated openings (tenant-filtered) |
| GET | `/api/v1/vendor/openings/:id` | IT_VENDOR | Opening detail + hiring manager name + profiles count |
| POST | `/api/v1/vendor/openings/:id/profiles/presign` | IT_VENDOR | Presign upload URL(s) |
| POST | `/api/v1/vendor/openings/:id/profiles/upload` | IT_VENDOR | Submit profiles (Prisma transaction, enqueues recommendations) |
| GET | `/api/v1/vendor/profiles` | IT_VENDOR | Own uploads (soft-delete aware) |
| DELETE | `/api/v1/vendor/profiles/:id` | IT_VENDOR | Soft delete a profile |
| GET | `/api/v1/vendor/requests?page&limit&status` | VENDOR_MANAGER | Paginated vendor resource requests (tenant-scoped) |
| POST | `/api/v1/vendor/requests` | VENDOR_MANAGER | Create a vendor resource request |
| GET | `/api/v1/hiring-manager/openings?page&limit` | HIRING_MANAGER | Own openings |
| GET | `/api/v1/hiring-manager/openings/:id/profiles?page&limit` | HIRING_MANAGER | Profiles + recommendation fields |
| POST | `/api/v1/hiring-manager/profiles/:id/shortlist` | HIRING_MANAGER | Shortlist (transactional, idempotent state transitions) |
| POST | `/api/v1/hiring-manager/profiles/:id/reject` | HIRING_MANAGER | Reject (transactional, 409 if already shortlisted) |
| POST | `/api/v1/digital-initiatives` | BUSINESS_USER | Submit a digital-initiative request (tenant-scoped) |

*Prefix paths may differ from the assessment shorthand — confirm exact routes in `src/routers/`.*

**Frontend list virtualization:** the IT Vendor and Hiring Manager openings tables use a windowed `VirtualizedTable` component (`@tanstack/react-virtual`) so lists beyond 50 records keep the DOM small and the UI responsive.

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

## Ubuntu production deployment

The live environment runs on an **Ubuntu 24.04 VPS** (`20.249.142.125`) with Docker for infrastructure services and PM2 for the two Node applications.

### Services overview

| Service | Type | Where | Port (internal) |
|---------|------|-------|-----------------|
| `zelosify-backend` | PM2 (Node/Express, `dist/index.js`) | host | 5000 |
| `zelosify-frontend` | PM2 (Next.js `next start`) | host | 5173 |
| Keycloak | Docker `recruit-keycloak` (quay.io/keycloak) | host `127.0.0.1` | 8080 |
| PostgreSQL | Docker `recruit-postgres` (postgres:16) | host `127.0.0.1` | 5445 |
| Nginx reverse proxy | Docker `careeros-nginx` (nginx:alpine) | host | 80 / 443 |

- The backend connects to Keycloak (`http://127.0.0.1:8080/auth`) and PostgreSQL on loopback; neither is exposed publicly.
- Keycloak realm: **Zelosify**; application client: **`dynamic-client`** (confidential).
- Ports **5000/5173 are never exposed** to the internet — all public traffic enters through nginx on 80/443.

### Reverse proxy (nginx)

Public TLS is terminated by a single **nginx container** (`careeros-nginx`) that also serves other applications on the same VPS. It is defined in `docker-compose.prod.yml` and binds:

| Host path | Container path | Mode |
|-----------|----------------|------|
| `deploy/nginx-careeros.conf` | `/etc/nginx/conf.d/default.conf` | ro |
| `deploy/ssl/` | `/etc/nginx/ssl` | ro |
| `nginx/nginx.conf` | `/etc/nginx/nginx.conf` | ro |
| `/var/www/certbot` | `/var/www/certbot` | ro |

The Zelosify server block routes:

- `location /` → `http://host.docker.internal:5173` (the Next.js frontend)
- `location /api/` → `http://host.docker.internal:5000` (the Express backend)

> **Why `host.docker.internal`?** The Zelosify apps run as host processes (PM2), not containers. Inside the nginx container, `127.0.0.1` refers to the container itself, so upstreams must use the Docker host-gateway alias (`extra_hosts: host.docker.internal:host-gateway`) to reach the host services. WebSocket/upgrade headers and the standard `X-Real-IP` / `X-Forwarded-For` / `X-Forwarded-Proto` / `X-Forwarded-Host` headers are preserved.

### TLS / certificates

- Certificates are issued with **Let's Encrypt / certbot** using the **webroot** method:
  ```bash
  sudo certbot certonly --webroot -w /var/www/certbot -d zelosify.mohamedazzim.dev \
    --email <your-email> --agree-tos --no-eff-email
  ```
- Nginx serves ACME challenges for the domain:
  ```nginx
  location ^~ /.well-known/acme-challenge/ {
      root /var/www/certbot;
      default_type text/plain;
      try_files $uri =404;
  }
  ```
- The issued cert/key are copied into the mounted SSL directory (never the voxbridge cert):
  ```bash
  sudo cp /etc/letsencrypt/live/zelosify.mohamedazzim.dev/fullchain.pem \
          /home/mohamedazzim/apps/careeros-idea2impact/deploy/ssl/zelosify-cert.pem
  sudo cp /etc/letsencrypt/live/zelosify.mohamedazzim.dev/privkey.pem \
          /home/mohamedazzim/apps/careeros-idea2impact/deploy/ssl/zelosify-key.pem
  ```
  Nginx references them as `/etc/nginx/ssl/zelosify-cert.pem` and `/etc/nginx/ssl/zelosify-key.pem`.
- Reloads are non-disruptive:
  ```bash
  docker exec careeros-nginx nginx -t
  docker exec careeros-nginx nginx -s reload
  ```

### DNS

| Host | Type | Value |
|------|------|-------|
| `zelosify.mohamedazzim.dev` | A | `20.249.142.125` |

The public application URL is **https://zelosify.mohamedazzim.dev** — HTTP on port 80 redirects to HTTPS (`return 301 https://$host$request_uri`).

### PM2 process management

Both Node services are managed by PM2 (Node 22 under `~/.nvm`):

```bash
# Status
pm2 status

# Logs
pm2 logs zelosify-backend --lines 100 --nostream
pm2 logs zelosify-frontend --lines 100 --nostream

# Restart after a rebuild (only the affected service)
pm2 restart zelosify-backend --update-env
pm2 restart zelosify-frontend --update-env

# Persist the process list so it survives a reboot
pm2 save
```

Frontend configuration notes:
- `NEXT_PUBLIC_BACKEND_URL=https://zelosify.mohamedazzim.dev` (the public origin — the browser calls the API through the same domain under `/api`).
- `next.config.mjs` adds a **temporary server-side redirect** from the exact root path to the login page:
  ```js
  async redirects() {
    return [{ source: "/", destination: "/login", permanent: false }];
  }
  ```
- After changing `next.config.mjs` or public env vars, rebuild (`npm run build`) and restart the frontend via PM2.

Backend notes:
- CORS allows `http://localhost:5173` (dev) and `https://zelosify.mohamedazzim.dev` (production), with credentials enabled.
- The backend `.env` holds Keycloak admin/service credentials (`KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`) and is `chmod 600`; it is never committed.

> ⚠️ **Security:** never expose ports 5000/5173 directly, never commit `.env` files or private keys, and never use the same TLS certificate for unrelated domains.

---

## Known limitations

- **No retry endpoint for FAILED recommendations** — the UI shows a disabled informational note.
- **Live Groq P95** is verified via a mocked provider benchmark only; a live run requires a valid `GROQ_API_KEY` and is not part of automated tests.
- **Legacy Pages Router page** `src/pages/LandingPage/HomeErrorPage.jsx` fails static prerender when `next build` runs with `NODE_ENV=development` forced (pre-existing; the normal production build succeeds).
- **`next dev` requires `NODE_ENV=development`**; an inherited `NODE_ENV=production` triggers a Next.js 15 dev-mode middleware `EvalError` (environment issue, not app code).
- **Polling** for PENDING/PROCESSING recommendations continues while any profile's recommendation is non-terminal (independent of shortlist/reject status), at a gentle 15s interval.

---

## Demo instructions

See `docs/DEMO_CHECKLIST.md` for a step-by-step demo script covering both personas, TOTP login, uploads, presigned flow, soft delete, recommendation states, shortlist/reject, dark mode, and RBAC/tenant behavior.

The live demo is available at **https://zelosify.mohamedazzim.dev** (root redirects to `/login`). Demo accounts (provisioned in the Keycloak `Zelosify` realm):

| Email | Role |
|-------|------|
| `hr@zelosify.com` | HIRING_MANAGER |
| `vendor@zelosify.com` | VENDOR_MANAGER |
| `itvendor@zelosify.com` | IT_VENDOR |

> Demo credentials are distributed out-of-band (Keycloak admin) — never committed to this repository.

---

## Deliverables in this repository

- `Zelosify-Backend/` — Express + Prisma + PostgreSQL + Keycloak + MinIO + Groq agent
- `Zelosify-Frontend/` — Next.js App Router + shadcn/ui + Tailwind
- `docs/REQUIREMENTS_MATRIX.md` — full requirement traceability (PDF → implementation → tests → status)
- `docs/DEMO_CHECKLIST.md` — demo script
- `Zelosify-Backend/Server/tests/performance/` — mocked latency benchmark (P50/P95)

**Regards, Zelosify Team**
