-- ============================================================
-- SAGERO CREATIONS — Fix your display name
-- ============================================================
-- Your account was likely created without an explicit display
-- name, so it fell back to your email prefix ("kiddblessed5").
-- This sets it properly — change the name below if you'd prefer
-- it the other way around ("Blessed Kidd" vs "Kidd Blessed").
-- ============================================================

update profiles
set full_name = 'Kidd Blessed'
where email = 'kiddblessed5@gmail.com';

-- Verify — should show your corrected name
select full_name, email, role from profiles where email = 'kiddblessed5@gmail.com';
