type LogMethod = (...args: unknown[]) => void;

let debugEnabled = false;

/**
 * Set whether debug logging is enabled (driven by config.debug).
 *
 * Public name: matches bridge-svelte's `setLoggerDebug` so feature ports translate
 * 1:1. The legacy `setDebug` alias is kept for backward compatibility with code
 * that was written against the pre-port nextjs API.
 */
export function setLoggerDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

/** @deprecated Use `setLoggerDebug` — kept for backward compatibility. */
export const setDebug = setLoggerDebug;

function createPrefixed(method: LogMethod, prefix: string): LogMethod {
  return (...args: unknown[]) => method(prefix, ...args);
}

export const logger = {
  debug: (...args: unknown[]) => {
    if (debugEnabled) console.log(...args);
  },
  log: (...args: unknown[]) => {
    if (debugEnabled) console.log(...args);
  },
  info: (...args: unknown[]) => {
    if (debugEnabled) console.info(...args);
  },
  warn: (...args: unknown[]) => console.warn(...args),
  error: (...args: unknown[]) => console.error(...args),
  withPrefix(prefix: string) {
    return {
      debug: (...args: unknown[]) => logger.debug(prefix, ...args),
      log: (...args: unknown[]) => logger.log(prefix, ...args),
      info: (...args: unknown[]) => logger.info(prefix, ...args),
      warn: createPrefixed(console.warn, prefix),
      error: createPrefixed(console.error, prefix),
    } as const;
  },
} as const;

export type Logger = typeof logger;
