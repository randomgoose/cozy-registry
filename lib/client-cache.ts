type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const resolvedValueCache = new Map<string, CacheEntry>();
const inflightValueCache = new Map<string, Promise<unknown>>();

type GetClientCachedValueOptions = {
  ttlMs?: number;
  force?: boolean;
};

export async function getClientCachedValue<T>(
  key: string,
  loader: () => Promise<T>,
  options: GetClientCachedValueOptions = {},
): Promise<T> {
  const { ttlMs = 10_000, force = false } = options;
  const now = Date.now();

  if (!force) {
    const cached = resolvedValueCache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.value as T;
    }

    const inflight = inflightValueCache.get(key);
    if (inflight) {
      return inflight as Promise<T>;
    }
  }

  const pending = loader()
    .then((value) => {
      resolvedValueCache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value,
      });
      return value;
    })
    .finally(() => {
      inflightValueCache.delete(key);
    });

  inflightValueCache.set(key, pending);

  return pending;
}

export function invalidateClientCachedValue(match: string | ((key: string) => boolean)) {
  for (const key of resolvedValueCache.keys()) {
    const matches = typeof match === "string" ? key.startsWith(match) : match(key);
    if (matches) {
      resolvedValueCache.delete(key);
      inflightValueCache.delete(key);
    }
  }
}
