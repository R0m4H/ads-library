-- TikTok Ads Library has no coverage in this team's region, so drop it as a
-- tracked platform entirely.

delete from ads where platform = 'tiktok';
delete from scrape_runs where platform = 'tiktok';

alter table ads drop constraint if exists ads_platform_check;
alter table ads add constraint ads_platform_check check (platform in ('meta', 'google', 'linkedin'));

alter table scrape_runs drop constraint if exists scrape_runs_platform_check;
alter table scrape_runs add constraint scrape_runs_platform_check check (platform in ('meta', 'google', 'linkedin'));

alter table brands drop column if exists tiktok_handle;
