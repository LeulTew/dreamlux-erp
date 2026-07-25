-- Issue #197: new event staff assignments must start attendance-unverified.
--
-- Assignment means the employee is SCHEDULED for an event. It has never meant the employee
-- was present. The old `attended BOOLEAN DEFAULT TRUE` silently created labor expenses and
-- payroll commission liabilities for people whose presence was never confirmed.
--
-- HISTORICAL DATA POLICY
-- This migration changes the DEFAULT for future rows only. It deliberately does NOT run a
-- blanket `UPDATE event_assignments SET attended = FALSE`: the provenance of existing TRUE
-- rows cannot be reconstructed (we cannot tell a deliberately verified row from one that was
-- merely defaulted), and rewriting them would retroactively erase labor expenses and payroll
-- commissions that have already been generated, approved, and in some cases paid.
-- Existing rows are therefore preserved exactly as stored.
--
-- The single exception is NULL normalization below. NULL and FALSE are already treated
-- identically by every financial query (`attended = true` and `ea.attended IS TRUE` both
-- exclude NULL), so collapsing NULL to FALSE changes no financial outcome; it only lets us
-- add the NOT NULL constraint that keeps the column honest going forward.

ALTER TABLE event_assignments
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMP DEFAULT NULL;

ALTER TABLE event_assignments
  ADD COLUMN IF NOT EXISTS attendance_marked_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Future rows start unverified.
ALTER TABLE event_assignments ALTER COLUMN attended SET DEFAULT FALSE;

-- Conservative normalization: unknown is not evidence of attendance.
UPDATE event_assignments SET attended = FALSE WHERE attended IS NULL;

ALTER TABLE event_assignments ALTER COLUMN attended SET NOT NULL;
