-- Hosted worker: Supabase pg_cron calls the app's queue-drain route every minute.
-- Hosted project only (never local: it would call production). Run once, as a database role.
-- Replace __CRON_SECRET__ with the same value as the Vercel production env var CRON_SECRET
-- (never commit the real value). Re-running is safe.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('__CRON_SECRET__', 'workatent_cron_secret', 'Bearer for /api/cron/worker')
 where not exists (select 1 from vault.secrets where name = 'workatent_cron_secret');

select cron.schedule('workatent-worker', '* * * * *', $job$
  select net.http_post(
    url := 'https://workatent.vercel.app/api/cron/worker',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'workatent_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 300000
  );
$job$);

-- Check:   select jobname, schedule, active from cron.job;
-- Runs:    select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- Stop:    select cron.unschedule('workatent-worker');
-- Rotate:  select vault.update_secret((select id from vault.secrets where name = 'workatent_cron_secret'), '<new>');
