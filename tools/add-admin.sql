-- Makes your Supabase login the shop admin. Run once in the SQL Editor after creating the user
-- (Authentication > Users > Add user). Replace the email below with the one you used.
INSERT INTO shirts.admins (user_id)
SELECT id FROM auth.users WHERE email = 'YOU@EXAMPLE.COM'
ON CONFLICT DO NOTHING;

-- Check it worked: this should return one row.
SELECT u.email, a.user_id FROM shirts.admins a JOIN auth.users u ON u.id = a.user_id;
