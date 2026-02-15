type LogMethod = (...args: unknown[]) => void;

let debugEnabled = false;

/**
 * Set whether debug logging is enabled (e.g. from config.debug).
 * Call this from server code with getConfig().debug or from client when config is available.
 */
export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

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
