# Database Schema Specification

**Document 02 of 04 · Database Design**
PostgreSQL (v15+) · Tables, Constraints, Indexes & DDL · **Version 1.1** (v1.0 + review fixes)

> **For AI coding agents:** Implement this schema exactly (use `schema.sql` below as the baseline migration). Items tagged **[v1.1]** differ from or extend v1.0. Business rules (billing period, timezone, no hard deletes) are defined in `01_SRS_Academy_Management_System.md` §1.4.

## Changelog v1.0 → v1.1

- `fee_records.amount_paid` added (SRS required it; v1.0 had no column).
- FKs from `fee_records` / `teacher_attendance` changed from `ON DELETE CASCADE` to **`RESTRICT`** (history must never vanish; app uses archive, not delete).
- `students.stream` now has a CHECK constraint (General, Science, ICS, Arts).
- `roll_no` auto-generated from a sequence; now `NOT NULL`.
- Date defaults use **Asia/Karachi**, not the server's UTC date.
- `updated_at` auto-maintained by trigger.
- `users.token_version` added (session invalidation on password change/reset).
- Case-insensitive unique username; CNIC format check; fee-paid consistency checks.
- New `audit_logs` table.
- `students` table doc now lists `created_at` / `updated_at` (DDL already had them).
- Identity columns instead of `SERIAL` (PostgreSQL 10+ recommended practice).

---

## 1. Entity-Relationship Overview

```
users (Principal & Teachers + 4 boolean permission flags)
├──< teacher_attendance (teacher_id, marked_by)   UNIQUE(teacher_id, attendance_date)
├──< students           (created_by)
├──< fee_records        (recorded_by)
└──< audit_logs         (actor_id)

students (Grades 1–12 + rolling fee due day & note)
└──< fee_records (student_id)                      UNIQUE(student_id, billing_month, billing_year)
```

Five tables. Foreign keys to `users` from history tables use `ON DELETE SET NULL` for "who did it" columns and `RESTRICT` for ownership columns.

---

## 2. Table Definitions

### 2.1 `users` (Principal & Teachers)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER IDENTITY | PK | Internal staff ID |
| full_name | VARCHAR(120) | NOT NULL | Compulsory |
| username | VARCHAR(80) | NOT NULL, UNIQUE (case-insensitive) | Login username |
| password_hash | TEXT | NOT NULL | bcrypt hash |
| phone | VARCHAR(25) | NOT NULL | Compulsory |
| role | VARCHAR(20) | NOT NULL, CHECK ('admin','teacher') | System role (immutable via API) |
| cnic | VARCHAR(20) | UNIQUE, NULL, CHECK 13 digits **[v1.1]** | Optional national ID |
| subject_specialty | VARCHAR(100) | NULL | Optional subject/wing |
| joining_date | DATE | NOT NULL, DEFAULT today (Asia/Karachi) | |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | FALSE blocks login |
| can_view_students | BOOLEAN | NOT NULL, DEFAULT FALSE | Read-only student list |
| can_manage_students | BOOLEAN | NOT NULL, DEFAULT FALSE | Add/edit/archive students (implies view) |
| can_mark_all_attendance | BOOLEAN | NOT NULL, DEFAULT FALSE | Mark all teachers' attendance |
| can_manage_fees | BOOLEAN | NOT NULL, DEFAULT FALSE | View & record fees |
| token_version | INTEGER | NOT NULL, DEFAULT 0 **[v1.1]** | Embedded in JWT; bump to invalidate sessions |
| last_login_at | TIMESTAMPTZ | NULL **[v1.1]** | Informational |
| created_at / updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | `updated_at` via trigger |

### 2.2 `students` (Grades 1–12)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER IDENTITY | PK | |
| roll_no | VARCHAR(30) | NOT NULL, UNIQUE, DEFAULT sequence-generated **[v1.1]** | `STU-00001`; custom value allowed |
| full_name | VARCHAR(120) | NOT NULL | |
| guardian_name | VARCHAR(120) | NULL | |
| guardian_phone | VARCHAR(25) | NOT NULL | |
| grade | SMALLINT | NOT NULL, CHECK 1..12 | |
| stream | VARCHAR(50) | NOT NULL, DEFAULT 'General', CHECK IN (General, Science, ICS, Arts) **[v1.1]** | |
| monthly_fee | NUMERIC(10,2) | NOT NULL, CHECK >= 0 | Base monthly fee |
| fee_due_day | SMALLINT | NOT NULL, DEFAULT 1, CHECK 1..31 | 1 = 1st; 17 = 17th-to-17th |
| fee_note | VARCHAR(255) | NULL | e.g. "Cycle: 17th to 17th" |
| admission_date | DATE | NOT NULL, DEFAULT today (Asia/Karachi) | First billing period = this month |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'active', CHECK active/inactive | Archive flag |
| created_by | INTEGER | FK → users(id) ON DELETE SET NULL | |
| created_at / updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

