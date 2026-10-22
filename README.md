# Saddle Up Shirts

Order tracker for shirts.eckerthaus.com. A static site (plain HTML/JS in `public/`) that talks directly to Supabase.
There is no server to run or host. GitHub Pages serves the site and Supabase holds the data and the login.

## One-time Supabase setup
1. **SQL Editor:** paste `schema.sql` and run it. It's safe to re-run.
2. **Project Settings > Data API > Exposed schemas:** add `shirts` and save.
3. **Authentication > Users > Add user:** create your login (email + password) and tick *Auto Confirm User*.
4. **Authentication > Sign In / Providers:** turn off *Allow new users to sign up* so nobody else can create accounts.
5. **SQL Editor:** open `tools/add-admin.sql`, put your email in, and run it. This marks your login as the shop admin.

## Run it locally
```
./tools/dev.sh
```
(run `chmod +x tools/dev.sh` once first). Open http://localhost:8000 and sign in with the email and password from step 3.
The script also prints a URL for your iPhone on the same Wi-Fi.

## Publish to shirts.eckerthaus.com
1. Push to `main`. The workflow in `.github/workflows/pages.yml` publishes the `public/` folder.
2. On GitHub: **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. Same page, **Custom domain:** `shirts.eckerthaus.com`, then tick **Enforce HTTPS** once it's available.
4. At your DNS provider, add a **CNAME** record: `shirts` pointing to `tyler-eckert.github.io`.

## How security works
- The page only contains the Supabase URL and the *publishable* key, which are meant to be public.
- Row-level security locks every table to the admin account you set up in step 5. Anyone else, signed in or not, can't read or change orders.
- The address link is the one public door: two database functions that only read or update the single order matching the link's secret token.
- The Supabase *secret* key is not used anywhere and must never be committed. Don't put secrets in any file in this repo.

## How the address link works
Every order gets an unguessable link: `https://shirts.eckerthaus.com/a/#<token>`.
Open an order, tap "Send address link", and share it by text. The buyer fills in their address,
and it shows up on the order with an "Address in" badge. Use "Ready to pack" and "Copy address" when shipping.
