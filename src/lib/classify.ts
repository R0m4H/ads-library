// Lightweight keyword-based theme classifier used at ingest time.
// Not meant to be precise — it's a fast first pass so ads are browsable by
// theme immediately after a sync. Tags can be edited manually in the UI.

const RULES: { tag: string; keywords: RegExp }[] = [
  { tag: "Discount / Sale", keywords: /\b(sale|% off|percent off|discount|save \$|clearance|deal)\b/i },
  { tag: "New Product Launch", keywords: /\b(new arrival|just launched|introducing|now available|new collection)\b/i },
  { tag: "Limited Time / Urgency", keywords: /\b(today only|ends soon|last chance|hurry|while supplies last|limited time|don't miss)\b/i },
  { tag: "Free Trial / Demo", keywords: /\b(free trial|try (it )?free|book a demo|get a demo|no credit card)\b/i },
  { tag: "Lead Gen / Signup", keywords: /\b(sign up|subscribe|get started|join now|download|request a quote|learn more)\b/i },
  { tag: "Testimonial / UGC", keywords: /\b(customers say|review|rated \d|testimonial|as seen on|real results)\b/i },
  { tag: "Seasonal / Holiday", keywords: /\b(black friday|cyber monday|christmas|holiday|summer sale|back to school|valentine)\b/i },
  { tag: "Educational / How-to", keywords: /\b(how to|guide to|tips for|everything you need to know|explained)\b/i },
  { tag: "Retargeting / Social Proof", keywords: /\b(still thinking|come back|don't forget|trusted by|thousands of)\b/i },
];

export function classifyTheme(text: string): string[] {
  const matches = RULES.filter((r) => r.keywords.test(text)).map((r) => r.tag);
  return matches.length > 0 ? matches : ["Brand Awareness"];
}

export function classifyAd(headline: string | null, body: string | null, cta: string | null): string[] {
  const text = [headline, body, cta].filter(Boolean).join(" ");
  if (!text.trim()) return ["Brand Awareness"];
  return classifyTheme(text);
}
