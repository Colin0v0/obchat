import type { ObchatSecretStore } from "./secret-store";
import type { ObchatProvider, ObchatSettings, ProviderMessage } from "./types";
import { AnthropicProvider } from "./providers/anthropic";
import type { ChatProvider } from "./providers/base";
import { GeminiProvider } from "./providers/gemini";
import { CodexProvider, OpenAICompatibleProvider } from "./providers/openai-family";

function createProvider(provider: ObchatProvider): ChatProvider {
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

// 这个服务只负责“读设置 + 读密钥 + 调 provider”。
export class ObchatChatService {
	constructor(private readonly secretStore: ObchatSecretStore) {}

	async *stream(settings: ObchatSettings, messages: ProviderMessage[]): AsyncGenerator<string> {
		const baseUrl = settings.baseUrl.trim();
		const model = settings.model.trim();
		if (!baseUrl) {
			throw new Error("请先在 Obchat 设置里填写 Base URL。");
		}
		if (!model) {
			throw new Error("请先在 Obchat 设置里填写模型名称。");
		}

		const apiKey = await this.secretStore.getSecret(settings.apiKeySecretName);
		if (!apiKey) {
			throw new Error("请先在 Obchat 设置里配置 API Key。");
		}

		const provider = createProvider(settings.provider);
		yield* provider.stream({
			baseUrl,
			model,
			apiKey,
			systemPrompt: settings.systemPrompt,
			messages,
		});
	}
}
