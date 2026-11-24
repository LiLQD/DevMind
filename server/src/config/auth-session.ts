function lifetimeSeconds(
  setting: string,
  raw: string | undefined,
  fallback: number,
) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < 1 || value > 2_147_483_647) {
    throw new Error(`${setting} must be a positive integer in seconds.`);
  }
  return value;
}

export function readAuthSessionPolicy(settings: NodeJS.ProcessEnv) {
  const accessLifetimeSeconds = lifetimeSeconds(
    "AUTH_ACCESS_TTL_SECONDS",
    settings.AUTH_ACCESS_TTL_SECONDS,
    15 * 60,
  );
  const refreshLifetimeSeconds = lifetimeSeconds(
    "AUTH_REFRESH_TTL_SECONDS",
    settings.AUTH_REFRESH_TTL_SECONDS,
    30 * 24 * 60 * 60,
  );
  if (refreshLifetimeSeconds < accessLifetimeSeconds) {
    throw new Error(
      "AUTH_REFRESH_TTL_SECONDS must be at least AUTH_ACCESS_TTL_SECONDS.",
    );
  }
  return { accessLifetimeSeconds, refreshLifetimeSeconds };
}

export const authSessionPolicy = readAuthSessionPolicy(process.env);
