CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-old-attendance-monthly',
  '0 2 1 * *',
  $$
  DELETE FROM public.attendance WHERE date < (CURRENT_DATE - INTERVAL '6 months');
  $$
);