-- Demo data. Only inserts when there are no orders, so it is safe to re-run.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM shirts.orders) THEN RETURN; END IF;

  UPDATE shirts.settings SET shirt_price = 25, shipping_fee = 5;
  UPDATE shirts.inventory SET stock = v.stock FROM (VALUES
    ('YS',4),('YM',4),('YL',4),('S',12),('M',20),('L',20),('XL',14),('2XL',8),('3XL',4)) v(size, stock)
  WHERE inventory.size = v.size;

  INSERT INTO shirts.orders (name, phone, email, amount_due, paid, paid_at, payment_method, ship_needed,
                             addr_name, addr_line1, addr_line2, addr_city, addr_state, addr_zip, address_submitted_at,
                             shipped, shipped_at, carrier, tracking_number, picked_up, picked_up_at, notes) VALUES
    ('Jessie Smith',   '405-555-0101', 'jessie@example.com', 25, true,  now() - interval '9 days', 'cash',   false, NULL,NULL,NULL,NULL,NULL,NULL,NULL, false,NULL,NULL,NULL, true, now() - interval '8 days', 'Team captain'),
    ('Amy Rodriguez',   '405-555-0102', NULL,                 30, true,  now() - interval '6 days', 'venmo',  true,  'Amy Rodriguez','1412 Meadow Ln',NULL,'Edmond','OK','73034', now() - interval '5 days', true, now() - interval '2 days','USPS','9400111899223456789012', false,NULL, NULL),
    ('Casey Thompson',  NULL,           'casey@example.com',  55, true,  now() - interval '3 days', 'zelle',  true,  'Casey Thompson','88 Oak Hollow Dr','Apt 4','Oklahoma City','OK','73102', now() - interval '2 days', false,NULL,NULL,NULL, false,NULL, 'Two shirts, one is a gift'),
    ('Dana Whitfield',  '405-555-0104', NULL,                 30, false, NULL,                      NULL,     true,  NULL,NULL,NULL,NULL,NULL,NULL,NULL, false,NULL,NULL,NULL, false,NULL, 'Send address link'),
    ('Morgan Ellis',    NULL,           NULL,                 25, false, NULL,                      NULL,     false, NULL,NULL,NULL,NULL,NULL,NULL,NULL, false,NULL,NULL,NULL, false,NULL, 'Will grab at the 5K'),
    ('Priya Natarajan', '405-555-0106', 'priya@example.com',  35, true,  now() - interval '1 day',  'paypal', true,  NULL,NULL,NULL,NULL,NULL,NULL,NULL, false,NULL,NULL,NULL, false,NULL, NULL),
    ('Lauren Pike',     '405-555-0107', NULL,                 30, true,  now() - interval '4 days', 'venmo',  true,  'Lauren Pike','5 Cedar Ct',NULL,'Guthrie','OK','73044', now() - interval '3 days', true, now() - interval '1 day','UPS','1Z999AA10123456784', false,NULL, NULL);

  INSERT INTO shirts.order_items (order_id, size, qty)
  SELECT o.id, v.size, v.qty FROM shirts.orders o JOIN (VALUES
    ('Jessie Smith','M',1), ('Amy Rodriguez','S',1), ('Casey Thompson','L',1), ('Casey Thompson','XL',1),
    ('Dana Whitfield','M',1), ('Morgan Ellis','2XL',1), ('Priya Natarajan','M',1), ('Priya Natarajan','YM',1),
    ('Lauren Pike','L',1)) v(name, size, qty) ON o.name = v.name;
END $$;
