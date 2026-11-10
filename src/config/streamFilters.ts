/**
 * Lista de palabras o frases bloqueadas para títulos de videos en /streams.
 * Si el video_title contiene cualquiera de estos substrings (sin importar mayúsculas/minúsculas),
 * el stream será excluido de la sección /streams.
 * 
 * 👉 PARA AGREGAR NUEVAS PALABRAS O FRASES:
 * Simplemente añade un nuevo string a este array:
 * Ejemplo:
 * export const BLOCKED_STREAM_TITLE_KEYWORDS: string[] = [
 *   'DALE MATCH',
 *   'OTRA PALABRA',
 *   'NUEVA FRASE',
 * ];
 */
export const BLOCKED_STREAM_TITLE_KEYWORDS: string[] = [
  'DALE MATCH',
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
