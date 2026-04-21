import type { ChatProvider } from "./base";
import { joinUrl, normalizeTextContent, safeJsonParse } from "./base";
import { readSseData, requestJson, streamSseEvents } from "./streaming-http";
import type { ProviderModelListRequest, ProviderRequest } from "../types";

function buildResponsesInputMessage(message: ProviderRequest["messages"][number]): {
	role: "user" | "assistant";
	content: Array<
		| { type: "input_text" | "output_text"; text: string }
		| { type: "input_image"; image_url: string }
	>;
} {
	// Responses API 对历史 assistant 消息要求使用 output_text，而不是 input_text。
	if (message.role === "assistant") {
		return {
			role: "assistant",
			content: [
				{
					type: "output_text",
					text: message.content,
				},
			],
		};
	}

	const content: Array<
		| { type: "input_text"; text: string }
		| { type: "input_image"; image_url: string }
	> = [
		{
			type: "input_text",
			text: message.content,
		},
	];
	for (const attachment of message.imageAttachments ?? []) {
		content.push({
			type: "input_image",
			image_url: attachment.dataUrl,
		});
	}

	return {
		role: "user",
		content,
	};
}

function buildOpenAiCompatibleMessage(message: ProviderRequest["messages"][number]): {
	role: "user" | "assistant";
	content: string | Array<
		| { type: "text"; text: string }
		| { type: "image_url"; image_url: { url: string } }
	>;
} {
	if (message.role === "assistant" || !message.imageAttachments?.length) {
		return {
			role: message.role,
			content: message.content,
		};
	}

	return {
		role: "user",
		content: [
			{
				type: "text",
				text: message.content,
			},
			...message.imageAttachments.map((attachment) => ({
				type: "image_url" as const,
				image_url: {
					url: attachment.dataUrl,
				},
			})),
		],
	};
}

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

function extractModelIds(payload: unknown): string[] {
	if (!payload || typeof payload !== "object") {
		return [];
	}

	const data = Reflect.get(payload, "data");
	if (!Array.isArray(data)) {
		return [];
	}

	return data
		.map((item) => {
			if (!item || typeof item !== "object") {
				return "";
			}

			const modelId = Reflect.get(item, "id");
			return typeof modelId === "string" ? modelId.trim() : "";
		})
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right));
}

async function listOpenAiCompatibleModels(request: ProviderModelListRequest): Promise<string[]> {
	const payload = await requestJson(joinUrl(request.baseUrl, "/models"), {
		headers: {
			Authorization: `Bearer ${request.apiKey}`,
			"Content-Type": "application/json",
		},
	});

	const modelIds = extractModelIds(payload);
	if (modelIds.length === 0) {
		throw new Error("上游没有返回可用模型列表。");
	}

	return modelIds;
}

export class OpenAICompatibleProvider implements ChatProvider {
	async *stream(request: ProviderRequest): AsyncGenerator<string> {
		const messages: Array<{
			role: "system" | "user" | "assistant";
			content: string | Array<
				| { type: "text"; text: string }
				| { type: "image_url"; image_url: { url: string } }
			>;
		}> = [];
		const systemPrompt = request.systemPrompt.trim();
		if (systemPrompt) {
			messages.push({
				role: "system",
				content: systemPrompt,
			});
		}

		for (const message of request.messages) {
			messages.push(buildOpenAiCompatibleMessage(message));
		}

		let emittedAnyText = false;
		for await (const eventText of streamSseEvents(joinUrl(request.baseUrl, "/chat/completions"), {
			headers: {
				Authorization: `Bearer ${request.apiKey}`,
				"Content-Type": "application/json",
			},
			signal: request.signal,
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

	async listModels(request: ProviderModelListRequest): Promise<string[]> {
		return listOpenAiCompatibleModels(request);
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
			signal: request.signal,
			body: JSON.stringify({
				model: request.model,
				instructions: request.systemPrompt.trim() || undefined,
				stream: true,
				input: request.messages.map(buildResponsesInputMessage),
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

	async listModels(request: ProviderModelListRequest): Promise<string[]> {
		return listOpenAiCompatibleModels(request);
	}
}
