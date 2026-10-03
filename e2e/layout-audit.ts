import type { Page } from "@playwright/test";

export interface LayoutIssue {
  rule: "page-scroll" | "sticks-out" | "clipped" | "overlap" | "text-on-edge" | "select-padding" | "broken-image";
  where: string;
  detail: string;
}

/**
 * Runs a set of mechanical layout checks inside the page and returns whatever
 * looks wrong. It can't judge taste, but it reliably catches the classes of bug
 * that show up by eye: text colliding with other text, content poking out of
 * its card, silently clipped text, sideways page scroll.
 *
 * Everything runs in one page.evaluate so it needs no extra dependencies.
 */
export async function auditLayout(page: Page): Promise<LayoutIssue[]> {
  return page.evaluate(() => {
    const issues: { rule: string; where: string; detail: string }[] = [];
    const seen = new Set<string>();
    const add = (rule: string, where: string, detail: string) => {
      const key = `${rule}|${where}|${detail}`;
      if (seen.has(key)) return;
      seen.add(key);
      issues.push({ rule, where, detail });
    };

    const describe = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 3).join(".");
      const text = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      return `<${tag}${cls ? "." + cls : ""}>${text ? ` "${text}"` : ""}`;
    };

    const IGNORED = "nextjs-portal, script, style, noscript, [data-nextjs-dialog-overlay], [aria-hidden='true'] canvas";
    const isIgnored = (el: Element) => !!el.closest(IGNORED);

    const isVisible = (el: Element, rect: DOMRect): boolean => {
      if (rect.width < 1 || rect.height < 1) return false;
      let node: Element | null = el;
      while (node) {
        const cs = getComputedStyle(node);
        if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
        node = node.parentElement;
      }
      return true;
    };

    const all = Array.from(document.body.querySelectorAll("*")).filter((el) => !isIgnored(el));

    // 1. Sideways page scroll.
    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      // Point at the innermost boxes whose content spills out, so the message is actionable.
      const spilling = all.filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible");
      const deepest = spilling.filter((el) => !spilling.some((other) => other !== el && el.contains(other)));
      const culprits = deepest.slice(0, 3).map(describe).join("; ");
      add("page-scroll", "document", `page is ${doc.scrollWidth}px wide in a ${doc.clientWidth}px viewport${culprits ? ` — widest content: ${culprits}` : ""}`);
    }

    // 2 + 3. Children poking out of their parent / silently clipped content.
    const scrolls = (cs: CSSStyleDeclaration) => /(auto|scroll)/.test(cs.overflowX);
    const clips = (cs: CSSStyleDeclaration) => /(hidden|clip)/.test(cs.overflowX);

    const insideScrollOrClip = (el: Element): boolean => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (scrolls(cs) || clips(cs)) return true;
        node = node.parentElement;
      }
      return false;
    };

    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) continue;
      const cs = getComputedStyle(el);
      if (el.tagName === "OPTION" || el.closest("svg")) continue;

      // Clipped text: overflow hidden/clip, content wider/taller than the box, and no
      // ellipsis / line-clamp saying it's intentional.
      if (clips(cs) || /(hidden|clip)/.test(cs.overflowY)) {
        const lineClamp = cs.getPropertyValue("-webkit-line-clamp");
        const intentionalLines = lineClamp && lineClamp !== "none";
        const hasText = (el.textContent ?? "").trim().length > 0;
        if (hasText) {
          if (clips(cs) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== "ellipsis") {
            add("clipped", describe(el), `content is ${el.scrollWidth}px but box is ${el.clientWidth}px and it hides the rest without an ellipsis`);
          }
          if (/(hidden|clip)/.test(cs.overflowY) && !intentionalLines && el.scrollHeight > el.clientHeight + 1 && cs.maxHeight === "none") {
            add("clipped", describe(el), `content is ${el.scrollHeight}px tall but box is ${el.clientHeight}px`);
          }
        }
      }

      if (cs.position === "absolute" || cs.position === "fixed" || cs.position === "sticky") continue;
      const parent = el.parentElement;
      if (!parent || parent === document.body || parent === doc) continue;

      if (!insideScrollOrClip(el)) {
        const pr = parent.getBoundingClientRect();
        const pcs = getComputedStyle(parent);
        // Only meaningful when the parent is a normal box that is supposed to contain it.
        if (pcs.display !== "contents" && pcs.display !== "inline" && !scrolls(pcs) && !clips(pcs)) {
          const over = Math.max(rect.right - pr.right, pr.left - rect.left);
          if (over > 1.5) add("sticks-out", describe(el), `extends ${Math.round(over)}px past its container ${describe(parent)}`);
        }
      }
    }

    // 4. Text / control overlap. Use the *text's own* rectangles (not the whole
    // block box, which spans the full width) so a short label next to a long
    // one isn't a false positive.
    interface Box {
      el: Element;
      rects: DOMRect[];
    }

    // Text that is scrolled/clipped out of view (line-clamp's hidden lines, the
    // far end of a scrollable table) is not on screen, so it can't collide with
    // anything. Intersect each text rect with every clipping ancestor first.
    const visiblePart = (el: Element, r: DOMRect): DOMRect | null => {
      let left = r.left;
      let right = r.right;
      let top = r.top;
      let bottom = r.bottom;
      let node: Element | null = el;
      while (node && node !== document.body) {
        const cs = getComputedStyle(node);
        if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
          const nr = node.getBoundingClientRect();
          if (cs.overflowX !== "visible") {
            left = Math.max(left, nr.left);
            right = Math.min(right, nr.right);
          }
          if (cs.overflowY !== "visible") {
            top = Math.max(top, nr.top);
            bottom = Math.min(bottom, nr.bottom);
          }
        }
        node = node.parentElement;
      }
      if (right - left <= 1 || bottom - top <= 1) return null;
      return new DOMRect(left, top, right - left, bottom - top);
    };
    const boxes: Box[] = [];
    const CONTROL = "button, a, input, select, textarea";

    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) continue;
      if (el.tagName === "OPTION" || el.closest("svg")) continue;

      const isControl = el.matches(CONTROL) && !el.querySelector(CONTROL);
      const rects: DOMRect[] = [];
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim()) {
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of Array.from(range.getClientRects())) {
            const vis = r.width > 1 && r.height > 1 ? visiblePart(el, r) : null;
            if (vis) rects.push(vis);
          }
        }
      }
      if (isControl && (el.tagName === "INPUT" || el.tagName === "SELECT" || el.tagName === "TEXTAREA" || el.tagName === "BUTTON" || el.tagName === "A")) {
        // Whole control box counts as occupied space (its text is inside it).
        if (el.tagName !== "A" || rects.length === 0) rects.push(rect);
      }
      if (rects.length) boxes.push({ el, rects });
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        let hit: [number, number] | null = null;
        for (const ra of a.rects) {
          for (const rb of b.rects) {
            const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            if (w > 2 && h > 3) {
              hit = [Math.round(w), Math.round(h)];
              break;
            }
          }
          if (hit) break;
        }
        if (hit) add("overlap", describe(a.el), `overlaps ${describe(b.el)} by ${hit[0]}×${hit[1]}px`);
      }
    }

    // 5. Text jammed against the edge of its own bordered / filled box.
    for (const el of all) {
      if (el.matches("input, select, textarea, option, img, svg, canvas")) continue;
      const rect = el.getBoundingClientRect();
      if (!isVisible(el, rect)) continue;
      const cs = getComputedStyle(el);
      const hasBorder = parseFloat(cs.borderLeftWidth) > 0 && cs.borderLeftStyle !== "none";
      const hasFill = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent";
      if (!hasBorder && !hasFill) continue;
      if (rect.width > 600) continue; // big panels/sections are padded by layout, not worth the noise
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of Array.from(range.getClientRects())) {
          const left = r.left - rect.left;
          const right = rect.right - r.right;
          if (left < 3 || right < 3) {
            add("text-on-edge", describe(el), `text is only ${Math.round(Math.min(left, right))}px from the edge of its box`);
          }
        }
      }
    }

    // 6. Dropdowns need room for their arrow (see the inset-arrow rule in globals.css).
    for (const el of Array.from(document.querySelectorAll("select"))) {
      if (isIgnored(el)) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.paddingRight) < 28) add("select-padding", describe(el), `padding-right is ${cs.paddingRight}; arrow can collide with the text`);
    }

    // 7. Images that failed to load.
    for (const img of Array.from(document.images)) {
      if (isIgnored(img)) continue;
      if (img.complete && img.naturalWidth === 0 && getComputedStyle(img).display !== "none") {
        add("broken-image", describe(img), `image failed to load: ${img.currentSrc.slice(0, 60)}`);
      }
    }

    return issues;
  }) as Promise<LayoutIssue[]>;
}

export function formatIssues(issues: LayoutIssue[]): string {
  return issues.map((i) => `  [${i.rule}] ${i.where}\n      ${i.detail}`).join("\n");
}
