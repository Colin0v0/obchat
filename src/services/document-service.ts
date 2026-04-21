import { Notice } from "obsidian";
import type { App } from "obsidian";

import type { ObchatInsertMode } from "../types";
import { getActiveMarkdownView } from "../utils/obsidian-view";

export type NoteApplyMode = "replace-note" | "replace-selection" | "insert-cursor" | "append-note";

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

	if (!markdownView.file) {
		throw new Error("当前笔记还没有对应文件。");
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

export function normalizeGeneratedMarkdownDocument(content: string): string {
	const normalizedContent = content.trim();
	if (!normalizedContent) {
		throw new Error("没有可应用的 Markdown 内容。");
	}

	const fencedMatch = normalizedContent.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/i);
	if (fencedMatch) {
		const markdownBody = fencedMatch[1]?.trim();
		if (!markdownBody) {
			throw new Error("Markdown 代码块里没有可应用的内容。");
		}
		return markdownBody;
	}

	return normalizedContent;
}

export async function replaceActiveNoteContent(app: App, content: string): Promise<string> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有可改写的 Markdown 笔记。");
	}

	const file = markdownView.file;
	if (!file) {
		throw new Error("当前笔记还没有对应文件。");
	}

	const nextContent = normalizeGeneratedMarkdownDocument(content);
	markdownView.editor.setValue(nextContent);
	return file.path;
}

export async function getActiveNoteContentForReview(
	app: App,
): Promise<{
	path: string;
	content: string;
	selection: string;
	hasSelection: boolean;
}> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有可审阅的 Markdown 笔记。");
	}

	const file = markdownView.file;
	if (!file) {
		throw new Error("当前笔记还没有对应文件。");
	}

	return {
		path: file.path,
		content: await app.vault.cachedRead(file),
		selection: markdownView.editor.getSelection(),
		hasSelection: markdownView.editor.getSelection().length > 0,
	};
}

export function getDefaultNoteApplyMode(hasSelection: boolean): NoteApplyMode {
	return hasSelection ? "replace-selection" : "replace-note";
}

export function getNoteApplyModeLabel(mode: NoteApplyMode): string {
	if (mode === "replace-note") {
		return "替换整篇笔记";
	}

	if (mode === "replace-selection") {
		return "替换当前选区";
	}

	if (mode === "insert-cursor") {
		return "插入到光标处";
	}

	return "追加到文末";
}

export function getOriginalContentForApplyMode(
	noteContext: {
		content: string;
		selection: string;
	},
	applyMode: NoteApplyMode,
): string {
	if (applyMode === "replace-note") {
		return noteContext.content;
	}

	if (applyMode === "replace-selection") {
		return noteContext.selection;
	}

	return "";
}

export async function applyGeneratedContentToActiveNote(
	app: App,
	content: string,
	applyMode: NoteApplyMode,
): Promise<string> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView) {
		throw new Error("当前没有可改写的 Markdown 笔记。");
	}

	const file = markdownView.file;
	if (!file) {
		throw new Error("当前笔记还没有对应文件。");
	}

	const normalizedContent = normalizeGeneratedMarkdownDocument(content);
	const editor = markdownView.editor;

	if (applyMode === "replace-note") {
		editor.setValue(normalizedContent);
		return file.path;
	}

	if (applyMode === "replace-selection") {
		if (!editor.getSelection().length) {
			throw new Error("当前没有可替换的选区。");
		}

		editor.replaceSelection(normalizedContent);
		return file.path;
	}

	if (applyMode === "insert-cursor") {
		editor.replaceRange(normalizedContent, editor.getCursor());
		return file.path;
	}

	const existingText = editor.getValue();
	const joiner = existingText.trim().length > 0 ? "\n\n" : "";
	editor.setValue(`${existingText}${joiner}${normalizedContent}`);
	return file.path;
}

export function buildCompactDiffPreview(
	beforeContent: string,
	afterContent: string,
): string {
	const beforeLines = beforeContent.split("\n");
	const afterLines = afterContent.split("\n");

	let prefixLength = 0;
	while (
		prefixLength < beforeLines.length
		&& prefixLength < afterLines.length
		&& beforeLines[prefixLength] === afterLines[prefixLength]
	) {
		prefixLength += 1;
	}

	let suffixLength = 0;
	while (
		suffixLength + prefixLength < beforeLines.length
		&& suffixLength + prefixLength < afterLines.length
		&& beforeLines[beforeLines.length - 1 - suffixLength] === afterLines[afterLines.length - 1 - suffixLength]
	) {
		suffixLength += 1;
	}

	const removedLines = beforeLines.slice(prefixLength, beforeLines.length - suffixLength);
	const addedLines = afterLines.slice(prefixLength, afterLines.length - suffixLength);
	const previewLines: string[] = [];

	const contextHead = beforeLines.slice(Math.max(0, prefixLength - 2), prefixLength);
	for (const line of contextHead) {
		previewLines.push(`  ${line}`);
	}

	if (prefixLength > contextHead.length) {
		previewLines.unshift(`  ... 省略前文 ${prefixLength - contextHead.length} 行`);
	}

	for (const line of removedLines) {
		previewLines.push(`- ${line}`);
	}

	for (const line of addedLines) {
		previewLines.push(`+ ${line}`);
	}

	const contextTail = beforeLines.slice(beforeLines.length - suffixLength, Math.min(beforeLines.length, beforeLines.length - suffixLength + 2));
	for (const line of contextTail) {
		previewLines.push(`  ${line}`);
	}

	if (suffixLength > contextTail.length) {
		previewLines.push(`  ... 省略后文 ${suffixLength - contextTail.length} 行`);
	}

	if (previewLines.length === 0) {
		return "没有差异。";
	}

	return previewLines.join("\n");
}
