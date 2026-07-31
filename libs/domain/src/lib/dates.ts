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

/** Calendar YYYY-MM-DD for `now` in the given IANA time zone (defaults to UTC). */
export function todayIsoInTimeZone(
  now: Date = new Date(),
  timeZone = 'UTC',
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;
    if (year && month && day) {
      return `${year}-${month}-${day}`;
    }
  } catch {
    // Invalid time zone — fall through to UTC.
  }
  return formatIsoDateUtc(startOfUtcDay(now));
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
  timeZone = 'UTC',
): ResolvedDateRange | null {
  const normalized = foldDatePhrase(phrase);
  if (!normalized) return null;

  const todayIso = todayIsoInTimeZone(today, timeZone);
  const todayUtc = new Date(`${todayIso}T00:00:00.000Z`);

  if (/^(yesterday|ayer)\b/.test(normalized)) {
    const date = addUtcDays(todayUtc, -1);
    const iso = formatIsoDateUtc(date);
    return { fromDate: iso, toDate: iso };
  }

  if (
    /^(today|hoy|this morning|esta manana|tonight|esta noche|this afternoon|esta tarde)\b/.test(
      normalized,
    )
  ) {
    return { fromDate: todayIso, toDate: todayIso };
  }

  if (
    /^(a week ago|hace una semana|last week|la semana pasada)$/.test(normalized)
  ) {
    const date = addUtcDays(todayUtc, -7);
    const iso = formatIsoDateUtc(date);
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
