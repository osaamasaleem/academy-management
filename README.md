# Academy Management System (AMS)

Internal web platform for Grade 1–12 coaching academy management (Admin & Teacher roles). Built with **Node.js (Express)**, **PostgreSQL (Neon)**, **React (Vite)**, and **Tailwind CSS**.

---

## Current Build Status (Phase 3b Completed)

- **Phase 0: Scaffolding & Proxy** (Complete)
  - Vite same-origin proxy, Zod environment validation, baseline schema, health checks.
- **Phase 1: Database & Authentication Core** (Complete)
  - Neon PostgreSQL migration, Principal Admin seeding CLI, JWT HttpOnly cookies, RBAC session guards.
- **Phase 2: Teacher Management & Granular Permissions** (Complete)
  - Full teacher directory, profile editing, credential reset, instant 4-flag permission delegation toggles.
- **Phase 3: Student Onboarding & Monthly Fee Ledger** (Complete)
  - Student enrollment (Grades 1–12), auto roll-number sequences (`STU-00001`), custom due days (1st vs 17th).
  - Due-date clamping (Feb 28/29), overdue computation in Pakistan time (`Asia/Karachi`).
  - Monthly fee sheet with implicit unpaid rows, KPI summaries, one-click payment recording, admin payment reversal, and lifetime student ledgers.
- **Phase 3b: Fee Ledger Refactor** (Complete)
  - **Waived status**: mark individual or bulk months as waived (with optional reason); waived rows stay visible but are excluded from outstanding balance and overdue counts.
  - **Bulk actions with dry-run**: select any combination of months → Set Fee, Mark Paid (with date), or Waive → preview changes before applying. All changes execute in a single transaction; duplicate rows are prevented.
  - **Active / Left enrollment**: students start `Active`. "Mark as Left" closes the enrollment interval at a chosen month and removes only future unpaid rows (paid rows are never touched). "Return" appends a new open interval — same student record and roll number.
  - **Gap months** (between Leave and Return): no rows generated; displayed as "Not enrolled" in the ledger; never counted as overdue.
  - **Onboarding fee history review**: 2-step enrollment flow — after entering details, review/edit all historical months before saving (bulk set fee, mark paid, waive).
  - All enrollment changes and fee edits are audit logged (who, what changed, before/after).
- **Phase 4: Teacher Attendance, Dashboard & Audit** (Next)
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
│   │   ├── routes/            # auth, teacher, student, fee, health
│   │   ├── services/          # billing engine, audit logger
│   │   └── scripts/           # migrate, seedAdmin, resetAdminPassword
│   ├── tests/                 # Phase 1, Phase 2, and Phase 3 automated test suites
│   └── schema.sql             # PostgreSQL baseline DDL
└── frontend/
    ├── src/
    │   ├── api/               # Axios client with proxy & credentials
    │   ├── context/           # AuthContext (live permissions & session)
    │   ├── components/        # Layout, ProtectedRoute
    │   └── pages/             # Login, Dashboard, Teachers, Students, FeeManagement, StudentFeeHistory, ChangePassword
    └── vite.config.js         # Port 5173 with proxy to port 5000
```

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
