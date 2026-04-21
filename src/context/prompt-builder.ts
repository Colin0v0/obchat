import type { ContextSnapshot } from "../types";

export function buildPromptContent(userInput: string, contextSnapshot: ContextSnapshot | null): string {
	const normalizedUserInput = userInput.trim();
	if (!normalizedUserInput) {
		throw new Error("消息内容不能为空。");
	}

	if (!contextSnapshot) {
		return normalizedUserInput;
	}

	// 这里把 Obsidian 上下文显式包起来，避免模型把上下文和用户问题混在一起理解。
	return [
		"请基于下面这段来自 Obsidian 的上下文回答用户问题。",
		"",
		`【上下文来源】${contextSnapshot.label}`,
		"",
		"【上下文开始】",
		contextSnapshot.content,
		"【上下文结束】",
		"",
		"【用户问题】",
		normalizedUserInput,
	].join("\n");
}