### 2.3 `fee_records` (Monthly Fee Ledger)

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER IDENTITY | PK | |
| student_id | INTEGER | NOT NULL, FK → students(id) **ON DELETE RESTRICT** | |
| billing_month | SMALLINT | NOT NULL, CHECK 1..12 | Month in which the cycle **starts** |
| billing_year | SMALLINT | NOT NULL, CHECK >= 2020 | |
| fee_amount | NUMERIC(10,2) | NOT NULL, CHECK >= 0 | Snapshot of student's fee when record created |
| amount_paid | NUMERIC(10,2) | NOT NULL, DEFAULT 0, CHECK >= 0 **[v1.1]** | Actual amount received |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'unpaid', CHECK paid/unpaid | Overdue is computed, not stored |
| paid_date | DATE | NULL | Required iff paid |
| remarks | VARCHAR(255) | NULL | Receipt number / note |
| recorded_by | INTEGER | FK → users(id) ON DELETE SET NULL | |
| created_at **[v1.1]** / updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

Rows are **created lazily** on first payment action. Absence of a row for an eligible student/period means *unpaid* (see §4 query).

### 2.4 `teacher_attendance`

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | INTEGER IDENTITY | PK | |
| teacher_id | INTEGER | NOT NULL, FK → users(id) **ON DELETE RESTRICT** | |
| attendance_date | DATE | NOT NULL, DEFAULT today (Asia/Karachi) | |
| status | VARCHAR(20) | NOT NULL, CHECK present/absent/late/leave | |
| remarks | VARCHAR(255) | NULL | |
| marked_by | INTEGER | FK → users(id) ON DELETE SET NULL | Principal or delegated teacher |
| created_at / updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

UNIQUE `(teacher_id, attendance_date)`. Missing row = "Not marked".

### 2.5 `audit_logs` **[v1.1]**

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | BIGINT IDENTITY | PK | |
| actor_id | INTEGER | FK → users(id) ON DELETE SET NULL | Who did it |
| action | VARCHAR(60) | NOT NULL | e.g. `fee.record`, `fee.revert`, `teacher.permissions`, `auth.password_change` |
| entity_type | VARCHAR(40) | NOT NULL | `student`, `teacher`, `fee_record`, `attendance`, `auth` |
| entity_id | INTEGER | NULL | |
| details | JSONB | NULL | Before/after values. **Never store passwords or hashes.** |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

---

## 3. Complete PostgreSQL DDL (`schema.sql`)

```sql
-- Academy Management System — schema v1.1 (PostgreSQL 15+)
-- "Today" is always Asia/Karachi, not the DB server's UTC date.

CREATE OR REPLACE FUNCTION today_pk() RETURNS DATE
LANGUAGE sql STABLE AS $$ SELECT (NOW() AT TIME ZONE 'Asia/Karachi')::date $$;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

CREATE SEQUENCE student_roll_seq START 1;

CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  username VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  phone VARCHAR(25) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'teacher')),
  cnic VARCHAR(20) UNIQUE CHECK (cnic IS NULL OR cnic ~ '^[0-9]{13}$'),
  subject_specialty VARCHAR(100),
  joining_date DATE NOT NULL DEFAULT today_pk(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  can_view_students BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_students BOOLEAN NOT NULL DEFAULT FALSE,
  can_mark_all_attendance BOOLEAN NOT NULL DEFAULT FALSE,
  can_manage_fees BOOLEAN NOT NULL DEFAULT FALSE,
  token_version INTEGER NOT NULL DEFAULT 0,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX uq_users_username_ci ON users (LOWER(username));
-- Exactly one admin account in v1:
CREATE UNIQUE INDEX uq_single_admin ON users (role) WHERE role = 'admin';

CREATE TABLE students (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  roll_no VARCHAR(30) NOT NULL UNIQUE
    DEFAULT ('STU-' || LPAD(nextval('student_roll_seq')::text, 5, '0')),
  full_name VARCHAR(120) NOT NULL,
  guardian_name VARCHAR(120),
  guardian_phone VARCHAR(25) NOT NULL,
  grade SMALLINT NOT NULL CHECK (grade BETWEEN 1 AND 12),
  stream VARCHAR(50) NOT NULL DEFAULT 'General'
    CHECK (stream IN ('General', 'Science', 'ICS', 'Arts')),
  monthly_fee NUMERIC(10, 2) NOT NULL CHECK (monthly_fee >= 0),
  fee_due_day SMALLINT NOT NULL DEFAULT 1 CHECK (fee_due_day BETWEEN 1 AND 31),
  fee_note VARCHAR(255),
  admission_date DATE NOT NULL DEFAULT today_pk(),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fee_records (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  billing_month SMALLINT NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  billing_year SMALLINT NOT NULL CHECK (billing_year >= 2020),
  fee_amount NUMERIC(10, 2) NOT NULL CHECK (fee_amount >= 0),
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
  paid_date DATE,
  remarks VARCHAR(255),
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_month_year UNIQUE (student_id, billing_month, billing_year),
  CONSTRAINT chk_paid_consistency CHECK (
    (status = 'paid'   AND paid_date IS NOT NULL AND amount_paid > 0) OR
    (status = 'unpaid' AND paid_date IS NULL     AND amount_paid = 0)
  )
);

CREATE TABLE teacher_attendance (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL DEFAULT today_pk(),
  status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'late', 'leave')),
  remarks VARCHAR(255),
  marked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_teacher_date UNIQUE (teacher_id, attendance_date)
);

CREATE TABLE audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- updated_at triggers
CREATE TRIGGER trg_users_updated    BEFORE UPDATE ON users              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fees_updated     BEFORE UPDATE ON fee_records        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_att_updated      BEFORE UPDATE ON teacher_attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Indexes
CREATE INDEX idx_users_role_active          ON users(role, is_active);
CREATE INDEX idx_students_grade_status      ON students(grade, status);
CREATE INDEX idx_students_name_lower        ON students(LOWER(full_name));
CREATE INDEX idx_fee_records_period_status  ON fee_records(billing_year, billing_month, status);
CREATE INDEX idx_fee_records_student        ON fee_records(student_id);
CREATE INDEX idx_teacher_attendance_date    ON teacher_attendance(attendance_date);
CREATE INDEX idx_audit_logs_created         ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity          ON audit_logs(entity_type, entity_id);
```

