export type AppLocale = 'en' | 'es';

/** Pick a localized string with sensible fallbacks. */
export function pickLocalized(
  locale: AppLocale,
  en?: string | null,
  es?: string | null,
  fallback?: string | null,
): string | undefined {
  const primary = locale === 'es' ? es : en;
  const secondary = locale === 'es' ? en : es;
  const value =
    primary?.trim() || fallback?.trim() || secondary?.trim() || undefined;
  return value || undefined;
}

/** Pick a localized string list with sensible fallbacks. */
export function pickLocalizedList(
  locale: AppLocale,
  en?: string[] | null,
  es?: string[] | null,
  fallback?: string[] | null,
): string[] | undefined {
  const primary = locale === 'es' ? es : en;
  const secondary = locale === 'es' ? en : es;
  const chosen =
    primary?.length ? primary : fallback?.length ? fallback : secondary;
  return chosen?.length ? [...chosen] : undefined;
}

export function hasBothLocales(
  en?: string | null,
  es?: string | null,
): boolean {
  return !!en?.trim() && !!es?.trim();
}

export function hasBothLocaleLists(
  en?: string[] | null,
  es?: string[] | null,
): boolean {
  return !!en?.length && !!es?.length;
}
