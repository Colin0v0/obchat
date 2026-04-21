import { createProvider } from "../providers/registry";
import type { ObchatProfile, ProviderMessage } from "../types";

// 这个服务只负责“读设置 + 读密钥 + 调 provider”。
export class ObchatChatService {
	private getValidatedConnection(profile: ObchatProfile): {
		baseUrl: string;
		model: string;
		apiKey: string;
	} {
		const baseUrl = profile.baseUrl.trim();
		const model = profile.model.trim();
		const apiKey = profile.apiKey.trim();
		if (!baseUrl) {
			throw new Error("请先在 Obchat 设置里填写 Base URL。");
		}
		if (!model) {
			throw new Error("请先在 Obchat 设置里填写模型名称。");
		}
		if (!apiKey) {
			throw new Error("请先在 Obchat 设置里配置 API Key。");
		}

		return {
			baseUrl,
			model,
			apiKey,
		};
	}

	private getValidatedConnectionWithoutModel(profile: ObchatProfile): {
		baseUrl: string;
		apiKey: string;
	} {
		const baseUrl = profile.baseUrl.trim();
		const apiKey = profile.apiKey.trim();
		if (!baseUrl) {
			throw new Error("请先在 Obchat 设置里填写 Base URL。");
		}
		if (!apiKey) {
			throw new Error("请先在 Obchat 设置里配置 API Key。");
		}

		return {
			baseUrl,
			apiKey,
		};
	}

	async *stream(
		profile: ObchatProfile,
		messages: ProviderMessage[],
		signal?: AbortSignal,
	): AsyncGenerator<string> {
		const { baseUrl, model, apiKey } = this.getValidatedConnection(profile);
		const provider = createProvider(profile.provider);
		yield* provider.stream({
			baseUrl,
			model,
			apiKey,
			systemPrompt: profile.systemPrompt,
			messages,
			signal,
		});
	}

	async listModels(profile: ObchatProfile): Promise<string[]> {
		const provider = createProvider(profile.provider);
		if (!provider.listModels) {
			throw new Error("当前供应商暂不支持自动拉取模型列表。");
		}

		const { baseUrl, apiKey } = this.getValidatedConnectionWithoutModel(profile);
		return provider.listModels({
			baseUrl,
			apiKey,
		});
	}
}
