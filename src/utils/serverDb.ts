import { Pool } from 'pg';

const GLOBAL_POOL_KEY = '__kukastreamPgPool';
const GLOBAL_FORCE_5432_KEY = '__kukastreamForcePort5432';
const GLOBAL_CACHE_KEY = '__kukastreamApiCache';

interface CacheEntry<T = any> {
  data: T;
  expiresAt: number;
}

function getGlobalCache(): Map<string, CacheEntry> {
  if (!(globalThis as any)[GLOBAL_CACHE_KEY]) {
    (globalThis as any)[GLOBAL_CACHE_KEY] = new Map<string, CacheEntry>();
  }
  return (globalThis as any)[GLOBAL_CACHE_KEY];
}

export function getCachedResponse<T = any>(key: string): T | null {
  const cache = getGlobalCache();
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCachedResponse<T = any>(key: string, data: T, ttlMs = 10000): void {
  const cache = getGlobalCache();
  if (cache.size > 300) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }
  cache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

/**
 * Safely closes and clears the global PostgreSQL pool so no connections leak in Session Mode.
 */
export function resetPool(fallbackTo5432 = false): void {
  if (fallbackTo5432) {
    (globalThis as any)[GLOBAL_FORCE_5432_KEY] = true;
  }
  const existing: Pool | null = (globalThis as any)[GLOBAL_POOL_KEY] || null;
  (globalThis as any)[GLOBAL_POOL_KEY] = null;
  if (existing) {
    existing.end().catch(() => {});
  }
}

/**
 * Converts a Supabase Session Mode pooler URL (:5432) to Transaction Mode (:6543)
 * unless DB_FORCE_SESSION_MODE=true or a fallback was triggered.
 */
function optimizeSupabaseConnectionString(connStr: string): string {
  const force5432 =
    process.env.DB_FORCE_SESSION_MODE === 'true' ||
    Boolean((globalThis as any)[GLOBAL_FORCE_5432_KEY]);

  if (!force5432 && connStr.includes('.pooler.supabase.com:5432')) {
    return connStr.replace('.pooler.supabase.com:5432', '.pooler.supabase.com:6543');
  }
  return connStr;
}

/**
 * Returns a process-wide singleton PostgreSQL Pool optimized for Vercel Serverless
 * and Supabase Supavisor (prevents EMAXCONNSESSION / max clients reached in session mode).
 */
export function getPool(): Pool | null {
  const existing: Pool | null = (globalThis as any)[GLOBAL_POOL_KEY] || null;
  if (existing) return existing;

  const rawConnectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  const maxConnections = Math.max(
    1,
    Math.min(parseInt(process.env.DB_POOL_MAX || '1', 10) || 1, 3)
  );

  const poolConfig: any = {
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
    max: maxConnections,
    allowExitOnIdle: true,
    keepAlive: true,
  };

  let createdPool: Pool | null = null;

  if (rawConnectionString && !rawConnectionString.includes('hjkhjk')) {
    const connectionString = optimizeSupabaseConnectionString(rawConnectionString);
    createdPool = new Pool({
      ...poolConfig,
      connectionString,
    });
  } else {
    const host =
      process.env.DB_HOST ||
      process.env.POSTGRES_HOST ||
      process.env.PGHOST;

    const user =
      process.env.DB_USERNAME ||
      process.env.DB_USER ||
      process.env.POSTGRES_USER ||
      process.env.PGUSER;

    const password =
      process.env.DB_PASSWORD ||
      process.env.POSTGRES_PASSWORD ||
      process.env.PGPASSWORD;

    const database =
      process.env.DB_DATABASE ||
      process.env.DB_NAME ||
      process.env.POSTGRES_DATABASE ||
      process.env.PGDATABASE;

    let port = parseInt(
      process.env.DB_PORT ||
      process.env.POSTGRES_PORT ||
      process.env.PGPORT ||
      '5432',
      10
    );

    if (!host || !password || host.includes('hjkhjk') || password.includes('hjkhjk')) {
      return null;
    }

    const force5432 =
      process.env.DB_FORCE_SESSION_MODE === 'true' ||
      Boolean((globalThis as any)[GLOBAL_FORCE_5432_KEY]);

    // Automatically use Supabase Transaction Mode (6543) instead of Session Mode (5432)
    // to avoid "(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15"
    if (!force5432 && host.includes('.pooler.supabase.com') && port === 5432) {
      port = 6543;
    }

    createdPool = new Pool({
      ...poolConfig,
      host,
      user,
      password,
      database,
      port,
    });
  }

  createdPool.on('error', (err) => {
    console.warn('PostgreSQL pool idle client error, resetting pool:', err.message);
    resetPool();
  });

  // Preserve raw query method and wrap pool.query so direct p.query() calls also retry on EMAXCONNSESSION
  const rawQuery = createdPool.query.bind(createdPool);
  (createdPool as any).__rawQuery = rawQuery;
  (createdPool as any).query = (text: any, params?: any) => {
    if (typeof text === 'string') {
      return executeQuery(text, Array.isArray(params) ? params : []);
    }
    return rawQuery(text, params);
  };

  (globalThis as any)[GLOBAL_POOL_KEY] = createdPool;
  return createdPool;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resilient query executor that:
 * 1. Serializes queries per process via the max: 1 pool
 * 2. Retries with exponential backoff + jitter on EMAXCONNSESSION / max clients reached / transient socket resets
 * 3. Falls back from port 6543 to 5432 if Transaction Mode port is unreachable
 */
export async function executeQuery<T = any>(text: string, params: any[] = []): Promise<T> {
  const maxAttempts = 4;
  let lastError: any = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const p = getPool();
    if (!p) {
      throw new Error('Base de datos no configurada en Vercel.');
    }

    try {
      const queryFn = (p as any).__rawQuery || p.query.bind(p);
      return (await queryFn(text, params)) as T;
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '').toLowerCase();
      const code = String(err?.code || '').toLowerCase();

      const isMaxClientsError =
        msg.includes('max clients reached') ||
        msg.includes('emaxconnsession') ||
        msg.includes('too many clients') ||
        msg.includes('remaining connection slots') ||
        msg.includes('pool_size') ||
        code === '53300' ||
        code === 'emaxconnsession';

      const isPortUnreachable =
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        code === 'econnrefused';

      const isTransientConnectionError =
        isMaxClientsError ||
        isPortUnreachable ||
        msg.includes('connection terminated') ||
        msg.includes('timeout') ||
        msg.includes('closed') ||
        msg.includes('socket') ||
        msg.includes('econnreset');

      if (!isTransientConnectionError || attempt === maxAttempts) {
        throw err;
      }

      console.warn(
        `[db] Query retry ${attempt}/${maxAttempts} after ${err?.code || 'error'}: ${err?.message}`
      );

      // Cleanly close current pool before retrying; if port 6543 was refused, fall back to 5432
      resetPool(isPortUnreachable);

      // Backoff with jitter so concurrent serverless instances don't retry at the exact same millisecond
      const delayMs = attempt * 350 + Math.floor(Math.random() * 250);
      await sleep(delayMs);
    }
  }

  throw lastError;
}
