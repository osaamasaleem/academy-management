# Development Roadmap & Deployment Guide

**Document 04 of 04 · Execution Roadmap**
Repository Structure · Environment Configuration · Phased Implementation Plan · **Version 1.1** (v1.0 + review fixes)

> **For AI coding agents:** Build in the phase order below. Read all four docs first. Do not move to the next phase until the current phase's **Definition of Done** passes. Items tagged **[v1.1]** are new or changed.

## Changelog v1.0 → v1.1

- Deployment changed to a **same-origin proxy** (fixes cookie auth across Vercel/Render).
- Added Phase 0 (scaffolding), tests per phase, Definition of Done, hardening/launch checklist (Phase 5).
- Added dashboard, fee summary, audit log, change-password to the build plan.
- Added libraries: zod, express-rate-limit, pino, TanStack Query, React Router, react-hook-form.
- Added extra env vars, free-tier caveats, backup/restore, agent instructions.

---

## 1. Recommended Technology Stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React (Vite) + Tailwind CSS **+ React Router, TanStack Query, react-hook-form + zod [v1.1]** | Mobile-first for teachers, desktop-friendly for Principal. Host: Vercel or Cloudflare Pages. |
| Backend | Node.js (LTS) + Express **+ zod, express-rate-limit, pino, helmet [v1.1]** | REST API, bcrypt + JWT in HttpOnly cookie. Host: Render / Railway. |
| Database | PostgreSQL 15+ | Neon or Supabase. Use the **direct/pooled connection string as the provider documents** for serverless-style pools. |
| Testing **[v1.1]** | Vitest or Jest + Supertest (backend); Vitest + Testing Library (frontend) | Permission-matrix tests are mandatory. |

**Free-tier caveats [v1.1]** (verify current provider terms before launch): free API hosts may sleep after inactivity (slow first login), and free databases may pause or keep only short backup history. For a live academy handling fee records, plan a low-cost paid tier or an uptime ping for the API, and keep an off-platform `pg_dump` copy.

---

## 2. Project Repository Structure

```
academy-management-system/
├── AGENTS.md                      # [v1.1] short rules for AI agents (see §7) — also copy as CLAUDE.md / .cursorrules if desired
├── README.md                      # [v1.1] local setup + deploy steps
├── docs/
│   ├── 01_SRS_Academy_Management_System.md
│   ├── 02_DATABASE_SCHEMA_Academy_System.md
│   ├── 03_API_ENDPOINTS_Academy_System.md
│   └── 04_DEVELOPMENT_ROADMAP_Academy_System.md
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js                  # pg Pool
│   │   │   └── env.js                 # [v1.1] validates env vars at boot (zod), fails fast
│   │   ├── middleware/
│   │   │   ├── verifyAuth.js          # JWT cookie + live is_active + token_version
│   │   │   ├── requirePermission.js   # admin passthrough + flag check
│   │   │   ├── requireAdmin.js        # [v1.1]
│   │   │   ├── validate.js            # [v1.1] zod wrapper for body/query/params
│   │   │   ├── originCheck.js         # [v1.1] CSRF origin/referer check
│   │   │   ├── rateLimit.js           # [v1.1]
│   │   │   └── errorHandler.js        # [v1.1] uniform error JSON, no stack in prod
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── teacher.routes.js
│   │   │   ├── student.routes.js
│   │   │   ├── fee.routes.js
│   │   │   ├── attendance.routes.js
│   │   │   ├── dashboard.routes.js    # [v1.1]
│   │   │   ├── audit.routes.js        # [v1.1]
│   │   │   └── health.routes.js       # [v1.1]
│   │   ├── services/                  # [v1.1] business logic (billing period, due date, audit writer)
│   │   ├── scripts/
│   │   │   ├── seedAdmin.js           # CLI: create initial Principal
│   │   │   └── resetAdminPassword.js  # [v1.1] CLI recovery
│   │   ├── app.js                     # [v1.1] express app (importable by tests)
│   │   └── server.js                  # listen()
│   ├── tests/                         # [v1.1]
│   ├── migrations/                    # [v1.1] 001_init.sql = schema.sql; later changes numbered
│   ├── schema.sql
│   ├── .env.example
│   └── package.json
└── frontend/
    ├── src/
    │   ├── api/axiosClient.js         # baseURL '/api', withCredentials: true
    │   ├── context/AuthContext.jsx    # logged-in user + permission flags
    │   ├── components/
    │   │   ├── Layout.jsx             # sidebar shows only permitted links
    │   │   ├── ProtectedRoute.jsx     # UX guard only — server enforces security
    │   │   └── ui/                    # [v1.1] Modal, Table, Pagination, Toast, ConfirmDialog
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   ├── Dashboard.jsx
    │   │   ├── Teachers.jsx
    │   │   ├── Students.jsx
    │   │   ├── FeeManagement.jsx
    │   │   ├── StudentFeeHistory.jsx
    │   │   ├── MarkAttendance.jsx
    │   │   ├── MyAttendance.jsx
    │   │   ├── ChangePassword.jsx     # [v1.1]
    │   │   └── AuditLog.jsx           # [v1.1] admin only
    │   └── App.jsx
    ├── vercel.json                    # [v1.1] /api rewrite to backend (see API spec §2.2)
    ├── vite.config.js                 # [v1.1] dev proxy /api -> http://localhost:5000
    └── package.json
```

