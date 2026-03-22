-- ============================================================
-- Housepital — Service Catalog Seed Data
-- Source: housepital_patient_app service_catalog_screen.dart
-- ============================================================
-- IMPORTANT: Manpower services (nursing, caretaker, japa, nanny)
-- have hide_price = TRUE and base_price_min/max = NULL.
-- Never show prices for these services to end users.
-- ============================================================

INSERT INTO service_catalog
  (id, name, category, booking_type, description, base_price_min, base_price_max, duration_minutes, lead_time_hours, hide_price, icon_name, is_active, display_order)
VALUES

-- ── Manpower: Nursing Staff ─────────────────────────────────
('mp-nurse-basic-12',       'Nurse (Basic) – 12 Hours',                  'manpower', 'assessment', 'Basic nursing care — vitals monitoring, oral medication, feeding & personal hygiene assistance.',                                              NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 1),
('mp-nurse-basic-24',       'Nurse (Basic) – 24 Hours',                  'manpower', 'assessment', 'Round-the-clock basic nursing for patients needing continuous monitoring and care.',                                                             NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 2),
('mp-nurse-adv-12',         'Nurse (Advanced) – 12 Hours',               'manpower', 'assessment', 'Advanced nursing — IV/IM medication, catheter care, RT feeding, sugar & BP monitoring.',                                                        NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 3),
('mp-nurse-adv-24',         'Nurse (Advanced) – 24 Hours',               'manpower', 'assessment', 'Round-the-clock advanced nursing for patients needing clinical-grade care at home.',                                                            NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 4),
('mp-nurse-crit-12',        'Nurse (Critical) – 12 Hours',               'manpower', 'assessment', 'Critical care nursing — tracheostomy care, ventilator management, suctioning, bed sore care.',                                                  NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 5),
('mp-nurse-crit-24',        'Nurse (Critical) – 24 Hours',               'manpower', 'assessment', 'Round-the-clock critical care nursing for ICU-like home setups and ventilator patients.',                                                       NULL, NULL, NULL, 24, TRUE, 'medical_services', TRUE, 6),

-- ── Manpower: Caretakers ────────────────────────────────────
('mp-caretaker-basic-12',   'Caretaker (Basic) – 12 Hours',              'manpower', 'assessment', 'Basic caretaker — bathing, mobility assistance, feeding, companionship & medication reminders.',                                                NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 7),
('mp-caretaker-basic-24',   'Caretaker (Basic) – 24 Hours',              'manpower', 'assessment', 'Round-the-clock basic caretaker for daily living assistance and companionship.',                                                                NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 8),
('mp-caretaker-adv-12',     'Caretaker (Advanced) – 12 Hours',           'manpower', 'assessment', 'Advanced caretaker with IM injection & BP monitoring skills for patients needing medical support.',                                              NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 9),
('mp-caretaker-adv-24',     'Caretaker (Advanced) – 24 Hours',           'manpower', 'assessment', 'Round-the-clock advanced caretaker with medical assistance capabilities.',                                                                      NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 10),
('mp-caretaker-crit-12',    'Caretaker (Critical / Semi-Nurse) – 12 Hours', 'manpower', 'assessment', 'Semi-nurse level caretaker for complex care needs — RT feeding, suctioning assistance.',                                                     NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 11),
('mp-caretaker-crit-24',    'Caretaker (Critical / Semi-Nurse) – 24 Hours', 'manpower', 'assessment', 'Round-the-clock semi-nurse caretaker for patients needing intensive daily care.',                                                            NULL, NULL, NULL, 24, TRUE, 'person',           TRUE, 12),

-- ── Manpower: Japa Maid ─────────────────────────────────────
('mp-japa-24',              'Japa Maid – 24 Hours',                      'manpower', 'assessment', 'Post-delivery care for mother & newborn (0-7 months) — breastfeeding support, baby massage, bathing, umbilical cord care & mother''s diet preparation.', NULL, NULL, NULL, 24, TRUE, 'child_friendly', TRUE, 13),

-- ── Manpower: Nanny ─────────────────────────────────────────
('mp-nanny-12',             'Nanny – 12 Hours',                          'manpower', 'assessment', 'Professional nanny for infants & toddlers (7 months–5 years) — feeding, sleep routine, developmental activities, hygiene & safety supervision.', NULL, NULL, NULL, 24, TRUE, 'child_care',       TRUE, 14),

