-- Our own saved copies of an ad's pictures and videos, kept in Cloudflare R2 because Meta's links expire after a
-- few days. One entry per saved picture of the ad (an ad can have several: both sizes of a dynamic-creative ad,
-- every card of a carousel, a video's still image):
--   [{ "i": 0, "key": "previews/<ad id>/0.webp", "w": 1080, "h": 1920,
--      "video_key": "previews/<ad id>/0.mp4", "video_bytes": 912345 }, ...]
-- "i" is the position in the ad's media list, "w"/"h" are the saved picture's size (to tell square from
-- vertical from horizontal), and the video_* fields exist only when a video was saved too.
alter table ads add column if not exists previews jsonb not null default '[]'::jsonb;

-- Make the new column visible to the API straight away.
notify pgrst, 'reload schema';
