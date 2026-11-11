// Site Name configuration driven by the SITE_NAME or VITE_SITE_NAME environment variable
const metaEnv = (import.meta as any)?.env;

export const SITE_NAME =
  (typeof process !== 'undefined' && (process.env?.SITE_NAME || process.env?.VITE_SITE_NAME)) ||
  metaEnv?.VITE_SITE_NAME ||
  metaEnv?.SITE_NAME ||
  'StreamData';

// Google Analytics 4 Measurement ID (reemplazar 'G-XXXXXXXXXX' o definir VITE_GA_ID en .env / Vercel)
export const GA_MEASUREMENT_ID =
  (typeof process !== 'undefined' && (process.env?.VITE_GA_ID || process.env?.GA_MEASUREMENT_ID)) ||
  metaEnv?.VITE_GA_ID ||
  metaEnv?.GA_ID ||
  metaEnv?.VITE_GA_MEASUREMENT_ID ||
  'G-XXXXXXXXXX';
