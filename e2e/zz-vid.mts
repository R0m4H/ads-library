import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const tok = env.APIFY_API_TOKEN;
const actor = env.APIFY_ACTOR_META.replace("/","~");
const since = Date.now() - 14 * 864e5, now = Date.now() / 1000;
const live = (u?: string) => { const m = u?.match(/[?&]oe=([0-9A-Fa-f]+)/); return !!u && (!m || parseInt(m[1], 16) > now); };
const runs = (await (await fetch(`https://api.apify.com/v2/acts/${actor}/runs?token=${tok}&desc=1&limit=120`)).json()).data.items
  .filter((r: any) => r.status === "SUCCEEDED" && new Date(r.startedAt).getTime() >= since)
  .sort((a: any, b: any) => a.startedAt.localeCompare(b.startedAt));
const vids = new Map<string, { sd?: string; hd?: string }>();   // key: ad id + position, latest run wins
for (const run of runs) {
  const data: any[] = await (await fetch(`https://api.apify.com/v2/datasets/${run.defaultDatasetId}/items?token=${tok}&clean=true&limit=5000`)).json();
  for (const it of data) {
    const s = it.snapshot ?? {};
    [...(s.videos ?? []), ...(s.cards ?? [])].forEach((v: any, i: number) => {
      if (v.video_sd_url || v.video_hd_url) vids.set(`${it.ad_archive_id}#${i}`, { sd: v.video_sd_url, hd: v.video_hd_url });
    });
  }
}
const all = [...vids.values()];
console.log("videos found in recent syncs:", all.length, "| SD link still works:", all.filter(v => live(v.sd)).length, "| HD link still works:", all.filter(v => live(v.hd)).length);
async function size(u?: string): Promise<number | null> {
  if (!live(u)) return null;
  try {
    const r = await fetch(u!, { headers: { Range: "bytes=0-0" }, signal: AbortSignal.timeout(20000) });
    const cr = r.headers.get("content-range"); const total = cr ? Number(cr.split("/")[1]) : NaN;
    await r.body?.cancel(); return Number.isFinite(total) && total > 1 ? total : null;
  } catch { return null; }
}
const sd: number[] = [], hd: number[] = []; let sdFail = 0, hdFail = 0;
for (let i = 0; i < all.length; i += 20) {
  await Promise.all(all.slice(i, i + 20).map(async v => {
    if (live(v.sd)) { const s = await size(v.sd); s === null ? sdFail++ : sd.push(s); }
    if (live(v.hd)) { const s = await size(v.hd); s === null ? hdFail++ : hd.push(s); }
  }));
}
const MB = 1048576, mb = (n: number) => Math.round(n / MB * 100) / 100;
const report = (name: string, xs: number[], fail: number) => {
  const s = [...xs].sort((a, b) => a - b);
  const over = (m: number) => s.filter(x => x > m * MB).length;
  console.log(name, { measured: xs.length, couldNotMeasure: fail, avgMB: mb(s.reduce((a, b) => a + b, 0) / s.length), medianMB: mb(s[Math.floor(s.length / 2)]), p90MB: mb(s[Math.floor(s.length * 0.9)]), maxMB: mb(s[s.length - 1]), over5MB: over(5), over10MB: over(10), over15MB: over(15), over20MB: over(20) });
};
report("SD", sd, sdFail);
report("HD", hd, hdFail);
