const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;

/**
 * A build-time setting from the process environment (container env, shell). The browser has no `process`, so
 * these values never reach client code even when a config module is shared with it.
 */
export function buildEnv(name: string): string | undefined {
  return processEnv?.[name]?.trim() || undefined;
}

/** A build-time origin setting without its trailing slash. */
export function buildEnvOrigin(name: string): string | undefined {
  return buildEnv(name)?.replace(/\/+$/, "") || undefined;
}
