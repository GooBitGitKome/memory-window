-- Review and run only in an authorized development/deployment environment.
-- Expires needs immediately via RLS; physically deletes expired data daily.
create extension if not exists pg_cron;
select cron.schedule('memory-window-retention','0 3 * * *','select public.cleanup_expired_data()');