-- ── Manpower: Physiotherapy ─────────────────────────────────
('mp-physio-basic',         'Physiotherapy (Basic)',                      'manpower', 'assessment', 'Basic physiotherapy (30-40 min) for TKR, THR, frozen shoulder, lower back pain, posture correction, sciatica & sports injuries. Therapist: 1-2 years experience.', NULL, NULL, NULL, 24, TRUE, 'fitness_center', TRUE, 15),
('mp-physio-advance',       'Physiotherapy (Advanced)',                   'manpower', 'assessment', 'Advanced physiotherapy (45-50 min) for neuro rehab, antenatal/postnatal, cardiac rehab, pulmo rehab (not on O2). Therapist: 2-4 years experience.', NULL, NULL, NULL, 24, TRUE, 'fitness_center', TRUE, 16),
('mp-physio-critical',      'Physiotherapy (Critical)',                   'manpower', 'assessment', 'Critical physiotherapy (50-60 min) for pulmo rehab on O2, neurosurgical cases, spinal cord injury & pediatric post-op. Therapist: 4+ years experience.', NULL, NULL, NULL, 24, TRUE, 'fitness_center', TRUE, 17),

-- ── Consultations ───────────────────────────────────────────
('con-doctor',              'Doctor Visit',                              'consultation', 'scheduled',  'Tell us your concern — we''ll recommend the right doctor (General Physician or ICU Specialist) for your home visit.', 350000, 500000, 30, 4,  FALSE, 'stethoscope',     TRUE, 1),
('con-psychiatrist',        'Psychiatrist Consultation',                  'consultation', 'assessment', 'Licensed psychiatrist for mental health assessment, medication management & therapy referrals.',                    150000, NULL,   45, 24, FALSE, 'psychology',      TRUE, 2),
('con-grief',               'Grief Counselling',                         'consultation', 'assessment', 'Compassionate support for loss, bereavement & emotional recovery. In-person or video.',                              120000, NULL,   60, 24, FALSE, 'favorite',        TRUE, 3),
('th-sleep',                'Sleep Therapy',                             'consultation', 'instant',    'Certified sleep therapist visit — assessment, sleep hygiene counselling & personalised routine.',                     150000, NULL,   60, 24, FALSE, 'bedtime',         TRUE, 4),

-- ── Visits (nursing procedures at home) ─────────────────────
('visit-iv',                'IV Visit',                                  'visit', 'scheduled', 'Tell us the type of IV procedure — we''ll assign the right nurse level and bill accordingly.',            90000,  150000, NULL, 24, FALSE, 'vaccines',          TRUE, 1),
('visit-im',                'IM Injection Visit',                        'visit', 'scheduled', 'Intramuscular injection visit — nurse administers prescribed IM medication at home.',                     50000,  50000,  30,   24, FALSE, 'medical_services',  TRUE, 2),
('visit-dressing-basic',    'Dressing Visit (Basic)',                    'visit', 'scheduled', 'Basic wound dressing — simple wounds, surgical site care, suture line dressing.',                         120000, 120000, 45,   24, FALSE, 'medical_services',  TRUE, 3),
('visit-dressing-adv',      'Dressing Visit (Advanced)',                 'visit', 'scheduled', 'Advanced dressing — complex wounds, drain site care, negative pressure wound care.',                      150000, 150000, 60,   24, FALSE, 'medical_services',  TRUE, 4),
('visit-dressing-crit',     'Dressing Visit (Critical)',                 'visit', 'scheduled', 'Critical dressing — deep wound debridement, extensive burn care, multi-site dressing.',                   200000, 200000, 90,   24, FALSE, 'medical_services',  TRUE, 5),
('visit-catheter',          'Catheter Change',                           'visit', 'scheduled', 'Urinary catheter insertion or change by trained nurse at home.',                                         120000, 120000, 30,   24, FALSE, 'medical_services',  TRUE, 6),
('visit-rt-change',         'RT (Ryles Tube) Change',                    'visit', 'scheduled', 'Nasogastric / Ryles tube insertion or change by trained nurse.',                                         120000, 120000, 30,   24, FALSE, 'medical_services',  TRUE, 7),
('visit-tracheostomy',      'Tracheostomy Change',                       'visit', 'scheduled', 'Tracheostomy tube change by experienced critical care nurse.',                                           500000, 500000, 60,   24, FALSE, 'medical_services',  TRUE, 8),

