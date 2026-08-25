-- ============================================================
-- Housepital — 006: tables for controls that were wired to 404s
-- ============================================================
--
-- A round-5 sweep compared every `_get/_post/_put/_delete` in the client's
-- api_service.dart against every `router.<verb>` in functions/src/routes.
-- Thirteen client calls had no backend route at all.
--
-- These are not speculative endpoints. Each one backs a control the user can
-- already tap today: the only staff-replacement button in the app, the review
-- composer on every equipment item, the vitals entry sheet. They fail, the
-- client catches, and the UI reports success — which is how "Thank you for
-- your review!" came to be printed after a POST to a route that has never
-- existed.
--
-- Two of the missing routes needed a table. The rest reuse columns that were
-- already there (bookings.cancelled_at, assessment_requests.accepted_at, the
-- vitals table) and are implemented in code only.
--
-- Guarded the same way as 005: re-runnable, because a migration that cannot
-- be retried after a partial failure is unsafe when nobody can rehearse it.

DROP PROCEDURE IF EXISTS hpl_add_column_if_missing;

DELIMITER $$

CREATE PROCEDURE hpl_add_column_if_missing(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @sql = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `',
                      p_column, '` ', p_definition);
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$

DELIMITER ;

-- ── Staff replacement requests ───────────────────────────────
-- `POST /deployments/:id/replacement` is the ONLY control in the app for
-- removing a caregiver from a patient's home. The audit graded it Fail with
-- "the only removal control is wired to a 404". A family that wants a
-- particular person to stop coming taps it, sees a success message, and
-- nothing anywhere records that they asked.

CREATE TABLE IF NOT EXISTS staff_replacement_requests (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  requested_by VARCHAR(36) NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  status ENUM('open', 'acknowledged', 'resolved', 'declined')
    NOT NULL DEFAULT 'open',
  resolution_notes TEXT,
  resolved_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_deployment (deployment_id, status),
  INDEX idx_patient (patient_id, created_at),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Equipment reviews ────────────────────────────────────────
-- `GET|POST /equipment/:id/reviews`. The composer exists on every equipment
-- item and its POST has never had a destination.
--
-- `patient_id` is stored so a review can be withdrawn when its author's data
-- is deleted; `display_name` is stored separately because what a reviewer is
-- called in public should not be re-derived from the patient record every
-- time it is rendered.

CREATE TABLE IF NOT EXISTS equipment_reviews (
  id VARCHAR(36) PRIMARY KEY,
  equipment_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36),
  author_id VARCHAR(36),
  display_name VARCHAR(120),
  rating DECIMAL(2,1) NOT NULL,
  text TEXT,
  status ENUM('published', 'hidden', 'removed')
    NOT NULL DEFAULT 'published',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_equipment_author (equipment_id, author_id),
  INDEX idx_equipment (equipment_id, status, created_at),
  INDEX idx_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- (`vitals.notes` already exists in 001 — checked, no migration needed.)

-- ── Who recorded a reading ───────────────────────────────────
-- Until now every row in `vitals` was implicitly staff-recorded. The patient
-- app can write one too, and a clinician reading a trend needs to know which
-- is which — a family member's home cuff and a nurse's device are not the
-- same evidence.

CALL hpl_add_column_if_missing('vitals', 'recorded_by_type',
  "ENUM('staff','family','patient') NOT NULL DEFAULT 'staff'");
CALL hpl_add_column_if_missing('vitals', 'recorded_by', 'VARCHAR(36)');

DROP PROCEDURE IF EXISTS hpl_add_column_if_missing;
