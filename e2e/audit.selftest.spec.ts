import { test, expect } from "@playwright/test";
import { auditLayout } from "./layout-audit";

// These tests prove the audit itself works: it must flag known-bad layouts and
// stay quiet on known-good ones. They use inline HTML, so they need no server
// and no login — run with `npm run e2e:selftest`.

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; padding: 16px; font: 14px/1.4 sans-serif; }
  .card { width: 320px; border: 1px solid #ccc; border-radius: 8px; padding: 16px; }
  .row { display: flex; align-items: flex-start; justify-content: space-between; }
  .left { display: flex; align-items: center; gap: 12px; }
  .badge { background: #f60; color: #fff; padding: 2px 6px; font-size: 10px; border-radius: 4px; }
  .actions { display: flex; gap: 12px; }
  select { padding: 4px 8px; }
`;

const LONG = "საქართველოს ბანკი ბიზნესი • Bank of Georgia Business";

async function load(page: import("@playwright/test").Page, body: string, extraCss = "") {
  await page.setViewportSize({ width: 400, height: 700 });
  await page.setContent(`<style>${BASE_CSS}${extraCss}</style>${body}`);
}

test("flags the original brand-card bug: long name + badge colliding with the actions", async ({ page }) => {
  // Same structure the card had before the fix: left side can't shrink, right side can.
  await load(
    page,
    `<div class="card"><div class="row">
       <div class="left"><span>L</span><div><div style="display:flex;gap:8px;align-items:center">
         <a href="#" style="white-space:nowrap">${LONG}</a><span class="badge">YOU</span></div></div></div>
       <div class="actions"><a href="#">View ads</a><button>Remove</button></div>
     </div></div>`
  );
  const issues = await auditLayout(page);
  expect(issues.some((i) => i.rule === "overlap" || i.rule === "sticks-out")).toBe(true);
});

test("is quiet on the fixed brand-card structure", async ({ page }) => {
  await load(
    page,
    `<div class="card"><div class="row" style="gap:16px">
       <div class="left" style="min-width:0;flex:1"><span style="flex-shrink:0">L</span><div style="min-width:0">
         <h3 style="margin:0;overflow-wrap:anywhere"><a href="#">${LONG}</a> <span class="badge" style="display:inline-block">YOU</span></h3></div></div>
       <div class="actions" style="flex-shrink:0;white-space:nowrap"><a href="#">View ads</a><button>Remove</button></div>
     </div></div>`
  );
  expect(await auditLayout(page)).toEqual([]);
});

test("flags text overlapping text", async ({ page }) => {
  await load(page, `<div style="position:relative;height:60px"><span style="position:absolute;left:0;top:0">Hello world</span><span style="position:absolute;left:20px;top:2px">Overlapping</span></div>`);
  expect((await auditLayout(page)).some((i) => i.rule === "overlap")).toBe(true);
});

test("ignores text that is hidden underneath an overlay, but still flags visible collisions", async ({ page }) => {
  await load(
    page,
    `<div style="position:relative;height:80px">
       <span style="position:absolute;left:0;top:0">Underneath text</span>
       <div style="position:absolute;z-index:30;left:0;top:0;width:200px;height:40px;background:#fff;border:1px solid #ccc"><span>Panel option</span></div>
     </div>`
  );
  expect((await auditLayout(page)).filter((i) => i.rule === "overlap")).toEqual([]);
});

test("flags content that sticks out of its container", async ({ page }) => {
  await load(page, `<div class="card"><div style="display:flex"><div style="width:600px;flex-shrink:0;background:#eee">wide child</div></div></div>`);
  const issues = await auditLayout(page);
  expect(issues.some((i) => i.rule === "sticks-out" || i.rule === "page-scroll")).toBe(true);
});

test("flags a page that scrolls sideways", async ({ page }) => {
  await load(page, `<div style="width:900px;height:20px;background:#eee">too wide</div>`);
  expect((await auditLayout(page)).some((i) => i.rule === "page-scroll")).toBe(true);
});

test("flags text silently clipped without an ellipsis, but not a proper truncate", async ({ page }) => {
  await load(
    page,
    `<div style="width:120px;overflow:hidden;white-space:nowrap" id="bad">This sentence is far too long for the box</div>
     <div style="width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" id="ok">This sentence is far too long for the box</div>`
  );
  const issues = await auditLayout(page);
  const clipped = issues.filter((i) => i.rule === "clipped");
  expect(clipped).toHaveLength(1);
  expect(clipped[0].where).toContain("This sentence");
});

test("flags a dropdown with no room for its arrow, accepts one with room", async ({ page }) => {
  await load(page, `<select style="padding-right:4px"><option>All brands</option></select>`);
  expect((await auditLayout(page)).some((i) => i.rule === "select-padding")).toBe(true);
  await load(page, `<select style="padding-right:36px"><option>All brands</option></select>`);
  expect((await auditLayout(page)).some((i) => i.rule === "select-padding")).toBe(false);
});

test("flags text jammed against the edge of its own box", async ({ page }) => {
  await load(page, `<span style="display:inline-block;background:#ddd;padding:0 1px">Tight</span>`);
  expect((await auditLayout(page)).some((i) => i.rule === "text-on-edge")).toBe(true);
});

test("does not flag normal padded pills, buttons, line-clamped text or scroll containers", async ({ page }) => {
  await load(
    page,
    `<div class="card">
       <span style="background:#eee;padding:2px 8px;border-radius:99px">Meta</span>
       <button style="padding:6px 12px">Manage &amp; Sync →</button>
       <p style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:8px 0">${LONG} ${LONG} ${LONG} ${LONG}</p>
       <div style="overflow-x:auto"><table style="min-width:600px"><tr><td>a scrollable table</td><td>second column</td></tr></table></div>
     </div>`
  );
  expect(await auditLayout(page)).toEqual([]);
});
