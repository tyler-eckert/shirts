# tools

Helpers for working on the app. Nothing here is needed to run the live site.

- `dev.sh` serves `public/` on your Mac at http://localhost:8000 and prints an iPhone URL for the same Wi-Fi. It uses your real Supabase project.
- `add-admin.sql` makes your Supabase login the shop admin. Run it once in the SQL Editor after creating your user.
- `seed-demo.sql` loads 7 sample orders and stock. Paste it into the SQL Editor. It does nothing if orders already exist.
- `clear-orders.sql` wipes all orders and resets stock and pricing. Run it after demoing and before entering real orders.

The demo data goes into your real Supabase project, so remember to run `clear-orders.sql` before going live.
