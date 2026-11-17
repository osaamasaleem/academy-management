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
  - **5-flag permission system**: `can_view_students`, `can_manage_students`, `can_manage_fees`, `can_mark_all_attendance`, `can_view_audit_logs` — all readable from DB on every request (never from JWT).
  - Frontend UI (`frontend/src/pages/Teachers.jsx`):
    - Full-featured teacher directory with search and active/archived filter.
    - Real-time instant toggle switches for all 5 permission flags with optimistic UI and rollback.
    - Teacher onboarding modal with compulsory and optional fields.
    - **Teacher Profile & Password Reset Modal**: Allows the Principal to edit any teacher's full name, username, phone, CNIC, subject specialty, and reset their password.
    - One-click archive & restore actions with confirmation alerts.
  - Automated DoD test suite (`backend/tests/phase2_teachers.test.js`): 10/10 tests passed.

---

## Phase 3: Student Onboarding & Monthly Fee Ledger (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - Billing Engine (`backend/src/services/billing.js`):
    - Due-date clamping for 28/29/30/31-day months (e.g. Feb 31 → Feb 28/29).
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

---

## Phase 3b: Fee Ledger Refactor (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**
  - **DB Migration** (`backend/migrations/002_ledger_refactor.sql`) applied to Neon:
    - `enrollment_history JSONB` column added to `students` (auto-populated from `admission_date` for existing rows).
    - `students.status` constraint expanded: `'Active' | 'Left' | 'active' | 'inactive'`.
    - `fee_records.status` constraint expanded: `'paid' | 'unpaid' | 'waived'`.
    - `chk_paid_consistency` updated to allow `waived` rows with `amount_paid = 0`.
    - `payment_habit` column added to `students`: `'advance'` (default) or `'month_end'`.
  - **Billing Engine** (`backend/src/services/billing.js`):
    - Added `isMonthInInterval()` and `isEnrolledInPeriod()` helpers for enrollment gap detection.
  - **Student API** (`backend/src/routes/student.routes.js`):
    - `POST /api/students`: New students default to `status = 'Active'` with an open `enrollment_history` interval. Accepts optional `initial_fee_history` array for onboarding fee pre-population.
    - `POST /api/students/:id/leave`: Closes the open enrollment interval at the chosen month, removes only future unpaid rows, audit logged, transactional.
    - `POST /api/students/:id/return`: Appends a new open interval from the chosen return month, sets `status = 'Active'`, audit logged, transactional.
  - **Fee API** (`backend/src/routes/fee.routes.js`):
    - Monthly sheet now filters by `isEnrolledInPeriod()` — gap months are never shown as overdue.
    - `GET /api/fees/student/:id` lifetime ledger: gap months rendered as `status: 'not_enrolled'`.
    - Summary excludes `waived` rows from expected/pending/overdue balance.
    - `POST /api/fees/bulk`: Bulk actions (set_fee, mark_paid, waive) with **dry-run** preview mode in a single transaction. Audit logged per batch.
    - `POST /api/fees/record`: Updated to handle `waived` status.
  - **Frontend** (`frontend/src/pages/StudentFeeHistory.jsx`):
    - Multi-select checkboxes (single, range, select-all) on ledger rows.
    - Floating sticky bulk action bar: **Set Fee**, **Mark Paid** (with date picker), **Waive** (with optional reason).
    - Dry-run preview modal showing before/after for each selected period.
    - **Mark as Left** modal — pick last attended month; future unpaid rows auto-removed.
    - **Return / Re-enroll** modal — pick return month.
    - Gap months rendered as "Not enrolled" (grey, no checkbox, excluded from balance).
    - `waived` status badge (purple); outstanding balance excludes waived and not_enrolled rows.
  - **Frontend** (`frontend/src/pages/Students.jsx`):
    - 2-step enrollment flow: Step 1 = student details (including Payment Habit), Step 2 = fee history review.
    - Bulk actions on Step 2: Set Fee, Mark Paid (with date), Waive for pre-system history correction.
    - Student list shows **Left** badge on status column.
    - **Payment Habit** (`Advance` / `Month End`) tag displayed on each student row.
  - **Frontend** (`frontend/src/pages/FeeManagement.jsx`):
    - **Payment Habit** tag shown next to fee amount in the monthly fee sheet.
  - **Test Suite** (`backend/tests/phase3b_ledger_refactor.test.js`): **10/10 tests passed**.

---

