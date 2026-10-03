# Layout & visual tests

Opens every screen at phone / tablet / desktop width and checks it.

## What it checks
1. **Layout audit** (`layout-audit.ts`) — fails on: text overlapping other text/controls, content
   poking out of its card, text silently clipped (no ellipsis), sideways page scroll, text jammed
   against the edge of its box, dropdowns without room for their arrow, broken images.
2. **Screenshot comparison** — each screen is compared to a saved baseline; any visual change fails.

All API calls are mocked (`mocks.ts`) with awkward data (very long Georgian/English names, missing
logos/copy, one-word headlines…). Nothing real is read, synced or paid for.

## Commands
| Command | What it does |
| --- | --- |
| `npm run e2e:login` | One-time: opens a browser, you sign in (Owner account), session saved to `e2e/.auth/` |
| `npm run e2e:update` | Create/refresh the baseline screenshots — run after an intended visual change |
| `npm run e2e` | Run everything (starts `npm run dev` unless it is already running) |
| `npm run e2e:selftest` | Checks the audit itself (needs no login, no server) |
| `npm run e2e:report` | Open the HTML report with side-by-side diffs of any failure |

## When a test fails
- Layout problem → the message names the element and the rule. Fix the UI.
- Screenshot diff, change was intended → `npm run e2e:update`.
- Real false positive in the audit → add it to `IGNORE` in `pages.spec.ts` with a reason.
- "Redirected to /login" → session expired, run `npm run e2e:login` again.

The dashboard is rendered on the server from real data, so it only gets the layout audit
(no screenshot). Baselines and the saved session are git-ignored (machine-specific / secret).
