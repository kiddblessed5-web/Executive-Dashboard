-- Run this one query. It puts everything in a single text column so
-- nothing gets cut off on screen — just screenshot the result.

select tablename || '.' || cmd || '  →  with_check: [' || coalesce(with_check::text, 'NULL') || ']  |  roles: ' || roles::text || '  |  permissive: ' || permissive as info
from pg_policies
where tablename in ('conversations','conversation_members')
order by tablename, cmd;