## Phase 4: Teacher Attendance, Dashboard & Audit (Completed)
- **Status:** Complete
- **Date:** 2026-11-17
- **Key Deliverables:**

  ### Backend — Attendance API (`backend/src/routes/attendance.routes.js`)
  - `GET /api/attendance/my`: Row-level isolated endpoint — always scoped strictly to `req.user.id`. Returns day-by-day records and status counts for the requested month. Any authenticated user can call this.
  - `POST /api/attendance/mark-self`: Any authenticated teacher can mark their own attendance for today only (upsert). Cannot mark for past or future dates. Audit logged.
  - `GET /api/attendance`: Returns all active teachers with their status for a given date (or today). Access: `can_mark_all_attendance`.
  - `GET /api/attendance/summary`: Monthly ledger for ALL active teachers — per-teacher day-by-day status matrix, absent/late/leave date arrays, and total counts. Access: `can_mark_all_attendance`.
  - `GET /api/attendance/teacher/:id`: Individual teacher's attendance history for a month, including `marked_by` name. Access: `can_mark_all_attendance`.
  - `POST /api/attendance/bulk`: Bulk mark attendance for a date. Business rules enforced server-side:
    - Future dates rejected (422).
    - Delegated (non-admin) teachers can only mark for **today** (past dates → 422).
    - Only active teachers can receive attendance records.
    - Single transactional upsert (`ON CONFLICT DO UPDATE`).
    - Past-date edits are audit logged with before/after comparison.

  ### Backend — Dashboard API (`backend/src/routes/dashboard.routes.js`)
  - `GET /api/dashboard/summary`: Role-aware response:
    - **Admin**: active teachers count, today's attendance breakdown (present/absent/late/leave/notMarked), active students count, current-month fee summary (expected/collected/pending/overdue amounts and counts).
    - **Teacher**: their own current-month attendance counts; plus any sections gated by their permissions (student count if `can_view_students`; fee summary if `can_manage_fees`; attendance today if `can_mark_all_attendance`).
  - Dashboard stats **only count active students** (`status IN ('active', 'Active')`), so archived students do not inflate pending fees or student counts.

  ### Backend — Audit Logs API (`backend/src/routes/dashboard.routes.js`)
  - `GET /api/audit-logs`: Paginated, filterable by `entity_type`, `actor_id`, `from` date, `to` date. Returns actor name and username via JOIN. Access: admin OR `can_view_audit_logs`.

  ### Frontend — Mark Attendance (`frontend/src/pages/MarkAttendance.jsx`)
  - **Daily Tab**: Shows all active teachers for a chosen date. Admin can select any past date; delegated teachers limited to today. Per-teacher status selector (present / absent / late / leave) with optional remarks. Single "Save All" action submits bulk.
  - **Monthly Tab**: Monthly attendance ledger table — each row is a teacher, columns are days of the month, cells show colour-coded status badges. Absent/late/leave dates summarised per teacher.
  - Navigation controls for month/year selection.
  - Shows attendance summary counts at the top (present, absent, late, leave, not marked).

  ### Frontend — My Attendance (`frontend/src/pages/MyAttendance.jsx`)
  - Monthly calendar-style view of the authenticated user's own attendance records.
  - Status counts (present, absent, late, leave) displayed as summary cards.
  - **Self-mark widget**: Teacher can mark their own attendance for today with a status selector and optional remark. Shows existing today status if already marked.
  - Month/year navigation to browse history.

  ### Frontend — Dashboard (`frontend/src/pages/Dashboard.jsx`)
  - Admin KPI cards: Active Teachers, Active Students, Today's Attendance breakdown, Current Month Fee Summary (expected, collected, pending, overdue).
  - Teacher dashboard: Own attendance summary for current month; additional sections visible per granted permissions.

  ### Frontend — Audit Logs (`frontend/src/pages/AuditLogs.jsx`)
  - Paginated log table: actor name, action, entity type, entity ID, details (formatted JSON), timestamp.
  - Filters: entity type dropdown, from/to date pickers.
  - Pagination controls with total count.
  - Visible to admin and teachers with `can_view_audit_logs`.

  ### Bug Fixes & Improvements
  - **Archived student cleanup**: `DELETE /api/students/:id` now removes all unpaid fee records for the archived student in a transaction before returning, preventing ghost pending debt on the dashboard and fee ledger.
  - **Fee ledger student filter**: `GET /api/fees` and `GET /api/fees/summary` now accept `?student_status=active|inactive|all`. Default is `active` — archived students are hidden from the standard view. Frontend dropdown added ("Active Students" / "Archived Students" / "All Students"). Archived students in the ledger show an "Archived" badge.
  - **Responsive layout**: Static left sidebar (no scroll); right content area scrolls independently. Mobile: hamburger button in a top header, slide-in drawer with backdrop dismiss. Fully usable on 360 px wide screens.

---

## Phase 5: Hardening & Deployment (Pending)
- [ ] Rate limiting verification & penetration tests
- [ ] Production proxy configuration (Vercel rewrite or nginx)
- [ ] Final launch checklist
