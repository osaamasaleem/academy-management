# Academy Management System (AMS)

Internal web platform for Grade 1–12 coaching academy management (Admin & Teacher roles). Built with **Node.js (Express)**, **PostgreSQL (Neon)**, **React (Vite)**, and **Tailwind CSS**.

---

## Current Build Status (Phase 4 Completed)

- **Phase 0: Scaffolding & Proxy** ✅
  - Vite same-origin proxy, Zod environment validation, baseline schema, health checks.
- **Phase 1: Database & Authentication Core** ✅
  - Neon PostgreSQL migration, Principal Admin seeding CLI, JWT HttpOnly cookies, RBAC session guards.
- **Phase 2: Teacher Management & Granular Permissions** ✅
  - Full teacher directory, profile editing, credential reset, instant 5-flag permission delegation toggles (including `can_view_audit_logs`).
- **Phase 3: Student Onboarding & Monthly Fee Ledger** ✅
  - Student enrollment (Grades 1–12), auto roll-number sequences (`STU-00001`), custom due days (1st vs 17th).
  - Due-date clamping (Feb 28/29), overdue computation in Pakistan time (`Asia/Karachi`).
  - Monthly fee sheet with implicit unpaid rows, KPI summaries, one-click payment recording, admin payment reversal, and lifetime student ledgers.
- **Phase 3b: Fee Ledger Refactor** ✅
  - **Waived status**: mark individual or bulk months as waived; waived rows excluded from outstanding balance.
  - **Bulk actions with dry-run**: select months → Set Fee, Mark Paid, or Waive → preview before applying.
  - **Active / Left enrollment**: "Mark as Left" closes enrollment interval; "Return" appends new open interval.
  - **Gap months**: displayed as "Not enrolled"; never counted as overdue.
  - **Onboarding fee history review**: 2-step enrollment flow with per-row editing.
  - **Payment Habit tag**: `Advance` or `Month End` tag per student, visible in student list and fee ledger.
- **Phase 4: Teacher Attendance, Dashboard & Audit** ✅
  - **Teacher Attendance Marking**: Daily bulk attendance (`present`, `absent`, `late`, `leave`) by admin or delegated teacher. Future dates blocked; delegated teachers limited to today only.
  - **Self-Mark Attendance**: Any teacher can mark their own attendance for today via `POST /api/attendance/mark-self`.
  - **Monthly Attendance Summary / Ledger**: Full per-teacher breakdown with day-by-day status matrix, absent/late/leave date lists, and total counts.
  - **Dashboard**: Role-aware KPI cards — admin sees active students, active teachers, today's attendance summary, and fee metrics; teachers see their own monthly attendance counts and permitted sections.
  - **Audit Logs**: All sensitive actions (login, password change, permission updates, fee edits, attendance edits to past records, student archive/return) are recorded in `audit_logs`. Admin and teachers with `can_view_audit_logs` permission can browse and filter logs.
  - **Archived Student Cleanup**: Archiving a student now removes unpaid fee records, preventing ghost pending debt on dashboard and fee ledger.
  - **Fee Ledger Student Filter**: Fee ledger supports filtering by student status (`Active Students`, `Archived Students`, `All Students`) with an "Archived" badge on archived student rows.
  - **Responsive UI with Static Sidebar**: Left sidebar is fixed (non-scrolling); right content area scrolls independently. Mobile-responsive with a hamburger menu and slide-in drawer.
- **Phase 5: Hardening & Deployment** (Pending)

---

## Repository Structure

```
├── AGENTS.md                  # System rules and agent constraints
├── PROGRESS.md                # Living phase-by-phase implementation log
├── README.md                  # Local setup & project documentation
├── docs/                      # SRS, Schema, API specs, and Execution Roadmap
├── backend/
│   ├── src/
│   │   ├── config/            # DB pool & Zod env validation
│   │   ├── middleware/        # verifyAuth, requirePermission, requireAdmin, rateLimit
│   │   ├── routes/            # auth, teacher, student, fee, attendance, dashboard, health
│   │   ├── services/          # billing engine, audit logger
│   │   └── scripts/           # migrate, seedAdmin, resetAdminPassword
│   ├── tests/                 # Phase 1–3b automated test suites
│   └── schema.sql             # PostgreSQL baseline DDL
└── frontend/
    ├── src/
    │   ├── api/               # Axios client with proxy & credentials
    │   ├── context/           # AuthContext (live permissions & session)
    │   ├── components/        # Layout (static sidebar, mobile drawer), ProtectedRoute
    │   └── pages/             # Login, Dashboard, Teachers, Students, FeeManagement,
    │                          # StudentFeeHistory, MarkAttendance, MyAttendance,
    │                          # AuditLogs, ChangePassword
    └── vite.config.js         # Port 5173 with proxy to port 5000
```

