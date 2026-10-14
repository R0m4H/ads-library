-- "Tags set by hand": when an editor changes an ad's themes (or accepts an AI suggestion) the ad is
-- marked, and "Re-tag all ads" leaves marked ads alone. Ads that existed before this column do NOT
-- get marked — nothing recorded who set their tags — so only tags set from now on are protected.
alter table ads add column if not exists tags_manual boolean not null default false;

-- Make the new column visible to the API straight away.
notify pgrst, 'reload schema';
