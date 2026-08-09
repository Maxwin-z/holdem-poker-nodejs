import { CurrentGtoStrategyProvider } from "./gto-strategy-provider";
import type { BotStrategyProvider } from "./types";

let provider: BotStrategyProvider = new CurrentGtoStrategyProvider();

export function getBotStrategyProvider(): BotStrategyProvider {
  return provider;
}

/** Allows a future solver/model to replace the current GTO implementation. */
export function setBotStrategyProvider(next: BotStrategyProvider) {
  provider = next;
}

