# Demo Checklist — Zelosify Contract Hiring Module

Step-by-step demo script for the two personas. Prereqs: backend running (`npm run dev` from `Zelosify-Backend/Server`), frontend running (`npm run dev` from `Zelosify-Frontend` with `NODE_ENV=development`), Docker services up (Postgres 5445, Keycloak 8080, MinIO 9000), migrations applied, seed run.

---

## 1. IT Vendor login / TOTP

- [ ] Open the app login page.
- [ ] Sign in as an IT_VENDOR user (register one first if none exists: Register → choose IT_VENDOR → complete TOTP setup).
- [ ] After TOTP verification, the user is redirected to the vendor dashboard.
- [ ] Sidebar shows the vendor menu (Openings, Payments).

## 2. Openings list

- [ ] Navigate to `/vendor/openings`.
- [ ] Table renders: Title, Location, Contract Type, Posted Date, Hiring Manager Name.
- [ ] Pagination works if more than one page of openings.
- [ ] Empty/loading/error states behave (skeleton on first load).

## 3. Opening details

- [ ] Click an opening row → `/vendor/openings/[id]`.
- [ ] Details render: description, experience range, expected completion date, action date, status.
- [ ] Uploaded profiles list (if any) shows filename, date, status.

## 4. Multi-file PDF/PPTX upload

- [ ] Drag two files into the dropzone (one `.pdf`, one `.pptx`).
- [ ] Both files appear in the pending-upload list with size/type validation.
- [ ] Only PDF/PPTX accepted; other types are rejected with a message.

## 5. Presigned upload flow

- [ ] Click "Submit" — the UI calls the presign endpoint, uploads each file directly to MinIO using the returned presigned URL, then confirms submission.
- [ ] Verify in MinIO console (port 9000) that files landed under `<bucket>/<tenantId>/<openingId>/<timestamp>_<filename>`.
- [ ] Verify no direct storage credentials are used by the frontend (all through backend).

## 6. Vendor profile list

- [ ] The uploaded profiles now appear in the vendor's profile list.
- [ ] A vendor cannot see another vendor's profiles (create a second IT_VENDOR to verify they see zero).

## 7. Preview

- [ ] Click "Preview" on a profile — a backend-rendered preview (PDF or PPTX text extraction) opens.
- [ ] Preview does not expose the raw s3Key or presigned URL in the UI.

## 8. Soft delete

- [ ] Click delete on a profile → confirmation.
- [ ] Profile disappears from the active list (soft-deleted row remains in DB with `isDeleted=true`).
- [ ] Reload — it stays hidden.

## 9. Hiring Manager login / TOTP

- [ ] Sign out, then sign in as a HIRING_MANAGER (baseline `bruce.wayne` or a registered manager).
- [ ] After TOTP, redirected to `/hiring-manager/openings`.
- [ ] Sidebar shows the manager menu (Openings only).

## 10. Manager-owned openings

- [ ] Openings list shows **only** the manager's openings (verified: 12 for `bruce.wayne`).
- [ ] A second manager sees **zero** openings (RBAC/tenant isolation).

## 11. Recommendation states

- [ ] Open an opening detail with submitted profiles.
- [ ] PENDING profiles show a skeleton + "pending" copy (no stale score).
- [ ] PROCESSING shows a spinner badge (visible during live Groq processing).
- [ ] COMPLETED shows the recommendation badge.
- [ ] FAILED shows a safe message ("could not be completed") — no stack traces or API errors.

## 12. Score / explanation / confidence / latency

- [ ] For a COMPLETED profile, the card shows:
  - Recommendation badge (Recommended / Borderline / Not Recommended)
  - Score % (e.g. 92%)
  - Confidence % (e.g. 90%)
  - Explanation (deterministic scoring reason)
  - Processing time / latency (e.g. 1.24s)
- [ ] All values match what the backend persisted (check DB `hiringProfile` recommendation fields).

## 13. Shortlist

- [ ] Click "Shortlist" on a SUBMITTED profile.
- [ ] Status updates to SHORTLISTED **without a page reload**; buttons hide; toast confirms.
- [ ] Recommendation fields are preserved.

## 14. Reject confirmation

- [ ] Click "Reject" → AlertDialog confirmation appears with Cancel/Reject.
- [ ] Cancel does nothing; confirm rejects.
- [ ] Status updates to REJECTED without reload; toast confirms.
- [ ] Attempting to reject a SHORTLISTED profile is impossible from the UI (button hidden); the backend returns 409 if forced.

## 15. Dark mode

- [ ] Toggle the theme (existing theme provider).
- [ ] List, detail, cards, badges, dialogs, and empty states all render correctly in dark mode.

## 16. Tenant / RBAC behavior

- [ ] IT_VENDOR navigating to `/hiring-manager/openings` is denied (backend 403 → safe error state).
- [ ] HIRING_MANAGER navigating to `/vendor/openings` is denied.
- [ ] No tenant IDs, user IDs, or s3Keys appear anywhere in the UI.
- [ ] A vendor's uploads are invisible to other vendors; a manager's openings are invisible to other managers.

---

## Features requiring a live Groq key

| Feature | Requirement |
|---------|-------------|
| Live AI recommendation (real LLM tool-calling) | `GROQ_API_KEY` set in the backend `.env` |
| PROCESSING state visibility | Only observable while a real recommendation is in flight (queue processes PENDING → PROCESSING → COMPLETED) |
| Real-world P95 latency | Needs a live provider; the mocked benchmark (`tests/performance`) demonstrates the SLAs offline |

Without `GROQ_API_KEY`, the system still functions: uploads, presign, preview, soft delete, shortlist, reject, and all RBAC/tenant behavior work; recommendations fail fast with a **safe terminal FAILED** message (by design — auth/config errors are never retried).