---

## API Endpoints Summary

| Method | Route | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login, issues HttpOnly JWT cookie |
| POST | `/api/auth/logout` | Auth | Clear session cookie |
| GET | `/api/auth/me` | Auth | Live user profile & permissions |
| POST | `/api/auth/change-password` | Auth | Change own password |
| GET | `/api/teachers` | Admin | List teachers with search & filter |
| POST | `/api/teachers` | Admin | Create teacher |
| PATCH | `/api/teachers/:id` | Admin | Edit profile, permissions, password |
| DELETE | `/api/teachers/:id` | Admin | Soft archive teacher |
| GET | `/api/students` | can_view/manage_students | List students |
| POST | `/api/students` | can_manage_students | Enroll student with fee history |
| PATCH | `/api/students/:id` | can_manage_students | Edit student |
| DELETE | `/api/students/:id` | can_manage_students | Archive student (clears unpaid fees) |
| POST | `/api/students/:id/leave` | can_manage_students | Mark as Left |
| POST | `/api/students/:id/return` | can_manage_students | Re-enroll |
| GET | `/api/fees` | can_manage_fees | Monthly fee sheet (supports `student_status` filter) |
| GET | `/api/fees/summary` | can_manage_fees | Monthly KPI aggregates |
| GET | `/api/fees/student/:id` | can_manage_fees | Lifetime ledger for student |
| POST | `/api/fees/record` | can_manage_fees | Record / revert payment |
| POST | `/api/fees/bulk` | can_manage_fees | Bulk set fee / mark paid / waive |
| GET | `/api/attendance/my` | Auth | Own attendance records (month/year) |
| POST | `/api/attendance/mark-self` | Auth | Mark own attendance for today |
| GET | `/api/attendance` | can_mark_all_attendance | All teachers' attendance for a date |
| GET | `/api/attendance/summary` | can_mark_all_attendance | Monthly attendance ledger for all teachers |
| GET | `/api/attendance/teacher/:id` | can_mark_all_attendance | Individual teacher's attendance history |
| POST | `/api/attendance/bulk` | can_mark_all_attendance | Bulk mark attendance for all teachers |
| GET | `/api/dashboard/summary` | Auth | Role-aware KPI dashboard |
| GET | `/api/audit-logs` | Admin / can_view_audit_logs | Browse & filter audit log |

---

## Local Setup & Development

### 1. Prerequisites
- Node.js v18+ (LTS)
- PostgreSQL database (Neon or local)

### 2. Environment Configuration
Copy `backend/.env.example` to `backend/.env` and provide your database credentials:
```env
PORT=5000
DATABASE_URL=postgresql://user:password@neon-host/dbname?sslmode=require
JWT_SECRET=your_super_secret_key_at_least_32_chars
CLIENT_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
TZ=Asia/Karachi
```

### 3. Database Migration & Admin Seeding
```bash
# Apply schema
node backend/src/scripts/migrate.js

# Seed initial Principal Admin account
node backend/src/scripts/seedAdmin.js
```

### 4. Running the Application
```bash
# Run backend on port 5000
npm run dev:backend

# Run frontend on port 5173
npm run dev:frontend
```

### 5. Running Automated Test Suites
```bash
# Phase 1: Auth & Session Tests
node backend/tests/phase1_auth.test.js

# Phase 2: Teacher Management & RBAC Tests
node backend/tests/phase2_teachers.test.js

# Phase 3: Student & Fee Ledger Tests
node backend/tests/phase3_students_fees.test.js

# Phase 3b: Fee Ledger Refactor Tests (waived, bulk, leave/return)
node backend/tests/phase3b_ledger_refactor.test.js
```
