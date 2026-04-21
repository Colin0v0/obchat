import { MarkdownView } from "obsidian";
import type { App } from "obsidian";

export function getActiveMarkdownView(app: App): MarkdownView | null {
	const activeView = app.workspace.getActiveViewOfType(MarkdownView);
	if (activeView) {
		return activeView;
	}

	const mostRecentLeaf = app.workspace.getMostRecentLeaf();
	if (mostRecentLeaf?.view instanceof MarkdownView) {
		return mostRecentLeaf.view;
	}

	const markdownLeaf = app.workspace
		.getLeavesOfType("markdown")
		.find((leaf) => leaf.view instanceof MarkdownView);
	if (markdownLeaf?.view instanceof MarkdownView) {
		return markdownLeaf.view;
	}

	return null;
}

export function getPreferredMarkdownSourcePath(app: App): string {
	const markdownView = getActiveMarkdownView(app);
	return markdownView?.file?.path ?? "";
}
