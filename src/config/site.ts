// Site Name configuration driven by the SITE_NAME or VITE_SITE_NAME environment variable
const metaEnv = (import.meta as any)?.env;

export const SITE_NAME =
  (typeof process !== 'undefined' && (process.env?.SITE_NAME || process.env?.VITE_SITE_NAME)) ||
  metaEnv?.VITE_SITE_NAME ||
  metaEnv?.SITE_NAME ||
  'StreamData';

// Google Analytics 4 Measurement ID (definir GA_ID en Vercel / .env o reemplazar 'G-XXXXXXXXXX')
export const GA_MEASUREMENT_ID =
  (typeof process !== 'undefined' && (process.env?.GA_ID || process.env?.VITE_GA_ID || process.env?.GA_MEASUREMENT_ID)) ||
  metaEnv?.GA_ID ||
  metaEnv?.VITE_GA_ID ||
  metaEnv?.VITE_GA_MEASUREMENT_ID ||
  'G-XXXXXXXXXX';
