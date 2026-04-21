import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";

type RequestHeaders = Record<string, string>;
const REQUEST_ABORT_MESSAGE = "请求已取消。";
type DestroyableReadableStream = NodeJS.ReadableStream & {
	destroy(error?: Error): void;
};

function pickRequestFunction(protocol: string) {
	if (protocol === "http:") {
		return httpRequest;
	}

	if (protocol === "https:") {
		return httpsRequest;
	}

	throw new Error(`不支持的协议：${protocol}`);
}

function normalizeErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	return String(error);
}

function decodeText(buffer: Buffer): string {
	return new TextDecoder("utf-8").decode(buffer);
}

// 统一按 SSE event 粒度切块，给各 provider 自己做事件解码。
export async function* streamSseEvents(
	url: string,
	{
		method = "POST",
		headers,
		body,
		signal,
	}: {
		method?: string;
		headers: RequestHeaders;
		body: string;
		signal?: AbortSignal;
	},
): AsyncGenerator<string> {
	const targetUrl = new URL(url);
	const requestFn = pickRequestFunction(targetUrl.protocol);
	let responseStream: DestroyableReadableStream | null = null;
	let wasAborted = false;

	const response = await new Promise<{
		statusCode: number;
		statusMessage: string;
		headers: Record<string, string | string[] | undefined>;
		stream: NodeJS.ReadableStream;
	}>((resolve, reject) => {
		const abortWithCleanup = () => {
			wasAborted = true;
			req.destroy(new Error(REQUEST_ABORT_MESSAGE));
			responseStream?.destroy(new Error(REQUEST_ABORT_MESSAGE));
			reject(new Error(REQUEST_ABORT_MESSAGE));
		};

		const req = requestFn(
			targetUrl,
			{
				method,
				headers,
			},
			(res) => {
				responseStream = res as DestroyableReadableStream;
				resolve({
					statusCode: res.statusCode ?? 0,
					statusMessage: res.statusMessage ?? "",
					headers: res.headers,
					stream: res,
				});
			},
		);

		req.on("error", reject);
		if (signal) {
			if (signal.aborted) {
				abortWithCleanup();
				return;
			}

			signal.addEventListener("abort", abortWithCleanup, { once: true });
			req.on("close", () => {
				signal.removeEventListener("abort", abortWithCleanup);
			});
		}
		req.write(body);
		req.end();
	});

	if (response.statusCode < 200 || response.statusCode >= 300) {
		const chunks: Buffer[] = [];
		for await (const chunk of response.stream) {
			chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
		}
		const errorBody = decodeText(Buffer.concat(chunks)).trim();
		const statusText = response.statusMessage.trim();
		throw new Error(
			errorBody || statusText
				? `请求失败，状态码：${response.statusCode}，响应：${errorBody || statusText}`
				: `请求失败，状态码：${response.statusCode}`,
		);
	}

	let bufferedText = "";
	try {
		for await (const chunk of response.stream) {
			bufferedText += typeof chunk === "string" ? chunk : decodeText(Buffer.from(chunk));

			let separatorIndex = bufferedText.indexOf("\n\n");
			while (separatorIndex >= 0) {
				const eventText = bufferedText.slice(0, separatorIndex).trim();
				bufferedText = bufferedText.slice(separatorIndex + 2);
				if (eventText) {
					yield eventText;
				}
				separatorIndex = bufferedText.indexOf("\n\n");
			}
		}

		const trailingText = bufferedText.trim();
		if (trailingText) {
			yield trailingText;
		}
	} catch (error) {
		if (wasAborted || (error instanceof Error && error.message === REQUEST_ABORT_MESSAGE)) {
			throw new Error(REQUEST_ABORT_MESSAGE);
		}
		throw new Error(`流式请求中断：${normalizeErrorMessage(error)}`);
	}
}

export function readSseData(eventText: string): string {
	const dataLines = eventText
		.split("\n")
		.map((line) => line.trimEnd())
		.filter((line) => line.startsWith("data:"))
		.map((line) => line.slice(5).trimStart());

	return dataLines.join("\n").trim();
}

export async function requestJson(
	url: string,
	{
		method = "GET",
		headers,
		body,
	}: {
		method?: string;
		headers: RequestHeaders;
		body?: string;
	},
): Promise<unknown> {
	const targetUrl = new URL(url);
	const requestFn = pickRequestFunction(targetUrl.protocol);

	const response = await new Promise<{
		statusCode: number;
		statusMessage: string;
		stream: NodeJS.ReadableStream;
	}>((resolve, reject) => {
		const req = requestFn(
			targetUrl,
			{
				method,
				headers,
			},
			(res) => {
				resolve({
					statusCode: res.statusCode ?? 0,
					statusMessage: res.statusMessage ?? "",
					stream: res,
				});
			},
		);

		req.on("error", reject);
		if (body) {
			req.write(body);
		}
		req.end();
	});

	const chunks: Buffer[] = [];
	for await (const chunk of response.stream) {
		chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk));
	}

	const responseText = decodeText(Buffer.concat(chunks)).trim();
	if (response.statusCode < 200 || response.statusCode >= 300) {
		const statusText = response.statusMessage.trim();
		throw new Error(
			responseText || statusText
				? `请求失败，状态码：${response.statusCode}，响应：${responseText || statusText}`
				: `请求失败，状态码：${response.statusCode}`,
		);
	}

	if (!responseText) {
		throw new Error("上游返回了空响应。");
	}

	try {
		return JSON.parse(responseText) as unknown;
	} catch (error) {
		throw new Error(`无法解析上游响应：${normalizeErrorMessage(error)}`);
	}
}