---

## 3. Environment Variables (`backend/.env.example`)

```
PORT=5000
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/academy_db?sslmode=require
JWT_SECRET=replace_with_strong_64_char_random_secret   # generate: openssl rand -hex 32
JWT_EXPIRES_IN=7d
CLIENT_ORIGIN=https://your-academy-app.vercel.app      # used for Origin check (and CORS only if cross-origin)
COOKIE_SECURE=true                                     # [v1.1] false only for local http dev
TZ=Asia/Karachi                                        # [v1.1]
TRUST_PROXY=1                                          # [v1.1] required behind Render/Vercel
BCRYPT_COST=12                                         # [v1.1]
LOGIN_RATE_MAX=10                                      # [v1.1] attempts per window
LOGIN_RATE_WINDOW_MIN=15                               # [v1.1]
# seedAdmin.js reads these once, then they should be removed:
SEED_ADMIN_USERNAME=
SEED_ADMIN_PASSWORD=
SEED_ADMIN_NAME=
SEED_ADMIN_PHONE=
```
Never commit `.env`. Rotate `JWT_SECRET` if ever exposed (all sessions then end).

---

## 4. Phased Build & Launch Plan

### Phase 0 — Scaffolding **[v1.1]**
1. Create the repo structure, `README.md`, `AGENTS.md`, linting/formatting, `.gitignore` (`.env`, `node_modules`).
2. Backend: Express app with helmet, cookie-parser, JSON body limit, pino logger, error handler, `/api/health`. Frontend: Vite + Tailwind + Router + Query.
3. Local dev: Postgres (Docker `docker-compose.yml` or a free cloud DB), Vite proxy to the API.

**DoD:** `npm run dev` runs both apps; `/api/health` returns ok from the frontend origin.

### Phase 1 — Database & Authentication Core
1. Create the PostgreSQL project (Neon/Supabase) and run `schema.sql` (as migration `001`).
2. Env validation, `db.js`, `helmet`, `cookie-parser`, bcrypt, rate limiter, origin check.
3. `seedAdmin.js` and `resetAdminPassword.js`.
4. Build `/api/auth/login`, `logout`, `me`, `change-password`, plus `verifyAuth`, `requirePermission`, `requireAdmin`.
5. Frontend: `Login.jsx`, `AuthContext`, `ProtectedRoute`, `Layout`, `ChangePassword.jsx`.

**DoD / tests:** login success/failure (generic message); 11th rapid attempt → 429; archived user with a valid old cookie → 401; password change invalidates the old cookie; cookie is `HttpOnly` (+`Secure` in prod).

### Phase 2 — Teacher Management & Granular Permissions
1. `/api/teachers` (list, get, create, patch whitelist, archive) with safeguards (no role change, no second admin, cannot archive admin) and audit logging.
2. `Teachers.jsx`: onboarding modal (Full Name, Username, Password, Phone compulsory), edit, archive/restore, **instant toggle switches** for the four flags (optimistic UI with rollback on error).

**DoD / tests:** flag toggle takes effect on the teacher's next request without re-login; duplicate username (any case) → 409; PATCH with `role` → rejected.

