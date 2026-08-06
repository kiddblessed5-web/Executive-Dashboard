-- ============================================================
-- SAGERO CREATIONS — Fix: restore your own Super Admin access
-- ============================================================
-- Run this once. It sets your account's role directly, bypassing
-- the User Roles page (which you can't reach right now since it's
-- one of the pages restricted to admins only).
-- ============================================================

update profiles
set role = 'Super Admin'
where email = 'kiddblessed5@gmail.com';

-- Verify it worked — should show exactly one row with role = 'Super Admin'
select id, full_name, email, role from profiles where email = 'kiddblessed5@gmail.com';
