import { MarkdownRenderer, Notice, type App, type Component } from "obsidian";
import type { IconName } from "obsidian";

import { getPreferredMarkdownSourcePath } from "../../utils/obsidian-view";
import type { ConversationMessage } from "../../types";

interface RenderMessageListOptions {
	app: App;
	component: Component;
	messagesEl: HTMLElement | null;
	messages: ConversationMessage[];
	isSending: boolean;
	createIconActionButton: (
		parentEl: HTMLElement,
		icon: IconName,
		label: string,
		onClick: () => void | Promise<void>,
	) => HTMLButtonElement;
	onInsertMessage: (content: string) => void | Promise<void>;
	onReviewMessage: (content: string) => void | Promise<void>;
	onRendered?: () => void;
}

async function renderMessageBody(
	app: App,
	component: Component,
	bodyEl: HTMLElement,
	message: ConversationMessage,
): Promise<void> {
	if (message.isStreaming) {
		bodyEl.addClass("obchat-message__body--streaming");
	}

	if (message.content.length === 0) {
		bodyEl.setText("正在生成回复...");
		return;
	}

	// 流式阶段也统一走 MarkdownRenderer，这样标题、列表、代码块会随着输出逐步成型。
	// 这里继续传入当前笔记路径，保证 wiki link 和 Obsidian 原生预览尽量一致。
	await MarkdownRenderer.renderMarkdown(
		message.content,
		bodyEl,
		getPreferredMarkdownSourcePath(app),
		component,
	);
}

export async function renderMessageList(options: RenderMessageListOptions): Promise<void> {
	if (!options.messagesEl) {
		return;
	}

	options.messagesEl.empty();
	const hasMessages = options.messages.length > 0 || options.isSending;
	if (!hasMessages) {
		const emptyStateEl = options.messagesEl.createDiv({ cls: "obchat-empty" });
		emptyStateEl.setText("开始对话");
		options.onRendered?.();
		return;
	}

	for (const message of options.messages) {
		const itemEl = options.messagesEl.createDiv({
			cls: `obchat-message obchat-message--${message.role}`,
		});
		if (message.isError) {
			itemEl.addClass("obchat-message--error");
		}

		const bodyEl = itemEl.createDiv({
			cls: `obchat-message__body obchat-markdown markdown-rendered obchat-message__body--${message.role}`,
		});
		await renderMessageBody(options.app, options.component, bodyEl, message);

		const shouldRenderAssistantActions = message.role === "assistant" && !message.isError;
		if (shouldRenderAssistantActions) {
			const actionsEl = itemEl.createDiv({ cls: "obchat-message__actions" });
			const insertButtonEl = options.createIconActionButton(actionsEl, "arrow-down-to-line", "插入到当前笔记", () => {
				return options.onInsertMessage(message.content);
			});
			insertButtonEl.addClass("obchat-icon-button--message");

			const reviewButtonEl = options.createIconActionButton(actionsEl, "file-pen-line", "审阅并应用到笔记", () => {
				return options.onReviewMessage(message.content);
			});
			reviewButtonEl.addClass("obchat-icon-button--message");

			const copyButtonEl = options.createIconActionButton(actionsEl, "copy", "复制回答内容", async () => {
				try {
					await navigator.clipboard.writeText(message.content);
					new Notice("Obchat 已复制回答。");
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					new Notice(`复制失败：${errorMessage}`);
				}
			});
			copyButtonEl.addClass("obchat-icon-button--message");
		}
	}

	options.messagesEl.scrollTop = options.messagesEl.scrollHeight;
	options.onRendered?.();
}
