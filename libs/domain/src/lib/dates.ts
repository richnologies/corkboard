const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  domingo: 0,
  monday: 1,
  lunes: 1,
  tuesday: 2,
  martes: 2,
  wednesday: 3,
  miercoles: 3,
  jueves: 4,
  thursday: 4,
  viernes: 5,
  friday: 5,
  sabado: 6,
  saturday: 6,
};

export function formatIsoDateUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function foldDatePhrase(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export interface ResolvedDateRange {
  fromDate: string;
  toDate: string;
}

/** Resolve phrases like "yesterday", "last Wednesday", or "el miercoles pasado". */
export function resolveRelativeVisitDate(
  phrase: string,
  today: Date = new Date(),
): ResolvedDateRange | null {
  const normalized = foldDatePhrase(phrase);
  if (!normalized) return null;

  const todayUtc = startOfUtcDay(today);

  if (/^(yesterday|ayer)$/.test(normalized)) {
    const date = addUtcDays(todayUtc, -1);
    const iso = formatIsoDateUtc(date);
    return { fromDate: iso, toDate: iso };
  }

  if (/^(today|hoy)$/.test(normalized)) {
    const iso = formatIsoDateUtc(todayUtc);
    return { fromDate: iso, toDate: iso };
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return { fromDate: normalized, toDate: normalized };
  }

  const weekdayMatch =
    normalized.match(
      /(?:last|past|previous|el|la)?\s*(lunes|martes|miercoles|jueves|viernes|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*(?:past|pasado|anterior)?$/,
    ) ??
    normalized.match(
      /^(lunes|martes|miercoles|jueves|viernes|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+pasado$/,
    );

  if (weekdayMatch) {
    const weekday = WEEKDAY_INDEX[weekdayMatch[1]];
    if (weekday == null) return null;

    let daysBack = (todayUtc.getUTCDay() - weekday + 7) % 7;
    if (daysBack === 0) daysBack = 7;

    const date = addUtcDays(todayUtc, -daysBack);
    const iso = formatIsoDateUtc(date);
    return { fromDate: iso, toDate: iso };
  }

  return null;
}
