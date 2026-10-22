-- shirts schema for Supabase (static site + Supabase Auth).
-- Paste into the Supabase SQL Editor and run. Safe to re-run.
-- Afterwards: Project Settings > Data API > Exposed schemas > add "shirts" > Save.
-- Then create your login user and run tools/add-admin.sql (see README).
BEGIN;

CREATE SCHEMA IF NOT EXISTS shirts;

-- Single-row app settings
CREATE TABLE IF NOT EXISTS shirts.settings (
  id           boolean PRIMARY KEY DEFAULT true CHECK (id),
  shirt_price  numeric(8,2) NOT NULL DEFAULT 25.00,
  shipping_fee numeric(8,2) NOT NULL DEFAULT 0.00,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shirts.settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Inventory: how many of each size you have in total
CREATE TABLE IF NOT EXISTS shirts.inventory (
  size       text PRIMARY KEY,
  sort_order int  NOT NULL,
  stock      int  NOT NULL DEFAULT 0 CHECK (stock >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO shirts.inventory (size, sort_order) VALUES
  ('YS',1),('YM',2),('YL',3),('S',4),('M',5),('L',6),('XL',7),('2XL',8),('3XL',9)
ON CONFLICT DO NOTHING;

-- One row per buyer
CREATE TABLE IF NOT EXISTS shirts.orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text,
  phone            text,

  amount_due       numeric(8,2) NOT NULL DEFAULT 0,
  paid             boolean NOT NULL DEFAULT false,
  paid_at          timestamptz,
  payment_method   text CHECK (payment_method IN ('venmo','cash','zelle','paypal','check','other')),

  ship_needed      boolean NOT NULL DEFAULT true,   -- false = pickup / hand delivery
  address_token    text NOT NULL UNIQUE
                   DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  addr_name        text,
  addr_line1       text,
  addr_line2       text,
  addr_city        text,
  addr_state       text,
  addr_zip         text,
  address_submitted_at timestamptz,

  shipped          boolean NOT NULL DEFAULT false,
  shipped_at       timestamptz,
  carrier          text CHECK (carrier IN ('USPS','UPS','FedEx','Other')),
  tracking_number  text,
  picked_up        boolean NOT NULL DEFAULT false,
  picked_up_at     timestamptz,

  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shirts.order_items (
  order_id uuid NOT NULL REFERENCES shirts.orders(id) ON DELETE CASCADE,
  size     text NOT NULL REFERENCES shirts.inventory(size) ON UPDATE CASCADE,
  qty      int  NOT NULL CHECK (qty > 0),
  PRIMARY KEY (order_id, size)
);

-- Who is allowed to manage the shop (filled by tools/add-admin.sql)
CREATE TABLE IF NOT EXISTS shirts.admins (
  user_id uuid PRIMARY KEY
);

CREATE INDEX IF NOT EXISTS orders_created_idx ON shirts.orders (created_at DESC);

CREATE OR REPLACE FUNCTION shirts.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_orders_touch ON shirts.orders;
CREATE TRIGGER trg_orders_touch BEFORE UPDATE ON shirts.orders
  FOR EACH ROW EXECUTE FUNCTION shirts.touch_updated_at();
DROP TRIGGER IF EXISTS trg_inventory_touch ON shirts.inventory;
CREATE TRIGGER trg_inventory_touch BEFORE UPDATE ON shirts.inventory
  FOR EACH ROW EXECUTE FUNCTION shirts.touch_updated_at();

-- Stock vs. sold vs. remaining (security_invoker so it respects table permissions)
CREATE OR REPLACE VIEW shirts.inventory_summary WITH (security_invoker = true) AS
SELECT i.size, i.sort_order, i.stock,
       COALESCE(SUM(oi.qty),0)::int AS sold,
       (i.stock - COALESCE(SUM(oi.qty),0))::int AS remaining
FROM shirts.inventory i
LEFT JOIN shirts.order_items oi ON oi.size = i.size
GROUP BY i.size, i.sort_order, i.stock;

-- Is the signed-in user the shop admin?
CREATE OR REPLACE FUNCTION shirts.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM shirts.admins WHERE user_id = (SELECT auth.uid()));
$$;

-- Create/update an order and its sizes in one atomic step (admin only, enforced by RLS)
CREATE OR REPLACE FUNCTION shirts.save_order(p_id uuid, p jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_id     uuid := p_id;
  v_paid   boolean := COALESCE((p->>'paid')::boolean, false);
  v_ship   boolean := COALESCE((p->>'shipped')::boolean, false);
  v_pick   boolean := COALESCE((p->>'picked_up')::boolean, false);
BEGIN
  IF v_id IS NULL THEN
    INSERT INTO shirts.orders (name, email, phone, amount_due, paid, paid_at, payment_method, ship_needed,
        addr_name, addr_line1, addr_line2, addr_city, addr_state, addr_zip,
        shipped, shipped_at, carrier, tracking_number, picked_up, picked_up_at, notes)
    VALUES (p->>'name', p->>'email', p->>'phone', COALESCE((p->>'amount_due')::numeric, 0),
        v_paid, CASE WHEN v_paid THEN now() END, p->>'payment_method', COALESCE((p->>'ship_needed')::boolean, true),
        p->>'addr_name', p->>'addr_line1', p->>'addr_line2', p->>'addr_city', p->>'addr_state', p->>'addr_zip',
        v_ship, CASE WHEN v_ship THEN now() END, p->>'carrier', p->>'tracking_number',
        v_pick, CASE WHEN v_pick THEN now() END, p->>'notes')
    RETURNING id INTO v_id;
  ELSE
    UPDATE shirts.orders SET
      name = p->>'name', email = p->>'email', phone = p->>'phone',
      amount_due = COALESCE((p->>'amount_due')::numeric, 0),
      paid = v_paid,
      paid_at = CASE WHEN v_paid AND paid_at IS NULL THEN now() WHEN NOT v_paid THEN NULL ELSE paid_at END,
      payment_method = p->>'payment_method',
      ship_needed = COALESCE((p->>'ship_needed')::boolean, true),
      addr_name = p->>'addr_name', addr_line1 = p->>'addr_line1', addr_line2 = p->>'addr_line2',
      addr_city = p->>'addr_city', addr_state = p->>'addr_state', addr_zip = p->>'addr_zip',
      shipped = v_ship,
      shipped_at = CASE WHEN v_ship AND shipped_at IS NULL THEN now() WHEN NOT v_ship THEN NULL ELSE shipped_at END,
      carrier = p->>'carrier', tracking_number = p->>'tracking_number',
      picked_up = v_pick,
      picked_up_at = CASE WHEN v_pick AND picked_up_at IS NULL THEN now() WHEN NOT v_pick THEN NULL ELSE picked_up_at END,
      notes = p->>'notes'
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002'; END IF;
  END IF;

  IF p ? 'items' THEN
    DELETE FROM shirts.order_items WHERE order_id = v_id;
    INSERT INTO shirts.order_items (order_id, size, qty)
    SELECT v_id, i->>'size', (i->>'qty')::int
    FROM jsonb_array_elements(p->'items') AS i
    WHERE (i->>'qty')::int > 0;
  END IF;
  RETURN v_id;
END $$;

-- PUBLIC address link, step 1: look up the buyer's first name and any saved address by token.
-- Returns only these fields, and only for the one order that owns the token.
CREATE OR REPLACE FUNCTION shirts.get_address_link(p_token text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'name', name, 'addr_name', addr_name, 'addr_line1', addr_line1, 'addr_line2', addr_line2,
    'addr_city', addr_city, 'addr_state', addr_state, 'addr_zip', addr_zip,
    'address_submitted_at', address_submitted_at)
  FROM shirts.orders WHERE address_token = p_token;
$$;

-- PUBLIC address link, step 2: save the address onto the order that owns the token.
CREATE OR REPLACE FUNCTION shirts.submit_address(
  p_token text, p_addr_name text, p_line1 text, p_line2 text,
  p_city text, p_state text, p_zip text, p_phone text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF COALESCE(btrim(p_line1),'') = '' OR COALESCE(btrim(p_city),'') = ''
     OR COALESCE(btrim(p_state),'') = '' OR COALESCE(btrim(p_zip),'') = '' THEN
    RAISE EXCEPTION 'Please fill in street, city, state and ZIP.' USING ERRCODE = '22023';
  END IF;
  UPDATE shirts.orders SET
    addr_name  = NULLIF(left(btrim(COALESCE(p_addr_name,'')), 300), ''),
    addr_line1 = left(btrim(p_line1), 300),
    addr_line2 = NULLIF(left(btrim(COALESCE(p_line2,'')), 300), ''),
    addr_city  = left(btrim(p_city), 300),
    addr_state = left(btrim(p_state), 300),
    addr_zip   = left(btrim(p_zip), 300),
    phone      = COALESCE(NULLIF(left(btrim(COALESCE(p_phone,'')), 300), ''), phone),
    address_submitted_at = now()
  WHERE address_token = p_token;
  RETURN FOUND;
END $$;

-- ---------- Security ----------
ALTER TABLE shirts.settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shirts.inventory   ENABLE ROW LEVEL SECURITY;
ALTER TABLE shirts.orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shirts.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE shirts.admins      ENABLE ROW LEVEL SECURITY;   -- no policies: only is_admin() can read it

DROP POLICY IF EXISTS admin_all ON shirts.settings;
DROP POLICY IF EXISTS admin_all ON shirts.inventory;
DROP POLICY IF EXISTS admin_all ON shirts.orders;
DROP POLICY IF EXISTS admin_all ON shirts.order_items;
CREATE POLICY admin_all ON shirts.settings    FOR ALL TO authenticated USING ((SELECT shirts.is_admin())) WITH CHECK ((SELECT shirts.is_admin()));
CREATE POLICY admin_all ON shirts.inventory   FOR ALL TO authenticated USING ((SELECT shirts.is_admin())) WITH CHECK ((SELECT shirts.is_admin()));
CREATE POLICY admin_all ON shirts.orders      FOR ALL TO authenticated USING ((SELECT shirts.is_admin())) WITH CHECK ((SELECT shirts.is_admin()));
CREATE POLICY admin_all ON shirts.order_items FOR ALL TO authenticated USING ((SELECT shirts.is_admin())) WITH CHECK ((SELECT shirts.is_admin()));

REVOKE ALL ON SCHEMA shirts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL TABLES    IN SCHEMA shirts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA shirts FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA shirts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON shirts.settings, shirts.inventory, shirts.orders, shirts.order_items TO authenticated;
GRANT SELECT ON shirts.inventory_summary TO authenticated;
GRANT EXECUTE ON FUNCTION shirts.is_admin()                         TO authenticated;
GRANT EXECUTE ON FUNCTION shirts.save_order(uuid, jsonb)            TO authenticated;
GRANT EXECUTE ON FUNCTION shirts.get_address_link(text)             TO anon, authenticated;
GRANT EXECUTE ON FUNCTION shirts.submit_address(text, text, text, text, text, text, text, text) TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA shirts TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA shirts TO service_role;

COMMIT;
