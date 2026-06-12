/**
 * Normalize an ingredient name for de-duplication / lookup purposes.
 * Trims surrounding whitespace, lowercases, and collapses internal
 * whitespace runs into a single space.
 */
export function normalizeIngredientName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
