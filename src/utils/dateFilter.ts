/**
 * Date filtering utilities to guarantee that only data from October 2026 onwards
 * is displayed throughout the application.
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
