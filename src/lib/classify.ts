// Matches an ad's text against user-managed theme rules (see the Themes
// page and the `theme_rules` table). Plain case-insensitive substring
// matching — keywords are whatever the user typed, not regex, so this
// works for any language without special-casing.
//
// When text matches more than one theme, priority + exclusion rules
// resolve the overlap: rules are processed highest-`priority` first, and a
// surviving rule's `excludes` list removes those theme names from the
// result — even if their own keywords also matched. A rule that has
// already been excluded by a higher-priority one does not, in turn,
// exclude anything itself. Ties (equal priority) keep the order the rules
// were passed in (the API returns them alphabetically by name).

export interface ThemeRuleLike {
  name: string;
  keywords: string[];
  priority?: number;
  excludes?: string[];
}

export function matchThemes(text: string, rules: ThemeRuleLike[]): string[] {
  const lower = text.toLowerCase();
  if (!lower.trim()) return [];

  const matched = rules.filter((rule) => rule.keywords.some((kw) => kw.trim() && lower.includes(kw.trim().toLowerCase())));
  if (matched.length <= 1) return matched.map((r) => r.name);

  const byPriority = [...matched].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  const excluded = new Set<string>();
  for (const rule of byPriority) {
    if (excluded.has(rule.name)) continue; // already knocked out by a higher-priority rule
    for (const name of rule.excludes ?? []) excluded.add(name);
  }

  return matched.filter((r) => !excluded.has(r.name)).map((r) => r.name);
}

export function classifyAd(
  headline: string | null,
  body: string | null,
  cta: string | null,
  rules: ThemeRuleLike[]
): string[] {
  const text = [headline, body, cta].filter(Boolean).join(" ");
  return matchThemes(text, rules);
}
