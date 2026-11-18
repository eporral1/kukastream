import { GA_MEASUREMENT_ID, SITE_NAME } from '../config/site';

declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Inicializa Google Analytics 4 (gtag.js) si no fue cargado desde index.html
 * o actualiza la configuración cuando se define VITE_GA_ID / GA_MEASUREMENT_ID.
 */
export function initAnalytics(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  }

  // Si el usuario configuró su ID en src/config/site.ts o VITE_GA_ID y aún no está el script en el DOM
  if (GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX') {
    const existingScript = document.querySelector(
      `script[src*="googletagmanager.com/gtag/js"]`
    ) as HTMLScriptElement | null;

    if (!existingScript) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
      document.head.appendChild(script);
      window.gtag('js', new Date());
    }

    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false, // Manejado dinámicamente por ruta en trackPageView
    });
  }
}

/**
 * Envía un evento personalizado a Google Analytics 4
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined | null>
): void {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, {
        ...params,
      });
    }
  } catch {
    // Ignorar errores de bloqueadores de anuncios
  }
}

/**
 * Devuelve el título formateado "<SITE_NAME> - <SECCIÓN>" según la ruta actual
 */
export function getSectionTitle(pathname: string, channelName?: string): { title: string; section: string } {
  const cleanPath = (pathname || '/').split('?')[0];

  if (cleanPath === '/channels') {
    return { title: `${SITE_NAME} - Canales`, section: 'Canales' };
  }
  if (cleanPath === '/streams') {
    return { title: `${SITE_NAME} - Streams`, section: 'Streams' };
  }
  if (cleanPath === '/superchats') {
    return { title: `${SITE_NAME} - Superchats`, section: 'Superchats' };
  }
  if (cleanPath === '/usuarios' || cleanPath === '/comentaristas' || cleanPath === '/bots') {
    return { title: `${SITE_NAME} - Usuarios y Bots`, section: 'Usuarios y Bots' };
  }
  if (cleanPath.startsWith('/face-off')) {
    return { title: `${SITE_NAME} - Face-Off`, section: 'Face-Off' };
  }
  if (cleanPath === '/contacto' || cleanPath === '/contact') {
    return { title: `${SITE_NAME} - Contacto`, section: 'Contacto' };
  }
  if (cleanPath.startsWith('/channel/')) {
    const fallbackHandle = decodeURIComponent(cleanPath.replace('/channel/', ''));
    const label = channelName || fallbackHandle || 'Canal';
    return { title: `${SITE_NAME} - ${label}`, section: `Canal: ${label}` };
  }

  return {
    title: `${SITE_NAME} - Ranking en vivo de streamings`,
    section: 'Home',
  };
}

/**
 * Actualiza <title>, <meta name="description">, <link rel="canonical">, OpenGraph y Twitter Card tags en el DOM
 */
export function updateSeoMeta({
  title,
  description,
  canonicalPath,
}: {
  title?: string;
  description?: string;
  canonicalPath?: string;
}): void {
  if (typeof document === 'undefined') return;

  if (title) {
    document.title = title;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);
    const twTitle = document.querySelector('meta[name="twitter:title"]');
    if (twTitle) twTitle.setAttribute('content', title);
  }

  if (description !== undefined) {
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute('content', description);

    const twDesc = document.querySelector('meta[name="twitter:description"]');
    if (twDesc) twDesc.setAttribute('content', description);
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const cleanPath = (canonicalPath || window.location.pathname || '/').split('?')[0];
    const canonicalUrl = `${window.location.origin}${cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`}`;

    let canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);

    let ogUrl = document.querySelector('meta[property="og:url"]') as HTMLMetaElement | null;
    if (!ogUrl) {
      ogUrl = document.createElement('meta');
      ogUrl.setAttribute('property', 'og:url');
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute('content', canonicalUrl);
  }
}

/**
 * Actualiza document.title y registra page_view en Google Analytics 4
 */
export function trackPageView(pathname: string, channelName?: string, channelDescription?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const { title, section } = getSectionTitle(pathname, channelName);
  updateSeoMeta({
    title,
    ...(channelDescription !== undefined ? { description: channelDescription } : {}),
  });

  trackEvent('page_view', {
    page_title: title,
    page_path: pathname + (window.location.search || ''),
    page_location: window.location.href,
    content_group: section,
  });
}