### Phase 3 — Student Onboarding & Monthly Fee Ledger
1. `/api/students` (+ archive), pagination, search, Grade 1–12 and Group filters; `Students.jsx` with Add/Edit modal and compulsory fields + Fee Due Day (default 1) + Fee Note.
2. `services/billing.js`: due-date clamp, overdue, eligible-period rules (SRS §1.4).
3. `/api/fees` (sheet with implicit unpaid rows), `/api/fees/summary`, `/api/fees/student/:id`, `/api/fees/record` (upsert, snapshot, revert = admin only, audit).
4. `FeeManagement.jsx` (Due-day badges "Due: 1st / Due: 17th", Paid/Unpaid/Overdue, one-click **Mark Paid** modal: date, amount, remarks) and `StudentFeeHistory.jsx`.

**DoD / tests:** unit tests for due-date clamp (31 in Feb), overdue, admission-month start; sheet lists unpaid students with no row; concurrent creates give distinct roll numbers; fee-only teacher cannot see guardian phone; archived student's history still loads.

### Phase 4 — Teacher Attendance, Dashboard & Audit
1. `/api/attendance/my` (scoped to `req.user.id`), `MyAttendance.jsx`.
2. `/api/attendance` + `/bulk` + `/teacher/:id`, `MarkAttendance.jsx` (default-all-present helper allowed but must be explicit before saving).
3. `/api/dashboard/summary`, `Dashboard.jsx`; `/api/audit-logs`, `AuditLog.jsx` (admin).

**DoD / tests:** `/attendance/my?teacher_id=2` still returns only the caller's rows; delegated teacher cannot mark their own record, cannot mark past dates; future dates rejected; unmarked days show "Not marked".

### Phase 5 — Hardening & Online Deployment **[v1.1]**
1. Run the full **endpoint × role test matrix** (API spec §10) in CI.
2. Deploy backend (Render/Railway) with env vars, `TRUST_PROXY=1`; deploy frontend (Vercel) with the `/api` rewrite; HTTPS everywhere.
3. Run `seedAdmin.js` on production, log in, **change the seeded password**, remove `SEED_*` vars.
4. Enable backups; **perform one test restore**; set up an uptime ping on `/api/health`.
5. Smoke-test on a real phone (login, mark attendance, mark a fee paid).

**Launch checklist:** cookie flags correct in prod · no secrets in repo · rate limit active · error responses hide stack traces · CNIC/phones absent from logs · backup restored once · admin recovery script tested.

---

## 5. Definition of Done (every phase)
- All endpoints in scope match `03_API_ENDPOINTS` (paths, status codes, error format).
- Permission checks enforced **server-side**; tests exist for allow and deny cases.
- Input validated; SQL parameterised; no secrets/PII in logs.
- UI works at 360 px width; loading, empty and error states handled.
- README updated with any new command or env var.

## 6. Suggested Future Work (after v1)
Printable fee receipts · WhatsApp/SMS reminders · defaulter export (CSV/Excel) · partial payments/discounts · student attendance · parent portal · Urdu/RTL UI.

## 7. Instructions for AI Coding Agents (copy into `AGENTS.md` / `CLAUDE.md` / `.cursorrules`)

```
Project: Academy Management System (Grade 1–12 academy). Specs live in /docs — read all four before coding.
Stack: React+Vite+Tailwind (frontend), Node+Express (backend), PostgreSQL 15+.
Rules:
1. Follow the build order in docs/04 phases. One phase at a time; run tests before moving on.
2. Authorization is server-side only. Every route uses verifyAuth then requirePermission/requireAdmin. Never trust the client or UI hiding.
3. Never hard-delete students, teachers, fees or attendance — archive instead.
4. Dates are Asia/Karachi calendar dates. Never use the server's UTC "today".
5. Validate all input with zod; parameterised SQL only; never log passwords, hashes, CNIC.
6. Do not put permissions inside the JWT; read flags from the DB on every request.
7. Fee sheet must include students with no fee_records row (unpaid). fee_amount is a snapshot.
8. If a spec is ambiguous or conflicts, ask the user — do not invent; list assumptions in the PR/summary.
9. Keep docs in /docs in sync when behaviour changes.
```
