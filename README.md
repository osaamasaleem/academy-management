# Academy Management System (AMS)

A modern, full-stack web application designed for Grade 1–12 coaching academies and schools. Built with **React 18**, **Node.js (Express)**, **PostgreSQL (Neon)**, and **Tailwind CSS**, AMS provides complete operational management across student admissions, flexible fee billing & collection, teacher management with granular delegation, daily attendance tracking, and comprehensive audit logs.

---

## 🌐 Live Production Application

- **Web Application (Frontend):** [https://academy-management-ten.vercel.app](https://academy-management-ten.vercel.app)
- **API Server (Backend):** [https://ams-backend-cq7l.onrender.com](https://ams-backend-cq7l.onrender.com)
- **Database:** Serverless PostgreSQL 15+ hosted on Neon with SSL & pooling.

---

## ✨ Core Features & System Capabilities

### 1. 🔐 Security & Granular Role-Based Access Control (RBAC)
- **Zero Client Trust:** All authorization is validated strictly server-side on every request.
- **Dynamic Database Flags:** User permissions are fetched live from PostgreSQL per request (never baked into JWT payloads), allowing immediate privilege revocation.
- **5 Granular Delegation Flags:**
  - `can_view_students`: View student profiles and directory.
  - `can_manage_students`: Onboard, edit, mark as left, or re-enroll students.
  - `can_manage_fees`: Record payments, waive dues, view monthly sheets and lifetime ledgers.
  - `can_mark_all_attendance`: View and bulk mark daily attendance across all staff members.
  - `can_view_audit_logs`: Inspect timestamped system actions and change history.
- **Session Protection:** Secure `HttpOnly; SameSite=Lax; Secure` cookie authentication paired with `token_version` tracking for instant session invalidation on password change or credential reset.
- **Reverse Proxy Architecture:** Same-origin rewrite proxy via Vercel ensuring 100% first-party cookie compliance across Safari, iOS, and incognito sessions without cross-site tracking blocks.

### 2. 👨‍🏫 Teacher Management & Granular Delegation
- Full staff directory with search by name, username, phone, or specialty.
- Instant permission delegation toggles with optimistic UI updates.
- Principal administrative controls for credential updates, onboarding, soft archiving, and password resets.
- Sensitive data masking (CNIC masked as `*********1234` in general staff listings).

### 3. 🎓 Student Lifecycle & Admissions
- Enrollment for Grades 1 through 12 across diverse educational groups (Science, ICS, Arts, General).
- Automated sequential roll number generation (`STU-00001`).
- Custom monthly due-day assignment (e.g., 1st vs. 17th of the month) with fee notes.
- **Payment Habit Tracking:** Tag students as `Advance` or `Month End` payers for realistic academy billing workflows.
- **Enrollment Intervals & Gap Handling:**
  - "Mark as Left" cleanly closes active enrollment and automatically prunes future unpaid fee dues.
  - "Return / Re-enroll" resumes enrollment intervals without distorting historical fee ledgers.
  - Gap months are clearly designated as *Not Enrolled* and excluded from overdue calculations.

### 4. 💳 Monthly Fee Ledger & Billing Engine
- **Implicit Unpaid Generation:** Monthly fee sheet automatically accounts for all enrolled students regardless of whether a manual fee record exists.
- **Timezone-Aware Overdue Engine:** Calculations strictly locked to Pakistan Standard Time (`Asia/Karachi`) with intelligent month-end due-date clamping (e.g., February 31 → February 28/29).
- **Snapshot Immutability:** Historical fee records preserve the snapshot fee amount regardless of subsequent tuition fee updates.
- **Lifecycle Statuses:** Supports `paid`, `unpaid`, and `waived` fee statuses.
- **Bulk Operations with Dry-Run:** Select individual, range, or all months to apply fees, record payments, or waive dues with an interactive before/after preview modal.
- **Lifetime Student Ledger:** Comprehensive chronological payment timelines with outstanding balance totals.
- **Admin Safeguards:** Payment reversals restricted strictly to the Principal Admin with audit logging.

### 5. 📅 Teacher Attendance Tracking
- **Dual Marking Modes:**
  - **Self-Marking:** Any authenticated teacher can mark their own attendance for today (`present`, `absent`, `late`, `leave`).
  - **Bulk Staff Marking:** Principal or delegated teachers can mark daily attendance across all teachers with single-click bulk save.
- **Strict Business Rules:** Future date marking is blocked; delegated teachers are restricted to today's date, while Admin retains retrospective correction privileges.
- **Monthly Attendance Matrix:** Visual month-wide attendance grid showing individual day statuses and aggregate absent/late/leave tallies.

### 6. 📊 Real-Time Dashboard & Audit Trails
- **Role-Aware Dashboard:** Principal views school-wide metrics (active students, active teachers, today's attendance breakdown, monthly collection vs. pending dues). Teachers view their personal metrics and permitted widgets.
- **Tamper-Evident Audit Logging:** Detailed records capturing actor identity, action type, entity ID, previous/new value diffs, IP address, and timestamps for critical operations.

---

## 🏗️ System Architecture & Stack

```
┌────────────────────────────────┐
│   React 18 + Vite + Tailwind   │  Frontend (Vercel)
│   (Mobile-First, Axios Client) │  https://academy-management-ten.vercel.app
└───────────────┬────────────────┘
                │ /api/* (Same-Origin Reverse Proxy)
                ▼
┌────────────────────────────────┐
│      Node.js + Express API     │  Backend (Render)
│ (Helmet, Zod, Rate-Limit, JWT) │  https://ams-backend-cq7l.onrender.com
└───────────────┬────────────────┘
                │ SSL Connection Pooling
                ▼
┌────────────────────────────────┐
│     Neon Serverless Postgres   │  Database (PostgreSQL 15+)
│ (Relational Schema, JSONB Logs)│
└────────────────────────────────┘
```

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS, Lucide Icons | Responsive SPA, mobile-first interface |
| **Backend** | Node.js (LTS), Express, Zod, Pino | REST API, input validation, structured logging |
| **Security** | Helmet, express-rate-limit, bcryptjs, jsonwebtoken | Session security, brute-force defense, CSRF mitigation |
| **Database** | PostgreSQL 15+ (Neon Cloud) | ACID transactions, JSONB intervals, connection pooling |
| **Deployment** | Vercel (Frontend), Render (Backend), Cloudflare DNS | Edge delivery, SSL termination, reverse proxying |

---

## 📁 Repository Structure

```
├── AGENTS.md                  # Project rules & AI engineering constraints
├── README.md                  # System overview and operational guide
├── docs/                      # Formal SRS, database schema, and API documentation
│   ├── 01_SRS_Academy_Management_System.md
│   ├── 02_DATABASE_SCHEMA_Academy_System.md
│   ├── 03_API_ENDPOINTS_Academy_System.md
│   ├── 04_DEVELOPMENT_ROADMAP_Academy_System.md
│   └── PROGRESS.md            # Living phase-by-phase implementation log & struggles
├── backend/
│   ├── src/
│   │   ├── config/            # PostgreSQL pool & Zod env schema
│   │   ├── middleware/        # verifyAuth, requirePermission, requireAdmin, rateLimit
│   │   ├── routes/            # auth, teacher, student, fee, attendance, dashboard, audit
│   │   ├── services/          # billing engine, Pakistan timezone helpers, audit logger
│   │   └── scripts/           # DB migrate, seedAdmin, resetAdminPassword
│   ├── tests/                 # Automated unit and integration test suites
│   ├── migrations/            # Versioned SQL migrations (001_init, 002_ledger_refactor)
│   └── schema.sql             # Complete baseline schema
└── frontend/
    ├── src/
    │   ├── api/               # Axios client configured with credentials & relative baseURL
    │   ├── context/           # AuthContext managing live sessions & permissions
    │   ├── components/        # Layout (static sidebar, mobile drawer), ProtectedRoute
    │   └── pages/             # Dashboard, Teachers, Students, FeeManagement,
    │                          # StudentFeeHistory, MarkAttendance, MyAttendance,
    │                          # AuditLogs, ChangePassword, Login
    ├── vercel.json            # Reverse proxy rewrite config routing /api to Render
    └── vite.config.js         # Local development proxy configuration
```

---

## 🛠️ Local Development Setup

### 1. Prerequisites
- **Node.js**: v18.x or higher
- **PostgreSQL**: v15+ (Local instance or Neon connection string)
- **Git**

### 2. Environment Setup

#### Backend Setup:
Navigate into `backend/` and create `.env` (refer to `backend/.env.example`):
```env
PORT=5000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters
CLIENT_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
TRUST_PROXY=0
TZ=Asia/Karachi
```

#### Frontend Setup:
Navigate into `frontend/` and ensure dependencies are installed. Local development proxies API calls to `localhost:5000` via `vite.config.js`.

### 3. Database Initialization
From the repository root:
```bash
# Run database schema migrations
cd backend
node src/scripts/migrate.js

# Seed the initial Principal Administrator account
node src/scripts/seedAdmin.js
```

### 4. Running the Development Servers
From the repository root:
```bash
# Terminal 1: Start Backend API (Port 5000)
npm run dev:backend

# Terminal 2: Start Frontend Web Server (Port 5173)
npm run dev:frontend
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🧪 Automated Test Suites

The system includes automated tests covering authorization matrices, billing computations, and edge cases:

```bash
# Authentication, session lifecycle & security tests
node backend/tests/phase1_auth.test.js

# Teacher management & 5-flag RBAC delegation tests
node backend/tests/phase2_teachers.test.js

# Student enrollment, due-date clamping & fee ledger tests
node backend/tests/phase3_students_fees.test.js

# Fee ledger refactor, waived fees & leave/return interval tests
node backend/tests/phase3b_ledger_refactor.test.js
```

---

## 📚 Documentation Links

Detailed engineering specifications and historical development logs can be referenced in the repository:
- **Development Roadmap & Milestones:** [docs/04_DEVELOPMENT_ROADMAP_Academy_System.md](file:///c:/Users/usama/Downloads/AMS/docs/04_DEVELOPMENT_ROADMAP_Academy_System.md)
- **Living Progress & Production Challenges:** [docs/PROGRESS.md](file:///c:/Users/usama/Downloads/AMS/docs/PROGRESS.md)
- **System Requirements Specification (SRS):** [docs/01_SRS_Academy_Management_System.md](file:///c:/Users/usama/Downloads/AMS/docs/01_SRS_Academy_Management_System.md)
- **Database Schema & Relational Model:** [docs/02_DATABASE_SCHEMA_Academy_System.md](file:///c:/Users/usama/Downloads/AMS/docs/02_DATABASE_SCHEMA_Academy_System.md)
- **REST API Endpoints Specification:** [docs/03_API_ENDPOINTS_Academy_System.md](file:///c:/Users/usama/Downloads/AMS/docs/03_API_ENDPOINTS_Academy_System.md)
