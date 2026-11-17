# Software Requirements Specification (SRS)

**Document 01 of 04 · Requirements Specification**
Grade 1–12 Academy Management System · **Version 1.1** (v1.0 + review fixes) · Internal Staff Web Platform

> **For AI coding agents:** This is the source of truth for *what* to build. Companion docs: `02_DATABASE_SCHEMA.md` (data), `03_API_SPEC.md` (contract), `04_DEVELOPMENT_ROADMAP.md` (order of work). Items tagged **[v1.1]** were added or clarified during review. Where a **[v1.1]** default is marked *(confirm)*, implement the default but keep it easy to change.

## Changelog v1.0 → v1.1

- Defined what a "billing month" means for custom cycles (e.g. 17th–17th).
- Fee sheet now shows **all active students**, not only those with an existing payment row (missing row = unpaid).
- Added `amount_paid` (v1.0 required "Amount Paid" in FR-FEE-03 but the schema had no column for it).
- Students and teachers are **archived, never hard-deleted** (hard delete would destroy fee/attendance history).
- Resolved permission conflicts (`can_manage_students` implies view; fee screens expose minimal student data).
- Added: change-password, login rate limiting, safeguards for the Principal account, audit log, dashboard, admin attendance reports, timezone rule, acceptance criteria, open questions.

---

## 1. Introduction & System Scope

### 1.1 Purpose
Defines the functional, security and operational requirements for a cloud-accessible Academy Management System for a Grade 1–12 coaching academy. The Principal/Admin and Teachers use it online, from anywhere, to manage staff accounts, granular permissions, daily teacher attendance, student enrollment records and monthly student fee tracking.

### 1.2 Scope Boundaries
- **In scope:** JWT authentication for Principal/Admin and Teachers; Principal-only Teacher CRUD and granular permission toggles; permission-gated Student CRUD (Grades 1–12); monthly student fee tracking supporting both 1st-of-month and custom admission-date cycles (e.g. 17th to 17th); daily teacher attendance marking and personal attendance viewing; **[v1.1]** dashboard summary and audit log.
- **Out of scope:** Public registration, Student portal, Parent portal, daily classroom student attendance, online payment gateway, SMS/WhatsApp sending (see Future Enhancements).

### 1.3 Glossary **[v1.1]**
| Term | Meaning |
|---|---|
| Principal / Admin | The single owner role (`role = 'admin'`). Unrestricted access. |
| Teacher | Staff user (`role = 'teacher'`), restricted by four permission flags. |
| Billing period | One fee cycle, identified by `(billing_month, billing_year)`. |
| Fee due day | Day of month (1–31) a student's fee is due. `1` = 1st of month; `17` = 17th-to-17th cycle. |
| Archived | `is_active = false` (teacher) or `status = 'inactive'` (student). Record kept, hidden from default lists, cannot log in (teachers). |

### 1.4 Business Rules **[v1.1]**
- **BR-1 Billing period convention:** a billing record for `(month, year)` represents the cycle that **starts** in that month. Due date = `fee_due_day` of that month, **clamped to the month's last day** (e.g. due day 31 in February → Feb 28/29). Example: due day 17, "Nov 2026" = 17 Nov – 16 Dec 2026, due 17 Nov 2026.
- **BR-2 Overdue:** a period is *overdue* when status is unpaid and today (academy timezone) is after the due date.
- **BR-3 First period:** a student has no billing periods before the month of their `admission_date`.
- **BR-4 Fee snapshot:** `fee_amount` on a fee record is a snapshot of the student's `monthly_fee` at the time the record is created, so later fee changes do not rewrite history.
- **BR-5 Timezone:** all "today" / calendar dates use **Asia/Karachi (UTC+5)**, not the database server's UTC clock.
- **BR-6 No hard deletes:** students, teachers, fee records and attendance records are never physically deleted through the app.
- **BR-7 Currency:** PKR; amounts stored as `NUMERIC(10,2)`.

---

## 2. User Roles & Permission Matrix

Two internal roles. By default Teachers can only view their own attendance until the Principal enables one or more of four boolean flags.

| Feature / Module Action | Principal / Admin | Teacher (Default) | Teacher (With Delegated Flag) |
|---|---|---|---|
| Create / Update / Archive Teachers | Full | Denied | Denied (Admin only) |
| Toggle Teacher Permission Flags | Full | Denied | Denied (Admin only) |
| View Student Directory & Profiles | Full | Denied | Allowed if `can_view_students` **or** `can_manage_students` |
| Add / Update / Archive Students | Full | Denied | Allowed if `can_manage_students` |
| View & Record Student Monthly Fees | Full | Denied | Allowed if `can_manage_fees` |
| Revert a payment (paid → unpaid) **[v1.1]** | Full | Denied | Denied (Admin only) |
| Mark Attendance for All Teachers | Full | Denied | Allowed if `can_mark_all_attendance` |
| View Own Attendance History | Full | Allowed (own only) | Allowed (own, plus all if delegated) |
| Dashboard summary **[v1.1]** | Full | Own attendance card only | Cards matching held flags |

