import type { ProviderMessage } from "./chat";

export interface ProviderConnectionRequest {
	baseUrl: string;
	apiKey: string;
}

export interface ProviderModelListRequest extends ProviderConnectionRequest {
}

export interface ProviderRequest extends ProviderConnectionRequest {
	model: string;
	systemPrompt: string;
	messages: ProviderMessage[];
	signal?: AbortSignal;
}
