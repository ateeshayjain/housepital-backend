-- ============================================================
-- Housepital — Sample Coupons Seed Data
-- ============================================================

INSERT INTO coupons
  (id, code, description, discount_type, discount_value, min_order_amount, max_discount, applicable_categories, valid_from, valid_until, usage_limit, used_count, is_active)
VALUES

-- WELCOME10: 10% off first booking, max Rs 500 discount
(UUID(), 'WELCOME10', '10% off your first booking (max Rs 500 discount)', 'percentage', 10, 0, 50000, NULL, '2026-01-01', '2026-12-31', 1, 0, TRUE),

-- PHYSIO20: 20% off physiotherapy visits
(UUID(), 'PHYSIO20', '20% off physiotherapy visits', 'percentage', 20, 0, NULL, '["manpower"]', '2026-01-01', '2026-12-31', 100, 0, TRUE),

-- LABTEST100: Rs 100 off any lab test
(UUID(), 'LABTEST100', 'Rs 100 off any lab test', 'fixed', 10000, 0, NULL, '["lab"]', '2026-01-01', '2026-12-31', 500, 0, TRUE);