**Permission rules [v1.1]**
- `can_manage_students` **implies** viewing students (the API already treats it so).
- `can_manage_fees` exposes only minimal student identity (id, roll no, name, grade, stream, due day, fee note) inside fee screens — **not** guardian phone or other profile fields unless the teacher also has a student-view flag.
- A teacher with `can_mark_all_attendance` **cannot create or edit their own attendance record**; only the Principal can *(confirm)*.
- Teachers with `can_mark_all_attendance` may mark/edit **today's date only**; the Principal may mark/edit any date *(confirm)*.
- Flags are checked **live from the database on every request**; flag changes and deactivation take effect immediately.

---

## 3. Detailed Functional Requirements

### 3.1 Authentication & Account Security (FR-AUTH)
- **FR-AUTH-01 (Online Access):** Principal and Teachers log in from any mobile or desktop browser with Username and Password.
- **FR-AUTH-02 (No Public Sign-Up):** Self-registration is disabled. Only the Principal provisions Teacher accounts. The first Principal is created by a CLI seed script.
- **FR-AUTH-03 (Password Security):** Passwords are hashed with bcrypt (cost ≥ 12). Plaintext is never stored, logged or returned. Minimum length 8 **[v1.1]**.
- **FR-AUTH-04 (Instant Suspension):** Setting `is_active = false` immediately blocks login and any active session while preserving attendance and fee history.
- **FR-AUTH-05 (Change Own Password) [v1.1]:** Any logged-in user can change their own password (requires current password). Changing or resetting a password invalidates existing sessions (`token_version` bump).
- **FR-AUTH-06 (Brute-force Protection) [v1.1]:** Login is rate-limited (e.g. 10 attempts / 15 min per IP + username). Generic error "Invalid username or password" for both unknown user and wrong password.
- **FR-AUTH-07 (Session Lifetime) [v1.1]:** Session expires per `JWT_EXPIRES_IN` (default 7d); expired/invalid tokens → 401 and frontend redirects to login.
- **FR-AUTH-08 (Principal Recovery) [v1.1]:** Principal password reset is done via a CLI script (`npm run reset-admin-password`) — there is no email-based reset in v1.

### 3.2 Teacher Onboarding & Management (FR-TCH — Principal only)
- **FR-TCH-01 (Compulsory fields):** Full Name, Username, Password, Phone Number.
- **FR-TCH-02 (Optional fields):** CNIC (13 digits, unique), Subject/Wing Specialty, Joining Date (defaults to today in Asia/Karachi).
- **FR-TCH-03 (Permission controls):** Principal toggles four flags at any time: `can_view_students`, `can_manage_students`, `can_mark_all_attendance`, `can_manage_fees`.
- **FR-TCH-04 (Edit & Archive):** Update details, reset password, archive/restore accounts. No hard delete.
- **FR-TCH-05 (Safeguards) [v1.1]:** The API must reject: changing any user's `role`; creating a second admin; archiving the admin account; a teacher record modifying its own flags. Usernames are case-insensitively unique.

### 3.3 Student Onboarding & Management (FR-STU — permission-gated)
- **FR-STU-01 (Compulsory fields):** Student Full Name, Parent's Contact Number, Grade (1–12), Academic Group/Stream (General, Science, ICS, Arts), Monthly Fee.
- **FR-STU-02 (Optional fields & rolling fee cycle):** Roll Number (auto-generated if blank, or custom), Father/Guardian Name, Admission Date (default today), Fee Due Day (1–31, default 1), Fee Note (e.g. "Cycle: 17th to 17th").
- **FR-STU-03 (Directory & filtering):** Search by Name or Roll Number; filter by Grade, Group, Active/Inactive. Paginated **[v1.1]**.
- **FR-STU-04 (Archive, not delete) [v1.1]:** "Delete" sets `status = 'inactive'`. Archived students keep their fee history and can be restored.
- **FR-STU-05 (Roll number) [v1.1]:** Auto roll numbers come from a database sequence (format `STU-00001`) so concurrent inserts never collide. Custom roll numbers must be unique.

### 3.4 Student Monthly Fee Tracking (FR-FEE — permission-gated)
- **FR-FEE-01 (Monthly ledger):** At most one record per student per billing period.
- **FR-FEE-02 (Due-date clarity):** Ledger shows each student's Fee Due Day badge (Due: 1st vs Due: 17th), custom Fee Note and Paid/Unpaid/Overdue status.
- **FR-FEE-03 (Payment recording):** Principal or `can_manage_fees` teacher marks a period Paid and records Payment Date, **Amount Paid**, and optional Remarks/Receipt number.
- **FR-FEE-04 (Lifetime history):** Clicking a student shows a chronological table of all periods since admission: amount, status, date paid, amount paid.
- **FR-FEE-05 (Implicit unpaid rows) [v1.1]:** The monthly fee sheet lists **every active student admitted on/before that period** (BR-3), whether or not a `fee_records` row exists. No row ⇒ status `unpaid`, amount = current `monthly_fee`. A row is created on the first payment action (upsert).
- **FR-FEE-06 (Overdue) [v1.1]:** Overdue state is computed (BR-2), not stored.
- **FR-FEE-07 (Collection summary) [v1.1]:** For a selected period: total expected, total collected, total pending, count paid/unpaid/overdue — filterable by grade.
- **FR-FEE-08 (Payment reversal) [v1.1]:** Reverting paid → unpaid is Principal-only and must be written to the audit log.
- **FR-FEE-09 (Partial payments) *(confirm)*:** v1 supports full payment only. If `amount_paid < fee_amount`, the API rejects it with 422 unless the Principal confirms partial payments should be added (see Open Questions).

