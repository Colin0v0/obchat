import type { ObchatProvider } from "../types";
import { AnthropicProvider } from "./anthropic";
import type { ChatProvider } from "./base";
import { GeminiProvider } from "./gemini";
import { CodexProvider, OpenAICompatibleProvider } from "./openai-family";

export function createProvider(provider: ObchatProvider): ChatProvider {
	if (provider === "codex") {
		return new CodexProvider();
	}

	if (provider === "claude") {
		return new AnthropicProvider();
	}

	if (provider === "gemini") {
		return new GeminiProvider();
	}

	return new OpenAICompatibleProvider();
}
