export function stripLegacyFavoriteField(value: Record<string, unknown>) {
  const { isFavorite: _legacyFavorite, is_favorite: _legacySnakeCaseFavorite, ...current } = value;
  return current;
}
