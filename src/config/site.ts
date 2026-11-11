// Site Name configuration driven by the SITE_NAME or VITE_SITE_NAME environment variable
const metaEnv = (import.meta as any)?.env;

export const SITE_NAME =
  (typeof process !== 'undefined' && (process.env?.SITE_NAME || process.env?.VITE_SITE_NAME)) ||
  metaEnv?.VITE_SITE_NAME ||
  metaEnv?.SITE_NAME ||
  'StreamData';