### 3.5 Teacher Attendance Management (FR-ATT)
- **FR-ATT-01 (Daily marking):** Principal — or a Teacher with `can_mark_all_attendance` — marks daily attendance for all **active** teachers as Present, Absent, Late or Leave, with optional remarks. Bulk upsert; re-marking the same day updates the record.
- **FR-ATT-02 (Personal view):** Every Teacher sees their own monthly summary counts and daily log, with zero access to other teachers' records.
- **FR-ATT-03 (Per-teacher report) [v1.1]:** Principal / delegated teachers can view one teacher's monthly attendance log + counts.
- **FR-ATT-04 (Date rules) [v1.1]:** Future dates are rejected. Delegated teachers: today only. Principal: any past date.
- **FR-ATT-05 (Unmarked days) [v1.1]:** A day with no record shows as "Not marked" — never assumed present or absent.

### 3.6 Dashboard (FR-DASH) **[v1.1]**
- Principal: active teachers, active students, today's attendance counts / unmarked count, current-month fees collected vs pending, overdue count.
- Teacher: own current-month attendance counts; cards for modules they have a flag for.

### 3.7 Audit Log (FR-AUD) **[v1.1]**
Record who/when/what for: login failures (count only), password changes/resets, permission-flag changes, account archive/restore, fee payment create/update/revert, student fee changes, attendance edits to past records. Principal can view the log (read-only).

---

## 4. Non-Functional & Security Requirements

### 4.1 Three-Layer Server-Side Data Isolation
1. Unauthenticated outsiders get **HTTP 401** on every endpoint except `POST /api/auth/login` (and `GET /api/health`).
2. Teachers are isolated by live database permission checks (**HTTP 403** if the flag is false) — UI hiding is cosmetic only.
3. Personal attendance queries bind strictly to `req.user.id` from the verified JWT — never URL/query parameters.

### 4.2 Additional NFRs **[v1.1]**
| ID | Requirement |
|---|---|
| NFR-01 | HTTPS only in production. Cookies: `HttpOnly; Secure; SameSite` (see API spec §2 for the deployment rule). |
| NFR-02 | All input validated server-side (schema validation); all SQL parameterised. |
| NFR-03 | Mobile-first responsive UI; usable on a ~360 px wide phone. |
| NFR-04 | Expected scale: ≤ 1,500 students, ≤ 60 staff. List endpoints paginated (default 50, max 200). p95 API latency < 500 ms on this scale. |
| NFR-05 | Daily automated DB backups with a tested restore procedure; plus a periodic manual export. |
| NFR-06 | Sensitive fields (CNIC, guardian phone) are never written to logs; CNIC masked in list views. |
| NFR-07 | Consistent JSON error format (see API spec §1). |
| NFR-08 | Automated tests cover the permission matrix (every endpoint × role × flag). |

---

## 5. Acceptance Criteria (system level) **[v1.1]**
- A teacher with no flags calling any students/fees/teachers endpoint gets 403; calling `/api/attendance/my` gets only their rows even if they pass `?teacher_id=`.
- Archiving a teacher makes their next request (with a still-valid cookie) return 401.
- Flipping a flag takes effect on the teacher's very next request without re-login.
- Fee sheet for a month lists all eligible active students; marking one paid persists and shows the date and amount.
- Two students created concurrently with blank roll numbers get different roll numbers.
- A student with due day 17 and a student with due day 1 show correct, different due dates in the same sheet; due day 31 in February resolves to Feb 28/29.
- Archived student's fee history remains viewable by authorized users.

## 6. Open Questions (answer before/while building)
1. **Partial payments / discounts / sibling concessions / admission fee / arrears** — needed in v1? (Currently: no.)
2. **Streams by grade:** do Grades 1–8 always use "General" (and Science/ICS/Arts only for 9–12)? Should this be enforced?
3. **Batches / sections / subjects:** coaching academies often charge per subject or batch. Is one flat `monthly_fee` per student enough?
4. **Receipts:** need a printable/PDF fee receipt?
5. **Working days & holidays:** should attendance exclude Sundays/holidays automatically?
6. **Multiple Principals / co-admins?** Currently exactly one admin.
7. **Languages:** English only, or Urdu labels/RTL needed?

## 7. Future Enhancements (not in v1)
WhatsApp/SMS fee reminders, printable receipts, defaulter list export (CSV/Excel), student attendance, parent portal, exam/result module, email/SMS password reset.
