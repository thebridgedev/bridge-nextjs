/**
 * Translator access for the SDK auth components (TBP-630/TBP-633).
 *
 * Reads `locale` / `messages` off BridgeConfig so an app sets the language ONCE
 * at bootstrap rather than passing it to every component, and layers a
 * component-level `messages` prop on top for per-screen wording.
 *
 * Mirrors bridge-svelte's `client/stores/i18n.ts` — same precedence, same
 * fallback, same key set. The catalogue itself lives in auth-core precisely so
 * a translation fixed once is fixed in every framework package.
 */
import { createTranslator, type MessageOverrides, type Translator } from '@nebulr-group/bridge-auth-core';
import { getBridgeConfig } from '../core/bridge-instance';

/**
 * Build a translator from config, with an optional per-component override.
 *
 * `getBridgeConfig()` throws when `<BridgeProvider>` has not initialised. These
 * components can render before that in a test harness or a stray import, and a
 * login form rendered in English is a far better failure than one that throws
 * because nobody mounted the provider — so the catch falls back to the default
 * (English) translator rather than propagating.
 */
export function getTranslator(messages?: MessageOverrides): Translator {
  try {
    const { locale, messages: configMessages } = getBridgeConfig();
    return createTranslator({
      locale,
      messages: { ...configMessages, ...messages },
    });
  } catch {
    return createTranslator({ messages });
  }
}

export type { MessageOverrides, Translator };