-- ── Diagnostics ─────────────────────────────────────────────
('dx-ecg',                  'ECG at Home',                               'diagnostics', 'instant', '12-lead ECG performed at home by a trained technician. Report within 2 hours.',                              50000,  NULL,   30, 4,  FALSE, 'monitor_heart', TRUE, 1),
('dx-xray',                 'X-Ray at Home',                             'diagnostics', 'instant', 'Portable digital X-Ray at your doorstep. Report shared within 4 hours.',                                     80000,  NULL,   30, 6,  FALSE, 'radiology',     TRUE, 2),
('dx-holter',               'Holter Monitoring',                         'diagnostics', 'instant', '24-hour Holter monitor fitted at home. Technician visits for setup & removal. Report in 48 hours.',            250000, NULL,   45, 12, FALSE, 'monitor_heart', TRUE, 3),

-- ── Lab Tests ───────────────────────────────────────────────
('lab-fever',               'Fever Panel',                               'lab', 'instant', 'CBC, CRP, Procalcitonin, Peripheral Smear, Typhidot, Dengue NS1, COVID test, Urine Routine — comprehensive fever workup.',                               499900, 499900, NULL, 24, FALSE, 'science', TRUE, 1),
('lab-wellness',            'Wellness Package',                          'lab', 'instant', 'CBC, LFT, KFT, Uric Acid, Thyroid, Lipid Profile, Vitamin B12 & D, Iron, ESR, HbA1C, Folate — 14 tests for complete health check.',                        759900, 759900, NULL, 24, FALSE, 'science', TRUE, 2),
('lab-immunity',            'Immunity Package',                          'lab', 'instant', 'CRP, ESR, Vitamin D & B12, Iron Profile, Folate, Phosphorus, Calcium, Total Proteins — immune health assessment.',                                         459900, 459900, NULL, 24, FALSE, 'science', TRUE, 3),
('lab-bone',                'Bone Package',                              'lab', 'instant', 'Alkaline Phosphatase, LDH, PTH, Calcium, Vitamin D — bone health and osteoporosis screening.',                                                             299900, 299900, NULL, 24, FALSE, 'science', TRUE, 4),
('lab-metabolic',           'Metabolic Package',                         'lab', 'instant', 'Random Sugar, HbA1C, GGT, Lipid Profile, CRP, Liver Profile — metabolic syndrome screening.',                                                              179900, 179900, NULL, 24, FALSE, 'science', TRUE, 5),
('lab-adolescent',          'Adolescent Package',                        'lab', 'instant', 'HbA1C, CBC, Vitamin D, TSH, Iron Profile — health check for young adults.',                                                                                249900, 249900, NULL, 24, FALSE, 'science', TRUE, 6),
('lab-anemia',              'Anemia Package',                            'lab', 'instant', 'CBC, Peripheral Smear, ESR, HPLC, Ferritin, Iron Profile, Reticulocyte Count, B12, Folate — complete anemia workup.',                                      459900, 459900, NULL, 24, FALSE, 'science', TRUE, 7),
('dx-sample-5km',           'Blood Sample Collection (0-5 km)',          'lab', 'instant', 'Phlebotomist visits your home to collect blood samples. Reports shared digitally.',                                                                        15000,  15000,  NULL, 24, FALSE, 'science', TRUE, 8),
('dx-sample-10km',          'Blood Sample Collection (5-10 km)',         'lab', 'instant', 'Phlebotomist visits your home to collect blood samples. Reports shared digitally.',                                                                        20000,  20000,  NULL, 24, FALSE, 'science', TRUE, 9),
('dx-sample-15km',          'Blood Sample Collection (10-15 km)',        'lab', 'instant', 'Phlebotomist visits your home to collect blood samples. Reports shared digitally.',                                                                        25000,  25000,  NULL, 24, FALSE, 'science', TRUE, 10);
