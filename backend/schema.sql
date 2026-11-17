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

CREATE SEQUENCE IF NOT EXISTS student_roll_seq START 1;

CREATE TABLE IF NOT EXISTS users (
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username_ci ON users (LOWER(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_admin ON users (role) WHERE role = 'admin';

CREATE TABLE IF NOT EXISTS students (
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
  payment_habit VARCHAR(20) NOT NULL DEFAULT 'advance' CHECK (payment_habit IN ('advance', 'month_end')),
  admission_date DATE NOT NULL DEFAULT today_pk(),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('Active', 'Left', 'active', 'inactive')),
  enrollment_history JSONB NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fee_records (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  billing_month SMALLINT NOT NULL CHECK (billing_month BETWEEN 1 AND 12),
  billing_year SMALLINT NOT NULL CHECK (billing_year >= 2020),
  fee_amount NUMERIC(10, 2) NOT NULL CHECK (fee_amount >= 0),
  amount_paid NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'waived')),
  paid_date DATE,
  remarks VARCHAR(255),
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_student_month_year UNIQUE (student_id, billing_month, billing_year),
  CONSTRAINT chk_paid_consistency CHECK (
    (status = 'paid'   AND paid_date IS NOT NULL AND amount_paid > 0) OR
    (status = 'unpaid' AND paid_date IS NULL     AND amount_paid = 0) OR
    (status = 'waived' AND amount_paid = 0)
  )
);

CREATE TABLE IF NOT EXISTS teacher_attendance (
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

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INTEGER,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_users_updated') THEN
    CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_students_updated') THEN
    CREATE TRIGGER trg_students_updated BEFORE UPDATE ON students FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_fees_updated') THEN
    CREATE TRIGGER trg_fees_updated BEFORE UPDATE ON fee_records FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_att_updated') THEN
    CREATE TRIGGER trg_att_updated BEFORE UPDATE ON teacher_attendance FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_users_role_active          ON users(role, is_active);
CREATE INDEX IF NOT EXISTS idx_students_grade_status      ON students(grade, status);
CREATE INDEX IF NOT EXISTS idx_students_name_lower        ON students(LOWER(full_name));
CREATE INDEX IF NOT EXISTS idx_fee_records_period_status  ON fee_records(billing_year, billing_month, status);
CREATE INDEX IF NOT EXISTS idx_fee_records_student        ON fee_records(student_id);
CREATE INDEX IF NOT EXISTS idx_teacher_attendance_date    ON teacher_attendance(attendance_date);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created         ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity          ON audit_logs(entity_type, entity_id);
