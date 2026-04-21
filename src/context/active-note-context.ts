import type { App } from "obsidian";

import type { ContextSnapshot } from "../types";
import { getActiveMarkdownView } from "../utils/obsidian-view";

export async function buildSelectionContextSnapshot(app: App): Promise<ContextSnapshot> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有打开的 Markdown 笔记。");
	}

	const selectedText = markdownView.editor.getSelection().trim();
	if (!selectedText) {
		throw new Error("当前没有选中文本。");
	}

	return {
		mode: "selection",
		label: "当前选中文本",
		content: selectedText,
	};
}

export async function buildCurrentNoteContextSnapshot(app: App): Promise<ContextSnapshot> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有打开的 Markdown 笔记。");
	}

	const file = markdownView.file;
	if (!file) {
		throw new Error("当前笔记还没有对应文件。");
	}

	// 这里直接读文件内容，不依赖编辑器焦点，避免侧边栏获得焦点后误判。
	const noteContent = (await app.vault.cachedRead(file)).trim();
	return {
		mode: "current-note",
		label: `当前笔记：${file.path}`,
		content: noteContent,
	};
}
