import type { ChatProvider } from "./base";
import { joinUrl, safeJsonParse } from "./base";
import { readSseData, streamSseEvents } from "./streaming-http";
import type { ProviderRequest } from "../types";
import { parseDataUrl } from "../utils/image-data";

function extractGeminiText(payload: unknown): string {
	if (!payload || typeof payload !== "object") {
		return "";
	}

	const candidates = Reflect.get(payload, "candidates");
	if (!Array.isArray(candidates) || candidates.length === 0) {
		return "";
	}

	const firstCandidate = candidates[0];
	if (!firstCandidate || typeof firstCandidate !== "object") {
		return "";
	}

	const content = Reflect.get(firstCandidate, "content");
	if (!content || typeof content !== "object") {
		return "";
	}

	const parts = Reflect.get(content, "parts");
	if (!Array.isArray(parts)) {
		return "";
	}

	const textParts = parts
		.map((part) => {
			if (!part || typeof part !== "object") {
				return "";
			}

			const textValue = Reflect.get(part, "text");
			return typeof textValue === "string" ? textValue : "";
		})
		.filter(Boolean);

	return textParts.join("\n").trim();
}

function buildGeminiParts(message: ProviderRequest["messages"][number]): Array<
	| { text: string }
	| { inlineData: { mimeType: string; data: string } }
> {
	const parts: Array<
		| { text: string }
		| { inlineData: { mimeType: string; data: string } }
	> = [
		{
			text: message.content,
		},
	];

	for (const attachment of message.imageAttachments ?? []) {
		const imageData = parseDataUrl(attachment.dataUrl);
		parts.push({
			inlineData: {
				mimeType: imageData.mimeType,
				data: imageData.base64,
			},
		});
	}
	return parts;
}

export class GeminiProvider implements ChatProvider {
	async *stream(request: ProviderRequest): AsyncGenerator<string> {
		let emittedAnyText = false;
		for await (const eventText of streamSseEvents(
			joinUrl(request.baseUrl, `/v1beta/models/${request.model}:streamGenerateContent?alt=sse`),
			{
				headers: {
					"x-goog-api-key": request.apiKey,
					"Content-Type": "application/json",
				},
				signal: request.signal,
				body: JSON.stringify({
					systemInstruction: request.systemPrompt.trim()
						? {
								parts: [
									{
										text: request.systemPrompt.trim(),
									},
								],
						  }
						: undefined,
					contents: request.messages.map((message) => ({
						role: message.role === "assistant" ? "model" : "user",
						parts: buildGeminiParts(message),
					})),
				}),
			},
		)) {
			const payloadText = readSseData(eventText);
			if (!payloadText) {
				continue;
			}

			const deltaText = extractGeminiText(safeJsonParse(payloadText));
			if (!deltaText) {
				continue;
			}

			emittedAnyText = true;
			yield deltaText;
		}

		if (!emittedAnyText) {
			throw new Error("Gemini 流式响应里没有可用文本。");
		}
	}
}
