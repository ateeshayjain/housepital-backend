-- ============================================================
-- Housepital — 005: reconcile the schema with the code that reads it
-- ============================================================
--
-- WHY THIS MIGRATION EXISTS
-- The round-4 audit compared every `db("table")` chain in functions/src
-- against 001_initial_schema.sql and found ~20 sites referencing columns and
-- tables that have never existed. MySQL rejects an unknown column outright,
-- so each one is not a subtle bug — it is a 500 on a route that has never
-- once returned success.
--
-- Nothing caught it because the client falls back to DemoData whenever the API
-- is unreachable, and api.housepital.in does not resolve, so the app looked
-- healthy while every one of these endpoints was dead.
--
-- The breaks split into two kinds, fixed in two places:
--   • The code used a DIFFERENT NAME for a column that exists
--     (`family_member_id` vs `paid_by`, `schedule_times` vs `time_slots`,
--     `sort_order` vs `display_order`). Those are fixed IN THE CODE, because
--     the schema name is also what the Flutter client serialises — renaming
--     the column would break the app to satisfy the server.
--   • The code needed something that genuinely does not exist. Those are
--     added HERE.
--
-- Every statement is additive and idempotent-ish; run once, in order, after
-- 001. Verify against a copy before running on production data.

-- ── Audit columns the routes write on every mutation ─────────
-- Five payment write sites set updated_at. Without the column, every one of
-- them — order creation, verification, refund, invoice settle — errors.

ALTER TABLE payments
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE medications
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  -- The Flutter client sends reminders_enabled in MedicationFull.toJson();
  -- there was nowhere to put it, so the preference was silently discarded on
  -- every create and update.
  ADD COLUMN reminders_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE family_concerns
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE daily_ratings
  ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

-- ── Notification read state ──────────────────────────────────
-- PUT /notifications/:id/read and /read-all both write is_read and read_at.
-- Neither existed, so a notification could never be marked read and the
-- unread badge could never clear.

ALTER TABLE notification_log
  ADD COLUMN is_read BOOLEAN DEFAULT FALSE,
  ADD COLUMN read_at DATETIME NULL,
  ADD INDEX idx_user_unread (user_id, is_read);

-- ── Catalog ordering ─────────────────────────────────────────
-- service_catalog already has display_order (the code's `sort_order` is fixed
-- in services.ts). equipment_catalog has no ordering column at all, and the
-- equipment route orders by one, so the whole catalog listing 500s.

ALTER TABLE equipment_catalog
  ADD COLUMN sort_order INT DEFAULT 0,
  ADD INDEX idx_sort (sort_order);

-- ── Staff profile ────────────────────────────────────────────
-- GET /staff/:id reads staff_reviews and staff_documents. Neither table has
-- ever existed, so the endpoint 500s — which is why the patient app's staff
-- profile screen has only ever rendered its catch block. (That fallback used
-- to fabricate `police_verified: true`; it no longer claims anything.)
--
-- Note the deliberate asymmetry: document_url is stored here but the route
-- never returns it to a family member. A caregiver's Aadhaar scan is their
-- personal document, not the patient's.

CREATE TABLE IF NOT EXISTS staff_reviews (
  id VARCHAR(36) PRIMARY KEY,
  staff_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36),
  patient_name VARCHAR(255),
  rating DECIMAL(2,1) NOT NULL,
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_staff (staff_id, created_at),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_documents (
  id VARCHAR(36) PRIMARY KEY,
  staff_id VARCHAR(36) NOT NULL,
  type ENUM('aadhaar', 'police_verification', 'training_certificate',
            'medical_certificate', 'other') NOT NULL,
  label VARCHAR(255),
  status ENUM('pending', 'verified', 'rejected', 'expired')
    NOT NULL DEFAULT 'pending',
  verified_at DATETIME NULL,
  expires_at DATETIME NULL,
  document_url VARCHAR(512),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_staff_doc (staff_id, type),
  INDEX idx_staff (staff_id),
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Equipment on a deployment ────────────────────────────────
-- GET /deployments/:id reads equipment_deployments to list rented equipment
-- alongside the assigned staff. Without it the whole deployment detail 500s,
-- taking the staff assignment down with the equipment list.

CREATE TABLE IF NOT EXISTS equipment_deployments (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  equipment_id VARCHAR(36),
  equipment_name VARCHAR(255) NOT NULL,
  monthly_rate DECIMAL(10,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status ENUM('active', 'returned', 'cancelled') NOT NULL DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_deployment (deployment_id, status),
  INDEX idx_patient (patient_id),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Health manager ───────────────────────────────────────────
-- GET /patients/:id/health-manager reads this. The health manager is the
-- named human a family calls when something is wrong, so a 500 here removes
-- the app's escalation path.

CREATE TABLE IF NOT EXISTS health_manager_assignments (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36) NOT NULL,
  status ENUM('active', 'ended') NOT NULL DEFAULT 'active',
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient_active (patient_id, status),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
