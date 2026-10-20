import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Two themes may share a name only if no page would get both. The database can no longer enforce that (a theme's
 * scope is a list of pages), so it is checked when a theme is saved. A page's own theme may reuse a general theme's
 * name — that is how a page overrides it.
 *
 * Returns a message describing the clash, or null if the name is fine.
 */
export async function findNameClash(
  supabase: SupabaseClient,
  name: string,
  brandIds: string[],
  excludeId?: string
): Promise<string | null> {
  let query = supabase.from("theme_rules").select("id, brand_ids").eq("name", name);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const mineGeneral = brandIds.length === 0;
  for (const other of (data as { id: string; brand_ids: string[] | null }[] | null) ?? []) {
    const otherIds = other.brand_ids ?? [];
    if (mineGeneral && otherIds.length === 0) return "A general theme with that name already exists.";
    if (!mineGeneral && otherIds.some((id) => brandIds.includes(id))) {
      return "A theme with that name already applies to one of the chosen pages.";
    }
  }
  return null;
}
