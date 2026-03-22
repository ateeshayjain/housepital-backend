-- ============================================================
-- Housepital Patient App — MySQL Schema
-- Cloud SQL instance: asia-south1
-- Database: housepital
-- ============================================================

-- ── Patients ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS patients (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  age INT,
  gender ENUM('male', 'female', 'other'),
  conditions JSON DEFAULT ('[]'),
  medications JSON DEFAULT ('[]'),
  allergies JSON DEFAULT ('[]'),
  dietary_restrictions TEXT,
  mobility_status ENUM('ambulatory', 'needs_support', 'wheelchair', 'bedridden'),
  doctor_name VARCHAR(255),
  doctor_phone VARCHAR(20),
  doctor_hospital VARCHAR(255),
  emergency_contacts JSON DEFAULT ('[]'),
  address TEXT,
  city ENUM('delhi', 'faridabad', 'gurgaon', 'noida', 'ghaziabad') NOT NULL,
  -- Clinical fields
  height VARCHAR(20),
  weight VARCHAR(20),
  diagnosis TEXT,
  iv_central_line VARCHAR(100),
  feeding_type VARCHAR(100),
  mental_condition VARCHAR(100),
  motion_status VARCHAR(100),
  bp_sugar_insulin TEXT,
  discharge_summary_available BOOLEAN DEFAULT FALSE,
  requirement TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Family Members ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_members (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL UNIQUE COMMENT 'Firebase Auth UID',
  patient_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  relationship VARCHAR(30) NOT NULL,
  role ENUM('PRIMARY_CONTACT', 'FAMILY_MEMBER', 'PATIENT_SELF') DEFAULT 'FAMILY_MEMBER',
  preferred_language ENUM('en', 'hi') DEFAULT 'en',
  notification_preferences JSON DEFAULT ('{}'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_patient_id (patient_id),
  INDEX idx_role (role),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── FCM Tokens ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL COMMENT 'Firebase Auth UID',
  token TEXT NOT NULL,
  device_type VARCHAR(20) DEFAULT 'unknown',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Staff (read-only from patient app) ───────────────────────

CREATE TABLE IF NOT EXISTS staff (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL,
  photo_url TEXT,
  rating DECIMAL(3,2) DEFAULT 0.00,
  total_reviews INT DEFAULT 0,
  id_verified BOOLEAN DEFAULT FALSE,
  training_complete BOOLEAN DEFAULT FALSE,
  police_verified BOOLEAN DEFAULT FALSE,
  languages JSON DEFAULT ('[]'),
  experience VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Service Catalog ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_catalog (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_hi VARCHAR(255),
  category VARCHAR(50) NOT NULL,
  booking_type ENUM('instant', 'scheduled', 'assessment') NOT NULL,
  description TEXT,
  description_hi TEXT,
  base_price_min INT COMMENT 'In paise. NULL = hide price (manpower)',
  base_price_max INT COMMENT 'In paise',
  duration_minutes INT,
  preparation_notes TEXT,
  preparation_notes_hi TEXT,
  lead_time_hours INT DEFAULT 24,
  is_active BOOLEAN DEFAULT TRUE,
  hide_price BOOLEAN DEFAULT FALSE COMMENT 'Never show price to user',
  icon_name VARCHAR(50),
  display_order INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_active (is_active),
  INDEX idx_booking_type (booking_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Equipment Catalog ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS equipment_catalog (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  brand VARCHAR(255) DEFAULT '',
  category ENUM('Equipment', 'Consumable') DEFAULT 'Equipment',
  available_for_sale BOOLEAN DEFAULT FALSE,
  available_for_rent BOOLEAN DEFAULT FALSE,
  price INT COMMENT 'Sale price in paise',
  rental_price INT COMMENT 'Monthly rental in paise',
  status ENUM('Active', 'Inactive') DEFAULT 'Active',
  image_url TEXT,
  description TEXT,
  how_to_use TEXT,
  key_features TEXT,
  ideal_for TEXT,
  youtube_url TEXT,
  faqs TEXT,
  parent_product_id VARCHAR(100),
  variant_type VARCHAR(100),
  variant_value VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_category (category),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Deployments ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS deployments (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  booking_id VARCHAR(36),
  shift_type ENUM('12hr_day', '12hr_night', '24hr') DEFAULT '24hr',
  start_date DATE NOT NULL,
  end_date DATE,
  total_days INT,
  status ENUM('active', 'paused', 'completed', 'cancelled') DEFAULT 'active',
  auto_renew BOOLEAN DEFAULT FALSE,
  billing_cycle ENUM('monthly', 'quarterly') DEFAULT 'monthly',
  next_billing_date DATE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_status (status),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Attendance ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  date DATE NOT NULL,
  status ENUM('checked_in', 'waiting', 'late', 'absent', 'on_leave', 'checked_out') DEFAULT 'waiting',
  check_in_time DATETIME,
  check_out_time DATETIME,
  check_in_selfie TEXT,
  replacement_name VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deployment_date (deployment_id, date),
  INDEX idx_date (date),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Vitals ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vitals (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  staff_name VARCHAR(255),
  recorded_at DATETIME NOT NULL,
  systolic DECIMAL(5,1),
  diastolic DECIMAL(5,1),
  pulse DECIMAL(5,1),
  spo2 DECIMAL(5,1),
  temperature DECIMAL(5,2),
  sugar DECIMAL(5,1),
  sugar_type ENUM('fasting', 'post_meal', 'random'),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_recorded (recorded_at),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Daily Reports ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_reports (
  id VARCHAR(36) PRIMARY KEY,
  deployment_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  staff_name VARCHAR(255),
  patient_id VARCHAR(36) NOT NULL,
  date DATE NOT NULL,
  submitted_at DATETIME,
  sections JSON COMMENT 'Array of ReportSection objects',
  staff_notes TEXT,
  photo_urls JSON DEFAULT ('[]'),
  medications JSON COMMENT 'Array of MedicationEntry objects',
  completed_tasks INT DEFAULT 0,
  total_tasks INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deployment_date (deployment_id, date),
  INDEX idx_patient (patient_id),
  INDEX idx_date (date),
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Bookings ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bookings (
  id VARCHAR(36) PRIMARY KEY,
  booking_number VARCHAR(20) UNIQUE NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  booked_by VARCHAR(36) NOT NULL COMMENT 'family_members.id',
  service_id VARCHAR(36) NOT NULL,
  service_name VARCHAR(255),
  booking_type ENUM('instant', 'scheduled', 'assessment') NOT NULL,
  status ENUM('pending', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled', 'no_show') DEFAULT 'pending',
  scheduled_date DATE,
  scheduled_slot VARCHAR(20),
  assigned_staff_id VARCHAR(36),
  assigned_staff_name VARCHAR(255),
  assigned_staff_photo TEXT,
  address TEXT,
  price_amount INT NOT NULL COMMENT 'In paise',
  gst_amount INT NOT NULL COMMENT 'In paise',
  total_amount INT NOT NULL COMMENT 'In paise',
  promo_code VARCHAR(30),
  discount_amount INT DEFAULT 0,
  payment_status ENUM('pending', 'paid', 'refunded', 'partial_refund') DEFAULT 'pending',
  payment_id VARCHAR(100),
  cancellation_reason TEXT,
  cancelled_at DATETIME,
  completed_at DATETIME,
  notes TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  rating_comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_status (status),
  INDEX idx_date (scheduled_date),
  INDEX idx_payment (payment_status),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (booked_by) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Assessment Requests ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessment_requests (
  id VARCHAR(36) PRIMARY KEY,
  request_number VARCHAR(20) UNIQUE NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  requested_by VARCHAR(36) NOT NULL,
  service_category VARCHAR(50) NOT NULL,
  status ENUM('submitted', 'reviewing', 'callback_scheduled', 'quote_sent', 'accepted', 'staff_matched', 'deployed', 'declined', 'expired') DEFAULT 'submitted',
  questionnaire_responses JSON NOT NULL,
  assigned_coordinator VARCHAR(255),
  callback_scheduled_at DATETIME,
  callback_notes TEXT,
  quote JSON COMMENT 'Pricing quote with plan options',
  quote_sent_at DATETIME,
  quote_expires_at DATETIME,
  selected_plan VARCHAR(50),
  accepted_at DATETIME,
  declined_at DATETIME,
  decline_reason TEXT,
  deployment_id VARCHAR(36),
  payment_id VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_status (status),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (requested_by) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Payments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR(36) PRIMARY KEY,
  payment_number VARCHAR(20) UNIQUE NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  paid_by VARCHAR(36) COMMENT 'family_members.id',
  payment_type ENUM('commission', 'salary', 'booking', 'equipment', 'emi_installment') NOT NULL,
  reference_type VARCHAR(30) COMMENT 'booking, assessment_request, deployment, equipment',
  reference_id VARCHAR(36),
  amount INT NOT NULL COMMENT 'In paise',
  gst_amount INT DEFAULT 0,
  total_amount INT NOT NULL,
  currency CHAR(3) DEFAULT 'INR',
  razorpay_payment_id VARCHAR(100),
  razorpay_order_id VARCHAR(100),
  razorpay_signature TEXT,
  status ENUM('initiated', 'processing', 'completed', 'failed', 'refunded', 'partial_refund') DEFAULT 'initiated',
  payment_method VARCHAR(20),
  failure_reason TEXT,
  refund_amount INT DEFAULT 0,
  refund_id VARCHAR(100),
  receipt_url TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME,
  INDEX idx_patient (patient_id),
  INDEX idx_status (status),
  INDEX idx_razorpay (razorpay_payment_id),
  INDEX idx_order (razorpay_order_id),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Invoices ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id VARCHAR(36) PRIMARY KEY,
  invoice_number VARCHAR(30) UNIQUE NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  line_items JSON NOT NULL,
  subtotal INT NOT NULL COMMENT 'In paise',
  gst_total INT NOT NULL,
  grand_total INT NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('draft', 'pending', 'paid', 'overdue', 'cancelled') DEFAULT 'pending',
  pdf_url TEXT,
  sent_via JSON DEFAULT ('[]'),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_due (due_date),
  INDEX idx_status (status),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Family Concerns ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS family_concerns (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  raised_by VARCHAR(36) NOT NULL,
  deployment_id VARCHAR(36),
  category VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  evidence_urls JSON DEFAULT ('[]'),
  urgency ENUM('low', 'medium', 'high', 'emergency') DEFAULT 'medium',
  preferred_resolution TEXT,
  status ENUM('received', 'acknowledged', 'investigating', 'in_progress', 'resolved', 'escalated', 'closed') DEFAULT 'received',
  assigned_to VARCHAR(255),
  resolution_notes TEXT,
  resolution_satisfaction INT CHECK (resolution_satisfaction >= 1 AND resolution_satisfaction <= 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME,
  INDEX idx_patient (patient_id),
  INDEX idx_status (status),
  INDEX idx_urgency (urgency),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (raised_by) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Daily Ratings ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_ratings (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  deployment_id VARCHAR(36) NOT NULL,
  rated_by VARCHAR(36) NOT NULL,
  date DATE NOT NULL,
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_deployment_rater_date (deployment_id, rated_by, date),
  INDEX idx_patient (patient_id),
  INDEX idx_deployment (deployment_id),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (deployment_id) REFERENCES deployments(id) ON DELETE CASCADE,
  FOREIGN KEY (rated_by) REFERENCES family_members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Notification Log ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_log (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL COMMENT 'Firebase Auth UID',
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  data JSON,
  channel ENUM('fcm', 'sms', 'whatsapp', 'email', 'in_app') NOT NULL,
  status ENUM('sent', 'delivered', 'read', 'failed') DEFAULT 'sent',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_type (type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Medications ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS medications (
  id VARCHAR(36) PRIMARY KEY,
  patient_id VARCHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  form ENUM('tablet', 'capsule', 'injection', 'syrup', 'inhaler', 'drops', 'cream', 'other') DEFAULT 'tablet',
  frequency ENUM('once_daily', 'twice_daily', 'thrice_daily', 'four_times_daily', 'as_needed') DEFAULT 'once_daily',
  time_slots JSON COMMENT '["08:00", "14:00", "21:00"]',
  instructions TEXT,
  prescribed_by VARCHAR(255),
  prescribed_date DATE,
  end_date DATE,
  stock_count INT DEFAULT 0,
  stock_unit VARCHAR(20) DEFAULT 'tablets',
  prescription_photo_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_patient (patient_id),
  INDEX idx_active (is_active),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Medication Logs ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS medication_logs (
  id VARCHAR(36) PRIMARY KEY,
  medication_id VARCHAR(36) NOT NULL,
  staff_id VARCHAR(36),
  staff_name VARCHAR(255),
  scheduled_time DATETIME NOT NULL,
  actual_time DATETIME,
  status ENUM('administered', 'skipped', 'missed') DEFAULT 'administered',
  skip_reason TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_medication (medication_id),
  INDEX idx_scheduled (scheduled_time),
  FOREIGN KEY (medication_id) REFERENCES medications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Coupons ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupons (
  id VARCHAR(36) PRIMARY KEY,
  code VARCHAR(30) UNIQUE NOT NULL,
  description TEXT,
  discount_type ENUM('percentage', 'fixed') NOT NULL,
  discount_value INT NOT NULL COMMENT 'Percentage (1-100) or fixed amount in paise',
  min_order_amount INT DEFAULT 0,
  max_discount INT COMMENT 'Max discount in paise (for percentage type)',
  applicable_categories JSON COMMENT '["nursing_visit", "lab_test"]',
  valid_from DATE,
  valid_until DATE,
  usage_limit INT DEFAULT 1,
  used_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Coupon Usage (prevent reuse per patient) ─────────────────

CREATE TABLE IF NOT EXISTS coupon_usage (
  id VARCHAR(36) PRIMARY KEY,
  coupon_id VARCHAR(36) NOT NULL,
  patient_id VARCHAR(36) NOT NULL,
  booking_id VARCHAR(36),
  used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_coupon_patient (coupon_id, patient_id),
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
