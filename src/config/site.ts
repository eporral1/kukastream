// Site Name configuration driven by the SITE_NAME or VITE_SITE_NAME environment variable
export const SITE_NAME =
  (typeof process !== 'undefined' && process.env?.SITE_NAME) ||
  import.meta.env.VITE_SITE_NAME ||
  import.meta.env.SITE_NAME ||
  'StreamData';
