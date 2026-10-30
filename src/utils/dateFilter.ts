/**
 * Date filtering and timezone formatting utilities.
 * Only data from October 2026 onwards is displayed throughout the application.
 */

// October 1, 2026 00:00:00 UTC
export const OCT_2026_TIMESTAMP = new Date('2026-10-01T00:00:00Z').getTime();

/**
 * Validates whether a given date string or timestamp is in or after October 2026.
 * Returns true if >= 2026-10-01, false otherwise.
 */
export function isOctober2026OrLater(dateStr?: string | null | Date): boolean {
  if (!dateStr) return false;

  if (dateStr instanceof Date) {
    return dateStr.getTime() >= OCT_2026_TIMESTAMP;
  }

  const str = String(dateStr).trim();
  if (!str) return false;

  // Direct regex match for YYYY-MM
  const match = str.match(/^(\d{4})[-/](\d{1,2})/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    if (year > 2026) return true;
    if (year < 2026) return false;
    return month >= 10;
  }

  // Parse ISO or standard string
  try {
    const normalized = str.includes('T') ? str : str.replace(' ', 'T');
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime() >= OCT_2026_TIMESTAMP;
    }
  } catch {
    // fallback below
  }

  return false;
}

/**
 * Formats a timestamp from the database into Argentine Time (HH:MM).
 *
 * Background: The scraper inserts Argentine local time (GMT-3) directly into PostgreSQL
 * without timezone information (e.g. "2026-10-30 11:40:00").
 * When serialized over JSON, node-postgres/Vercel serializes it with 'Z' ("2026-10-30T11:40:00.000Z").
 * If client-side JavaScript calls `new Date(...).getHours()` in an Argentine browser (GMT-3),
 * JavaScript subtracts 3 hours a second time (e.g. 11:40 -> 08:40), resulting in "3 horas menos".
 *
 * This function extracts the actual Argentine hour and minute stored in the database.
 */
export function formatArgentinaTime(dateStr?: string | null | Date | number): string {
  if (!dateStr) return '--:--';
  if (dateStr instanceof Date) {
    return `${dateStr.getHours().toString().padStart(2, '0')}:${dateStr.getMinutes().toString().padStart(2, '0')}`;
  }
  const str = String(dateStr).trim();

  // 1. Direct regex match on "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM"
  const timeMatch = str.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    return `${timeMatch[1].padStart(2, '0')}:${timeMatch[2].padStart(2, '0')}`;
  }

  // 2. Pure "HH:MM"
  if (/^\d{1,2}:\d{2}$/.test(str)) {
    const [h, m] = str.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  // 3. Fallback date parse
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
    }
  } catch {
    // fallback
  }

  return '--:--';
}

/**
 * Formats full date and time for display in Argentina (e.g., "30/10/2026 10:03 hs" or "10:03 hs")
 */
export function formatArgentinaDateTime(dateStr?: string | null): string {
  if (!dateStr) return '';
  const str = String(dateStr).trim();
  const time = formatArgentinaTime(str);
  const dateMatch = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);

  if (dateMatch && time !== '--:--') {
    const [, year, month, day] = dateMatch;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year} ${time} hs`;
  }

  if (time !== '--:--') {
    return `${time} hs`;
  }

  return str;
}
