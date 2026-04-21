import { Modal, Notice } from "obsidian";
import type { App } from "obsidian";

import {
	applyGeneratedContentToActiveNote,
	buildCompactDiffPreview,
	getActiveNoteContentForReview,
	getDefaultNoteApplyMode,
	getNoteApplyModeLabel,
	getOriginalContentForApplyMode,
	type NoteApplyMode,
	normalizeGeneratedMarkdownDocument,
} from "../../services/document-service";

export class MarkdownReviewModal extends Modal {
	private originalContent = "";
	private draftContent = "";
	private targetPath = "";
	private targetSelection = "";
	private hasSelection = false;
	private applyMode: NoteApplyMode = "replace-note";
	private originalTextareaEl: HTMLTextAreaElement | null = null;
	private draftTextareaEl: HTMLTextAreaElement | null = null;
	private diffPreviewEl: HTMLPreElement | null = null;
	private applyButtonEl: HTMLButtonElement | null = null;

	constructor(
		app: App,
		private readonly generatedContent: string,
		private readonly onApplied?: () => void,
	) {
		super(app);
	}

	async onOpen(): Promise<void> {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		titleEl.setText("审阅后应用到当前笔记");

		const noteSnapshot = await getActiveNoteContentForReview(this.app);
		this.originalContent = noteSnapshot.content;
		this.targetPath = noteSnapshot.path;
		this.targetSelection = noteSnapshot.selection;
		this.hasSelection = noteSnapshot.hasSelection;
		this.applyMode = getDefaultNoteApplyMode(this.hasSelection);
		this.draftContent = normalizeGeneratedMarkdownDocument(this.generatedContent);

		const introEl = contentEl.createDiv({ cls: "obchat-review__intro" });
		introEl.setText(`目标笔记：${this.targetPath}`);

		const modeBarEl = contentEl.createDiv({ cls: "obchat-review__modebar" });
		modeBarEl.createEl("div", { cls: "obchat-review__label", text: "应用方式" });
		const modeSelectEl = modeBarEl.createEl("select", {
			cls: "dropdown obchat-select obchat-review__mode-select",
		});
		modeSelectEl.createEl("option", { value: "replace-note", text: getNoteApplyModeLabel("replace-note") });
		modeSelectEl.createEl("option", { value: "replace-selection", text: getNoteApplyModeLabel("replace-selection") });
		modeSelectEl.createEl("option", { value: "insert-cursor", text: getNoteApplyModeLabel("insert-cursor") });
		modeSelectEl.createEl("option", { value: "append-note", text: getNoteApplyModeLabel("append-note") });
		if (!this.hasSelection) {
			const replaceSelectionOptionEl = modeSelectEl.querySelector("option[value='replace-selection']");
			if (replaceSelectionOptionEl instanceof HTMLOptionElement) {
				replaceSelectionOptionEl.disabled = true;
			}
		}
		modeSelectEl.value = this.applyMode;
		modeSelectEl.addEventListener("change", () => {
			this.applyMode = modeSelectEl.value as NoteApplyMode;
			this.refreshReviewPreview();
		});

		const columnsEl = contentEl.createDiv({ cls: "obchat-review" });

		const originalPaneEl = columnsEl.createDiv({ cls: "obchat-review__pane" });
		originalPaneEl.createEl("div", { cls: "obchat-review__label", text: "当前目标内容" });
		this.originalTextareaEl = originalPaneEl.createEl("textarea", {
			cls: "obchat-review__textarea",
		});
		this.originalTextareaEl.readOnly = true;

		const draftPaneEl = columnsEl.createDiv({ cls: "obchat-review__pane" });
		draftPaneEl.createEl("div", { cls: "obchat-review__label", text: "准备应用的内容" });
		this.draftTextareaEl = draftPaneEl.createEl("textarea", {
			cls: "obchat-review__textarea",
		});
		this.draftTextareaEl.value = this.draftContent;
		this.draftTextareaEl.addEventListener("input", () => {
			this.draftContent = this.draftTextareaEl?.value ?? "";
			this.refreshReviewPreview();
		});

		const diffSectionEl = contentEl.createDiv({ cls: "obchat-review__diff" });
		diffSectionEl.createEl("div", { cls: "obchat-review__label", text: "变更预览" });
		this.diffPreviewEl = diffSectionEl.createEl("pre", {
			cls: "obchat-review__diff-preview",
		});

		const actionsEl = contentEl.createDiv({ cls: "obchat-review__actions" });
		const cancelButtonEl = actionsEl.createEl("button", {
			text: "取消",
			cls: "obchat-button obchat-button--ghost",
			attr: {
				type: "button",
			},
		});
		cancelButtonEl.addEventListener("click", () => {
			this.close();
		});

		this.applyButtonEl = actionsEl.createEl("button", {
			text: "应用",
			cls: "mod-cta obchat-button",
			attr: {
				type: "button",
			},
		});
		this.applyButtonEl.addEventListener("click", async () => {
			try {
				const filePath = await applyGeneratedContentToActiveNote(this.app, this.draftContent, this.applyMode);
				new Notice(`已更新笔记：${filePath}`);
				this.onApplied?.();
				this.close();
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`应用失败：${message}`);
			}
		});

		this.refreshReviewPreview();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private refreshReviewPreview(): void {
		const originalTargetContent = getOriginalContentForApplyMode(
			{
				content: this.originalContent,
				selection: this.targetSelection,
			},
			this.applyMode,
		);

		if (this.originalTextareaEl) {
			this.originalTextareaEl.value = originalTargetContent;
		}

		if (this.diffPreviewEl) {
			this.diffPreviewEl.textContent = buildCompactDiffPreview(originalTargetContent, this.draftContent);
		}

		if (this.applyButtonEl) {
			this.applyButtonEl.textContent = `应用：${getNoteApplyModeLabel(this.applyMode)}`;
		}
	}
}
