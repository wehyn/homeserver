export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now) {
  let cached: { value: T; expiresAt: number } | undefined;
  let inFlight: Promise<T> | undefined;

  return {
    async get(loader: () => Promise<T>) {
      const currentTime = now();
      if (cached && currentTime < cached.expiresAt) return cached.value;
      if (inFlight) return inFlight;

      inFlight = loader()
        .then((value) => {
          cached = { value, expiresAt: now() + ttlMs };
          return value;
        })
        .finally(() => {
          inFlight = undefined;
        });
      return inFlight;
    },
    clear() {
      cached = undefined;
    },
  };
}
