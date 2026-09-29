-- Stores the ad limit requested for each sync, so the ingestion step can
-- tell whether a run actually captured the brand's complete active-ad set
-- (fewer items returned than the limit) or was capped short of it. Needed
-- to fix a systematic active-ad undercount: previously any sync would mark
-- every ad it didn't see as no longer active, even when the sync was
-- capped below the page's true ad count and simply never saw them.
alter table scrape_runs add column if not exists ad_limit integer;
