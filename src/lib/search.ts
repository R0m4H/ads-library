/**
 * Partial-word search over an ad's headline, body and CTA.
 *
 * Postgres full-text search only matches whole words, so "სესხ" would not find "სესხი". Instead each
 * typed word is matched as a case-insensitive substring (ILIKE '%word%'). Several words mean ALL of
 * them must appear somewhere in the ad (in any of the three fields), like the old search did.
 */

/** Words to look for, from whatever the user typed. */
export function searchTerms(q: string): string[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8); // a sane cap; nobody needs more and every term adds a condition
}

/**
 * One PostgREST `or` filter string for a single word: matches when the word is in the headline, the
 * body or the CTA. The word is escaped twice on purpose — once so `%` `_` `\` typed by the user are
 * matched literally instead of acting as wildcards, once so commas, quotes and parentheses cannot
 * break out of the filter syntax.
 */
export function termFilter(term: string): string {
  const likePattern = `%${term.replace(/[\\%_]/g, "\\$&")}%`;
  const quoted = `"${likePattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  return ["headline", "body", "cta"].map((col) => `${col}.ilike.${quoted}`).join(",");
}
