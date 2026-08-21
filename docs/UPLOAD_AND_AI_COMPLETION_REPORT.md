# Upload and AI Completion Report

## MinIO

| Check | Result |
|---|---|
| NSG rule status | Active (allow-minio-presigned-api-9443) |
| External health result | 200 (HTTPS zelosify.mohamedazzim.dev:9443) |
| Browser PDF upload | 200 (presign → PUT → submit) |
| Browser PPTX upload | Supported (same presign flow) |
| Unsupported-file rejection | 400 (PDF/PPTX only enforced) |
| Tenant/object scoping | Confirmed (key pattern: tenantId/openingId/timestamp_filename) |
| Console exposure check | Not exposed (bound to127.0.0.1:9001 only) |
| TLS cert | Valid (expires Nov18,2026) |

## Groq

| Check | Result |
|---|---|
| Available models |13 models (prompt-guard, gpt-oss-20b, gpt-oss-120b, qwen3.6-27b, etc.) |
| Tool-calling probe | gpt-oss-20b: 200 (555ms), gpt-oss-120b: 200 (700ms) |
| JSON/schema probe | gpt-oss-20b: 200 (351ms) |
| Recommendation result | FAILED (malformed JSON in tool call arguments) |
| Root cause | All available models generate malformed JSON in tool call arguments |

## Gemini

| Check | Result |
|---|---|
| API key | Configured (53 chars) |
| Available models | gemini-3.5-flash-lite, gemini-2.5-flash, gemini-2.5-pro, etc. |
| Tool-calling probe | FAILED (requires thought_signature for newer models) |
| Recommendation result | FAILED (thought_signature required) |
| Root cause | Available models require thought_signature for tool calling |

## Deterministic Fallback

| Check | Result |
|---|---|
| Fallback trigger | GROQ_API_ERROR or GEMINI_API_ERROR |
| Deterministic scorer | Working (0.5*skill +0.3*exp +0.2*location) |
| Fallback result | COMPLETED with score0.2 (NOT_RECOMMENDED) |
| Fallback reason | "Deterministic evaluation completed; AI recommendation unavailable." |
| Latency |2105-2302ms |

## End-to-End

| Check | Result |
|---|---|
| Opening visibility |12 openings visible to HM and IT Vendor |
| Upload | 200 (presign → PUT → submit) |
| Profile submission | success (status: SUBMITTED) |
| Recommendation status | COMPLETED (deterministic fallback) |
| Hiring Manager review | Can see profiles with score, reason, latency |
| Shortlist/reject | Available (401 on expired session, works with fresh login) |
| RBAC | 403 cross-role (IT Vendor → HM endpoints) |
| Tenant isolation | Confirmed (all queries scoped to tenantId) |

## Engineering

| Check | Result |
|---|---|
| Files changed | geminiClient.ts, recommendationService.ts, groqClient.ts |
| Tests |175/175 PASS |
| Build results | Backend: PASS, Frontend: PASS |
| Secret scan | PASS (no secrets in tracked files) |
| Deployment commit | a0196c7 (feature/complete-pdf-requirements) |
| Remaining risks | LLM tool-calling unavailable (Groq/Gemini limitations) |

## Remaining Risks

1. **LLM tool-calling unavailable**: Both Groq and Gemini models have limitations that prevent reliable tool calling. The system falls back to deterministic scoring.
2. **Deterministic fallback**: The fallback uses default features (0 experience, empty skills, unknown location) which results in low scores. Real resume parsing requires LLM tool-calling.
3. **Azure NSG**: Port9443 is open for MinIO, but the MinIO console (9001) is not exposed (correct behavior).

## Rollback Instructions

1. **Database backup**: `~/apps/zelosify/zelosify_pre_seed_20260821.dump`
2. **Nginx config backup**: `~/apps/zelosify/nginx-careeros.conf.backup`
3. **PM2 restart**: `pm2 restart zelosify-backend zelosify-frontend`
4. **MinIO container**: `docker stop recruit-minio && docker rm recruit-minio`

---

**Report generated**:2026-08-21
**Deployed commit**: a0196c7 (feature/complete-pdf-requirements)
**PR**: https://github.com/mohamedazzim/zelosify-contract-hiring-module/pull/4 (merged)
