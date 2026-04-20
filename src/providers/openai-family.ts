import type { ChatProvider } from "./base";
import { joinUrl, normalizeTextContent, safeJsonParse } from "./base";
import { readSseData, streamSseEvents } from "./streaming-http";
import type { ProviderRequest } from "../types";

function extractOpenAiDelta(payload: unknown): string {
	if (!payload || typeof payload !== "object") {
		return "";
	}

	const choices = Reflect.get(payload, "choices");
	if (!Array.isArray(choices) || choices.length === 0) {
		return "";
	}

	const firstChoice = choices[0];
	if (!firstChoice || typeof firstChoice !== "object") {
		return "";
	}

	const delta = Reflect.get(firstChoice, "delta");
	if (!delta || typeof delta !== "object") {
		return "";
	}

	return normalizeTextContent(Reflect.get(delta, "content"));
}

function extractResponsesDelta(payload: unknown): string {
	if (!payload || typeof payload !== "object") {
		return "";
	}

	const typeValue = Reflect.get(payload, "type");
	if (typeValue !== "response.output_text.delta") {
		return "";
	}

	const deltaValue = Reflect.get(payload, "delta");
	return typeof deltaValue === "string" ? deltaValue : "";
}

export class OpenAICompatibleProvider implements ChatProvider {
	async *stream(request: ProviderRequest): AsyncGenerator<string> {
		const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
		const systemPrompt = request.systemPrompt.trim();
		if (systemPrompt) {
			messages.push({
				role: "system",
				content: systemPrompt,
			});
		}

		for (const message of request.messages) {
			messages.push({
				role: message.role,
				content: message.content,
			});
		}

		let emittedAnyText = false;
		for await (const eventText of streamSseEvents(joinUrl(request.baseUrl, "/chat/completions"), {
			headers: {
				Authorization: `Bearer ${request.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: request.model,
				messages,
				stream: true,
			}),
		})) {
			const payloadText = readSseData(eventText);
			if (!payloadText || payloadText === "[DONE]") {
				continue;
			}

			const deltaText = extractOpenAiDelta(safeJsonParse(payloadText));
			if (!deltaText) {
				continue;
			}

			emittedAnyText = true;
			yield deltaText;
		}

		if (!emittedAnyText) {
			throw new Error("OpenAI-compatible 流式响应里没有可用文本。");
		}
	}
}

export class CodexProvider implements ChatProvider {
	async *stream(request: ProviderRequest): AsyncGenerator<string> {
		let emittedAnyText = false;
		for await (const eventText of streamSseEvents(joinUrl(request.baseUrl, "/responses"), {
			headers: {
				Authorization: `Bearer ${request.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: request.model,
				instructions: request.systemPrompt.trim() || undefined,
				stream: true,
				input: request.messages.map((message) => ({
					role: message.role,
					content: [
						{
							type: "input_text",
							text: message.content,
						},
					],
				})),
			}),
		})) {
			const payloadText = readSseData(eventText);
			if (!payloadText || payloadText === "[DONE]") {
				continue;
			}

			const deltaText = extractResponsesDelta(safeJsonParse(payloadText));
			if (!deltaText) {
				continue;
			}

			emittedAnyText = true;
			yield deltaText;
		}

		if (!emittedAnyText) {
			throw new Error("Codex 流式响应里没有可用文本。");
		}
	}
}
