import type { ProviderModelListRequest, ProviderRequest } from "../types";

export interface ChatProvider {
	stream(request: ProviderRequest): AsyncGenerator<string>;
	listModels?(request: ProviderModelListRequest): Promise<string[]>;
}

export function joinUrl(baseUrl: string, path: string): string {
	const normalizedBaseUrl = baseUrl.trim();
	if (!normalizedBaseUrl) {
		throw new Error("请先在设置中填写 Base URL。");
	}

	const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
	const baseWithSlash = normalizedBaseUrl.endsWith("/") ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
	return new URL(normalizedPath, baseWithSlash).toString();
}

export function assertProviderResponseOk(status: number, text: string): void {
	if (status >= 200 && status < 300) {
		return;
	}

	const normalizedText = text.trim();
	if (!normalizedText) {
		throw new Error(`请求失败，状态码：${status}`);
	}

	throw new Error(`请求失败，状态码：${status}，响应：${normalizedText}`);
}

export function normalizeTextContent(content: unknown): string {
	if (typeof content === "string") {
		return content.trim();
	}

	if (!Array.isArray(content)) {
		return "";
	}

	const textParts = content
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}

			const textValue = Reflect.get(item, "text");
			return typeof textValue === "string" ? textValue : "";
		})
		.filter(Boolean);

	return textParts.join("\n").trim();
}

export function safeJsonParse(payload: string): unknown {
	try {
		return JSON.parse(payload) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`无法解析上游流式响应：${message}`);
	}
}
