import { MarkdownView, Notice } from "obsidian";
import type { App } from "obsidian";

import type { ContextSnapshot, ObchatContextMode, ObchatInsertMode } from "./types";

function getActiveMarkdownView(app: App): MarkdownView | null {
	return app.workspace.getActiveViewOfType(MarkdownView);
}

export async function buildContextSnapshot(
	app: App,
	mode: ObchatContextMode,
): Promise<ContextSnapshot | null> {
	if (mode === "none") {
		return null;
	}

	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有打开的 Markdown 笔记。");
	}

	if (mode === "selection") {
		const selectedText = markdownView.editor.getSelection().trim();
		if (!selectedText) {
			throw new Error("当前没有选中文本。");
		}

		return {
			mode,
			label: "当前选中文本",
			content: selectedText,
		};
	}

	const file = markdownView.file;
	if (!file) {
		throw new Error("当前笔记还没有对应文件。");
	}

	return {
		mode,
		label: `当前笔记：${file.path}`,
		content: markdownView.editor.getValue().trim(),
	};
}

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

export async function insertContentIntoActiveNote(
	app: App,
	content: string,
	insertMode: ObchatInsertMode,
): Promise<void> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有可写入的 Markdown 笔记。");
	}

	const normalizedContent = content.trim();
	if (!normalizedContent) {
		throw new Error("没有可插入的内容。");
	}

	const editor = markdownView.editor;
	if (insertMode === "replace-selection") {
		editor.replaceSelection(normalizedContent);
		new Notice("Obchat 已替换当前选区。");
		return;
	}

	if (insertMode === "cursor") {
		const cursor = editor.getCursor();
		editor.replaceRange(normalizedContent, cursor);
		new Notice("Obchat 已插入到当前光标位置。");
		return;
	}

	const existingText = editor.getValue();
	const joiner = existingText.trim().length > 0 ? "\n\n" : "";
	editor.setValue(`${existingText}${joiner}${normalizedContent}`);
	new Notice("Obchat 已追加到笔记末尾。");
}