> `uq_teacher_date` already creates an index on `(teacher_id, attendance_date)`, so the separate index from v1.0 was dropped as redundant.
> If the host does not allow functions/sequences (rare), fall back to app-generated roll numbers and `CURRENT_DATE` with app-supplied dates.

---

## 4. Key Queries (reference for the backend)

### 4.1 Monthly fee sheet (implicit unpaid rows)
Params: `$1 = month`, `$2 = year`, optional filters `grade`, `status`.

```sql
SELECT s.id AS student_id, s.roll_no, s.full_name, s.grade, s.stream,
       s.fee_due_day, s.fee_note,
       f.id AS fee_record_id,
       COALESCE(f.fee_amount, s.monthly_fee) AS fee_amount,
       COALESCE(f.status, 'unpaid')          AS status,
       f.paid_date, COALESCE(f.amount_paid, 0) AS amount_paid, f.remarks,
       -- due date clamped to last day of month
       make_date($2, $1, LEAST(s.fee_due_day,
         EXTRACT(DAY FROM (make_date($2, $1, 1) + INTERVAL '1 month - 1 day'))::int)) AS due_date
FROM students s
LEFT JOIN fee_records f
       ON f.student_id = s.id AND f.billing_month = $1 AND f.billing_year = $2
WHERE (s.status = 'active' OR f.id IS NOT NULL)
  AND s.admission_date <= (make_date($2, $1, 1) + INTERVAL '1 month - 1 day')::date
ORDER BY s.grade, s.full_name;
```
`overdue = (status = 'unpaid' AND today_pk() > due_date)` — compute in SQL or app.

### 4.2 Lifetime ledger for one student
Generate months from `date_trunc('month', admission_date)` through the current month (`generate_series`), LEFT JOIN `fee_records`, so skipped months appear as unpaid.

### 4.3 Upsert payment
```sql
INSERT INTO fee_records (student_id, billing_month, billing_year, fee_amount,
                         amount_paid, status, paid_date, remarks, recorded_by)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
ON CONFLICT (student_id, billing_month, billing_year)
DO UPDATE SET amount_paid = EXCLUDED.amount_paid, status = EXCLUDED.status,
              paid_date = EXCLUDED.paid_date, remarks = EXCLUDED.remarks,
              recorded_by = EXCLUDED.recorded_by;
-- fee_amount is NOT overwritten on conflict (snapshot, BR-4).
```

### 4.4 Attendance bulk upsert
`INSERT ... ON CONFLICT (teacher_id, attendance_date) DO UPDATE SET status, remarks, marked_by` inside a single transaction.

---

## 5. Migrations & Backups
- Keep `schema.sql` as the baseline; further changes go in numbered migration files (`migrations/002_*.sql`) — use `node-pg-migrate` or plain SQL run in order.
- Enable automatic daily backups on the host and **test a restore once** before go-live. Verify the free tier's retention window; also take a periodic `pg_dump` copy off-platform.
