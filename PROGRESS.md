# Development Progress Log

Project: Academy Management System (AMS)
Repository: https://github.com/osaamasaleem/academy-management.git

---

## Phase 0: Scaffolding & Setup (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - `AGENTS.md`: Agent rules, DB snapshot conventions, Asia/Karachi timezone, soft deletes.
  - `README.md` & `.gitignore`: Configured for root, backend, frontend, ignoring secrets and node_modules.
  - `backend/`:
    - Express server with Helmet, Cookie-Parser, Pino logging, Zod environment validation.
    - Standard error handler & `/api/health` route.
    - PostgreSQL baseline schema (`schema.sql` and `migrations/001_init.sql`).
    - Verified health endpoint smoke test: `200 OK`.
  - `frontend/`:
    - React + Vite + Tailwind CSS configuration.
    - Axios instance (`api/axiosClient.js`) configured with credentials and `/api` proxy.
    - Verified Vite dev proxy to backend.
    - Tested production build (`npm run build`).
  - Git repository initialized and successfully pushed to `main` at `https://github.com/osaamasaleem/academy-management.git`.

---

## Phase 1: Database & Authentication Core (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - Connected to Neon PostgreSQL cloud instance (v18.7).
  - Executed baseline migration (`schema.sql` via `src/scripts/migrate.js`).
  - Seeded initial Principal Admin (`src/scripts/seedAdmin.js`) with full delegated permissions.
  - Implemented password recovery/reset script (`src/scripts/resetAdminPassword.js`).
  - Built security & RBAC middleware:
    - `verifyAuth`: Validates JWT from HttpOnly cookie against DB live state and `token_version`.
    - `requirePermission`: Enforces granular teacher permissions with unrestricted admin pass.
    - `requireAdmin`: Admin-only route guard.
    - `rateLimit`: Brute-force protection on `/api/auth/login`.
  - Built Auth API routes (`backend/src/routes/auth.routes.js`):
    - `POST /api/auth/login`: Rate-limited, constant-time hash comparison, HttpOnly cookie.
    - `POST /api/auth/logout`: Clears session cookie.
    - `GET /api/auth/me`: Live user flags and profile.
    - `POST /api/auth/change-password`: Increments `token_version`, logs to `audit_logs`.
  - Frontend implementation:
    - `AuthContext.jsx`: Session provider with auto-login check, login/logout methods, live permissions.
    - `ProtectedRoute.jsx`: Client-side route guard based on role and required permissions.
    - `Layout.jsx`: Responsive sidebar displaying only permitted navigation links, user details, and logout.
    - `Login.jsx`: Mobile-first sign-in form with error handling and loading indicators.
    - `Dashboard.jsx`: Session overview and permission status cards.
    - `ChangePassword.jsx`: Secure password modification form.
  - Automated DoD test suite (`backend/tests/phase1_auth.test.js`): 7/7 tests passed.

---

## Phase 2: Teacher Management & Granular Permissions (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - Teacher CRUD endpoints (`backend/src/routes/teacher.routes.js`):
    - `GET /api/teachers`: Search, pagination, status filter, CNIC masking (`*********1234`).
    - `GET /api/teachers/:id`: Detailed profile with unmasked CNIC for admin.
    - `POST /api/teachers`: Role forced to `teacher`, duplicate username (case-insensitive) & CNIC check, audit logged.
    - `PATCH /api/teachers/:id`: Strict whitelist (including username update with duplicate check), role escalation protection (403), password reset with token_version bump, audit logged.
    - `DELETE /api/teachers/:id`: Soft archive (`is_active = FALSE`), admin protection safeguard.
  - Frontend UI (`frontend/src/pages/Teachers.jsx`):
    - Full-featured teacher directory with search and active/archived filter.
    - Real-time instant toggle switches for the 4 permission flags (`can_view_students`, `can_manage_students`, `can_manage_fees`, `can_mark_all_attendance`) with optimistic UI and rollback.
    - Teacher onboarding modal with compulsory and optional fields.
    - **Teacher Profile & Password Reset Modal**: Allows the Principal to edit any teacher's full name, username, phone, CNIC, subject specialty, and reset their password.
    - One-click archive & restore actions with confirmation alerts.
  - Automated DoD test suite (`backend/tests/phase2_teachers.test.js`): 10/10 tests passed (including admin profile edits and credential resets).

---

## Phase 3: Student Onboarding & Monthly Fee Ledger (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - Billing Engine (`backend/src/services/billing.js`):
    - Due-date clamping for 28/29/30/31-day months (e.g. Feb 31 -> Feb 28/29).
    - Pakistan calendar timezone (`Asia/Karachi`) overdue computation.
    - Pre-admission date period validation.
  - Student CRUD API (`backend/src/routes/student.routes.js`):
    - Auto sequence roll number assignment (`STU-00001`) with duplicate protection (409).
    - Filtering by Grade (1–12), Stream (General, Science, ICS, Arts), and active/archived status.
    - Soft archive on deletion (`status = 'inactive'`) preserving relational history.
  - Fee Ledger API (`backend/src/routes/fee.routes.js`):
    - `GET /api/fees`: Monthly fee sheet generating implicit unpaid rows for all active students enrolled on/before the period.
    - `GET /api/fees/summary`: Aggregate metrics (expected collection, collected, pending, overdue amount, and defaulter counts).
    - `GET /api/fees/student/:id`: Lifetime ledger series from student admission month to current date.
    - `POST /api/fees/record`: Full payment recording, fee snapshot rule preservation (BR-4), and admin-only payment reversal (revert back to unpaid).
  - Frontend UI:
    - `Students.jsx`: Student directory with grade/stream filters, search, enrollment modal with custom fee due days and fee notes, edit modal, and archive/restore toggles.
    - `FeeManagement.jsx`: Monthly fee collection dashboard, KPI metric cards, one-click "Mark Paid" modal, admin payment revert button, and student lifetime ledger link.
    - `StudentFeeHistory.jsx`: Complete chronological ledger timeline for individual students with outstanding balance calculation.
  - Automated DoD test suite (`backend/tests/phase3_students_fees.test.js`): 10/10 tests passed.
  - Updated `README.md` with current architecture and testing instructions.

---

## Phase 4: Teacher Attendance, Dashboard & Audit (Pending)
- [ ] Daily attendance marking & personal view
- [ ] System dashboard statistics
- [ ] Audit logs viewer

---

## Phase 5: Hardening & Deployment (Pending)
- [ ] Rate limiting verification & penetration tests
- [ ] Production proxy configuration (Vercel rewrite)
- [ ] Final launch checklist
