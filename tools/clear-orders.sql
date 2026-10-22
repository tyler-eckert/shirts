-- Wipes all orders and resets the Stock tab to zero and pricing to defaults.
-- Run in the Supabase SQL Editor after you're done with demo data and before real orders.
BEGIN;
DELETE FROM shirts.orders;                       -- order_items go with them
UPDATE shirts.inventory SET stock = 0;
UPDATE shirts.settings  SET shirt_price = 25, shipping_fee = 0;
COMMIT;
