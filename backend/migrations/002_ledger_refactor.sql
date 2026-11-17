-- Migration 002: Student Fee Ledger Refactor & Open-Ended Enrollment

-- 1. Update students table status constraint & add enrollment_history column
ALTER TABLE students ADD COLUMN IF NOT EXISTS enrollment_history JSONB NOT NULL DEFAULT '[]';

-- Initialize enrollment_history for existing students if empty
UPDATE students
SET enrollment_history = jsonb_build_array(
  jsonb_build_object(
    'from_year', EXTRACT(YEAR FROM admission_date)::int,
    'from_month', EXTRACT(MONTH FROM admission_date)::int,
    'to_year', NULL,
    'to_month', NULL
  )
)
WHERE enrollment_history = '[]'::jsonb;

-- Adjust status check constraint on students to allow Active, Left, active, inactive
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check
  CHECK (status IN ('Active', 'Left', 'active', 'inactive'));

-- 2. Update fee_records table to support 'waived' status
ALTER TABLE fee_records DROP CONSTRAINT IF EXISTS fee_records_status_check;
ALTER TABLE fee_records ADD CONSTRAINT fee_records_status_check
  CHECK (status IN ('paid', 'unpaid', 'waived'));

ALTER TABLE fee_records DROP CONSTRAINT IF EXISTS chk_paid_consistency;
ALTER TABLE fee_records ADD CONSTRAINT chk_paid_consistency CHECK (
  (status = 'paid'   AND paid_date IS NOT NULL AND amount_paid > 0) OR
  (status = 'unpaid' AND paid_date IS NULL     AND amount_paid = 0) OR
  (status = 'waived' AND amount_paid = 0)
);
