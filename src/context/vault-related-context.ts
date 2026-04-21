import type { App, TFile } from "obsidian";

import type { ContextSnapshot } from "../types";

const MAX_RELATED_NOTES = 4;
const MAX_RELATED_NOTE_CHARS = 3200;

function extractQueryTerms(userInput: string): string[] {
	const normalizedInput = userInput.trim().toLowerCase();
	if (!normalizedInput) {
		return [];
	}

	const matchedTokens = normalizedInput.match(/[\u4e00-\u9fff]{2,}|[a-z0-9_-]{2,}/g) ?? [];
	const terms = new Set<string>();

	for (const token of matchedTokens) {
		terms.add(token);

		// 中文问题通常没有空格，这里额外拆成双字片段，提升全库检索命中率。
		if (/^[\u4e00-\u9fff]+$/.test(token) && token.length > 2) {
			for (let index = 0; index < token.length - 1; index += 1) {
				terms.add(token.slice(index, index + 2));
			}
		}
	}

	return Array.from(terms).filter(Boolean);
}

function countOccurrences(content: string, term: string): number {
	if (!term) {
		return 0;
	}

	let matchedCount = 0;
	let startIndex = 0;
	while (startIndex < content.length) {
		const nextIndex = content.indexOf(term, startIndex);
		if (nextIndex === -1) {
			break;
		}

		matchedCount += 1;
		startIndex = nextIndex + term.length;
	}

	return matchedCount;
}

async function scoreMarkdownFile(
	app: App,
	file: TFile,
	queryTerms: string[],
): Promise<{
	file: TFile;
	noteContent: string;
	score: number;
}> {
	const noteContent = (await app.vault.cachedRead(file)).trim();
	const normalizedPath = file.path.toLowerCase();
	const normalizedBasename = file.basename.toLowerCase();
	const normalizedContent = noteContent.toLowerCase();

	let score = 0;
	for (const term of queryTerms) {
		score += countOccurrences(normalizedBasename, term) * 8;
		score += countOccurrences(normalizedPath, term) * 5;
		score += Math.min(countOccurrences(normalizedContent, term), 8);
	}

	return {
		file,
		noteContent,
		score,
	};
}

export async function buildVaultRelatedContextSnapshot(app: App, userInput: string): Promise<ContextSnapshot> {
	const queryTerms = extractQueryTerms(userInput);
	if (queryTerms.length === 0) {
		throw new Error("请输入更具体的问题，才能从全库里检索相关笔记。");
	}

	const markdownFiles = app.vault.getMarkdownFiles();
	if (markdownFiles.length === 0) {
		throw new Error("当前仓库里没有 Markdown 笔记。");
	}

	const scoredNotes = await Promise.all(markdownFiles.map((file) => scoreMarkdownFile(app, file, queryTerms)));
	const relatedNotes = scoredNotes
		.filter((item) => item.score > 0 && item.noteContent.length > 0)
		.sort((left, right) => right.score - left.score)
		.slice(0, MAX_RELATED_NOTES);

	if (relatedNotes.length === 0) {
		throw new Error("没有在全库里找到和当前问题相关的笔记。");
	}

	const mergedContent = relatedNotes
		.map(({ file, noteContent }) => {
			const clippedContent = noteContent.slice(0, MAX_RELATED_NOTE_CHARS).trim();
			return [`## ${file.path}`, "", clippedContent].join("\n");
		})
		.join("\n\n");

	return {
		mode: "vault-related",
		label: `全库相关笔记（${relatedNotes.length} 篇）`,
		content: mergedContent,
	};
}
