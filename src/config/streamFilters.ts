/**
 * Lista de palabras o frases bloqueadas para títulos de videos en toda la plataforma.
 * Si el video_title contiene cualquiera de estos substrings (sin importar mayúsculas/minúsculas),
 * la emisión será excluida de todos los rankings, análisis, métricas de canales y consultas.
 * 
 * 👉 PARA AGREGAR NUEVAS PALABRAS O FRASES:
 * Simplemente añade un nuevo string a este array:
 * Ejemplo:
 * export const BLOCKED_STREAM_TITLE_KEYWORDS: string[] = [
 *   'DALE MATCH',
 *   'Perros de la Calle',
 *   'RUMIS',
 * ];
 */
export const BLOCKED_STREAM_TITLE_KEYWORDS: string[] = [
  'DALE MATCH', 'Perros de la Calle', 'RUMIS'
];

/**
 * Función que verifica si un título contiene alguna de las palabras bloqueadas.
 */
export function isStreamTitleBlocked(title: string | null | undefined): boolean {
  if (!title) return false;
  const lowerTitle = title.toLowerCase();
  return BLOCKED_STREAM_TITLE_KEYWORDS.some((keyword) => {
    const trimmed = keyword.trim().toLowerCase();
    return trimmed.length > 0 && lowerTitle.includes(trimmed);
  });
}

/**
 * Genera una cláusula SQL `AND (...)` que excluye filas cuyo `columnExpr`
 * contenga cualquiera de las frases en BLOCKED_STREAM_TITLE_KEYWORDS.
 */
export function getBlockedTitleSqlClause(columnExpr: string): string {
  const activeKeywords = BLOCKED_STREAM_TITLE_KEYWORDS
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  if (activeKeywords.length === 0) return '';
  const conditions = activeKeywords.map((kw) => {
    const escaped = kw.replace(/'/g, "''").replace(/[%_\\]/g, '\\$&');
    return `COALESCE(${columnExpr}, '') NOT ILIKE '%${escaped}%'`;
  });
  return ` AND (${conditions.join(' AND ')})`;
}

