import type { ChatProvider } from "./base";
import { joinUrl, safeJsonParse } from "./base";
import { readSseData, streamSseEvents } from "./streaming-http";
import type { ProviderRequest } from "../types";

const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

function extractClaudeDelta(payload: unknown): string {
	if (!payload || typeof payload !== "object") {
		return "";
	}

	const typeValue = Reflect.get(payload, "type");
	if (typeValue !== "content_block_delta") {
		return "";
	}

	const deltaValue = Reflect.get(payload, "delta");
	if (!deltaValue || typeof deltaValue !== "object") {
		return "";
	}

	if (Reflect.get(deltaValue, "type") !== "text_delta") {
		return "";
	}

	const textValue = Reflect.get(deltaValue, "text");
	return typeof textValue === "string" ? textValue : "";
}

export class AnthropicProvider implements ChatProvider {
	async *stream(request: ProviderRequest): AsyncGenerator<string> {
		let emittedAnyText = false;
		for await (const eventText of streamSseEvents(joinUrl(request.baseUrl, "/messages"), {
			headers: {
				"x-api-key": request.apiKey,
				"anthropic-version": ANTHROPIC_API_VERSION,
				"Content-Type": "application/json",
			},
			signal: request.signal,
			body: JSON.stringify({
				model: request.model,
				max_tokens: DEFAULT_MAX_TOKENS,
				stream: true,
				system: request.systemPrompt.trim() || undefined,
				messages: request.messages.map((message) => ({
					role: message.role,
					content: message.content,
				})),
			}),
		})) {
			const payloadText = readSseData(eventText);
			if (!payloadText) {
				continue;
			}

			const deltaText = extractClaudeDelta(safeJsonParse(payloadText));
			if (!deltaText) {
				continue;
			}

			emittedAnyText = true;
			yield deltaText;
		}

		if (!emittedAnyText) {
			throw new Error("Claude 流式响应里没有可用文本。");
		}
	}
}
