import { ItemView, MarkdownRenderer, Notice } from "obsidian";
import type { WorkspaceLeaf } from "obsidian";

import { buildContextSnapshot, buildPromptContent, insertContentIntoActiveNote } from "./context";
import type ObchatPlugin from "./main";
import type { ConversationMessage, ObchatContextMode } from "./types";

export const OBCHAT_VIEW_TYPE = "obchat-sidebar-view";

function createMessageId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export class ObchatChatView extends ItemView {
	private messages: ConversationMessage[] = [];
	private currentContextMode: ObchatContextMode;
	private isSending = false;
	private draft = "";
	private renderTimer: number | null = null;

	private headerMetaEl: HTMLElement | null = null;
	private contextSelectEl: HTMLSelectElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private textareaEl: HTMLTextAreaElement | null = null;
	private sendButtonEl: HTMLButtonElement | null = null;
	private emptyStateEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: ObchatPlugin) {
		super(leaf);
		this.currentContextMode = plugin.chatState.contextMode;
		this.draft = plugin.chatState.draft;
		this.messages = [...plugin.chatState.messages];
	}

	getViewType(): string {
		return OBCHAT_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Obchat";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		this.buildLayout();
		this.refreshFromSettings();
		this.addAction("settings", "打开 Obchat 设置", () => {
			void this.plugin.openPluginSettings();
		});
	}

	async onClose(): Promise<void> {
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
	}

	refreshFromSettings(): void {
		if (!this.currentContextMode) {
			this.currentContextMode = this.plugin.settings.defaultContextMode;
		}
		if (this.contextSelectEl) {
			this.contextSelectEl.value = this.currentContextMode;
		}
		if (this.textareaEl) {
			this.textareaEl.value = this.draft;
		}
		this.renderHeaderMeta();
		void this.renderMessages();
	}

	clearConversation(): void {
		this.messages = [];
		this.persistViewState();
		void this.renderMessages();
	}

	private buildLayout(): void {
		this.contentEl.empty();
		this.contentEl.addClass("obchat-view");

		const headerEl = this.contentEl.createDiv({ cls: "obchat-header" });
		const titleWrapEl = headerEl.createDiv({ cls: "obchat-header__title-wrap" });
		titleWrapEl.createEl("div", { cls: "obchat-header__title", text: "Obchat" });
		titleWrapEl.createEl("div", {
			cls: "obchat-header__subtitle",
			text: "轻量侧边栏聊天",
		});

		const actionsEl = headerEl.createDiv({ cls: "obchat-header__actions" });
		const clearButtonEl = actionsEl.createEl("button", {
			cls: "mod-muted obchat-button",
			text: "清空",
		});
		clearButtonEl.addEventListener("click", () => {
			this.clearConversation();
		});

		this.headerMetaEl = this.contentEl.createDiv({ cls: "obchat-header-meta" });

		const toolbarEl = this.contentEl.createDiv({ cls: "obchat-toolbar" });
		toolbarEl.createEl("label", {
			cls: "obchat-toolbar__label",
			text: "上下文",
		});

		this.contextSelectEl = toolbarEl.createEl("select", { cls: "dropdown obchat-select" });
		this.contextSelectEl.createEl("option", { value: "none", text: "无上下文" });
		this.contextSelectEl.createEl("option", { value: "selection", text: "当前选中文本" });
		this.contextSelectEl.createEl("option", { value: "current-note", text: "当前笔记全文" });
		this.contextSelectEl.value = this.currentContextMode;
		this.contextSelectEl.addEventListener("change", () => {
			this.currentContextMode = this.contextSelectEl?.value as ObchatContextMode;
			this.persistViewState();
		});

		this.messagesEl = this.contentEl.createDiv({ cls: "obchat-messages" });
		this.emptyStateEl = this.messagesEl.createDiv({ cls: "obchat-empty" });
		this.emptyStateEl.createEl("div", {
			cls: "obchat-empty__title",
			text: "开始一段新的对话",
		});
		this.emptyStateEl.createEl("div", {
			cls: "obchat-empty__desc",
			text: "你可以直接提问，也可以带上当前笔记或选区作为上下文。",
		});

		const composerEl = this.contentEl.createDiv({ cls: "obchat-composer" });
		this.textareaEl = composerEl.createEl("textarea", {
			cls: "obchat-composer__input",
			attr: {
				placeholder: "输入你的问题，Shift+Enter 换行，Enter 发送",
			},
		});
		this.textareaEl.value = this.draft;
		this.textareaEl.addEventListener("input", () => {
			this.draft = this.textareaEl?.value ?? "";
			this.persistViewState();
		});
		this.textareaEl.addEventListener("keydown", (event) => {
			if (event.key !== "Enter" || event.shiftKey) {
				return;
			}

			event.preventDefault();
			void this.handleSend();
		});

		const composerActionsEl = composerEl.createDiv({ cls: "obchat-composer__actions" });
		composerActionsEl.createEl("div", {
			cls: "obchat-composer__hint",
			text: "回答完成后可一键插回笔记",
		});
		this.sendButtonEl = composerActionsEl.createEl("button", {
			cls: "mod-cta obchat-button",
			text: "发送",
		});
		this.sendButtonEl.addEventListener("click", () => {
			void this.handleSend();
		});
	}

	private renderHeaderMeta(): void {
		if (!this.headerMetaEl) {
			return;
		}

		this.headerMetaEl.empty();
		const providerEl = this.headerMetaEl.createSpan({ cls: "obchat-chip" });
		providerEl.setText(`Provider：${this.plugin.settings.provider}`);

		const modelText = this.plugin.settings.model.trim() || "未设置模型";
		const modelEl = this.headerMetaEl.createSpan({ cls: "obchat-chip" });
		modelEl.setText(`Model：${modelText}`);
	}

	private async renderMessages(): Promise<void> {
		if (!this.messagesEl) {
			return;
		}

		this.messagesEl.empty();
		const hasMessages = this.messages.length > 0 || this.isSending;
		if (!hasMessages) {
			this.emptyStateEl = this.messagesEl.createDiv({ cls: "obchat-empty" });
			this.emptyStateEl.createEl("div", {
				cls: "obchat-empty__title",
				text: "开始一段新的对话",
			});
			this.emptyStateEl.createEl("div", {
				cls: "obchat-empty__desc",
				text: "你可以直接提问，也可以带上当前笔记或选区作为上下文。",
			});
			return;
		}

		for (const message of this.messages) {
			const itemEl = this.messagesEl.createDiv({
				cls: `obchat-message obchat-message--${message.role}`,
			});
			if (message.isError) {
				itemEl.addClass("obchat-message--error");
			}

			const metaEl = itemEl.createDiv({ cls: "obchat-message__meta" });
			metaEl.createSpan({
				cls: "obchat-message__role",
				text: message.role === "user" ? "你" : "助手",
			});

			if (message.contextLabel) {
				metaEl.createSpan({
					cls: "obchat-message__context",
					text: message.contextLabel,
				});
			}

			const bodyEl = itemEl.createDiv({ cls: "obchat-message__body markdown-rendered" });
			if (message.isStreaming) {
				bodyEl.addClass("obchat-message__body--streaming");
				bodyEl.setText(message.content || "正在生成回复...");
			} else {
				await MarkdownRenderer.renderMarkdown(message.content, bodyEl, "", this);
			}

			if (message.role === "assistant" && !message.isError) {
				const actionsEl = itemEl.createDiv({ cls: "obchat-message__actions" });
				const insertButtonEl = actionsEl.createEl("button", {
					cls: "obchat-button",
					text: "插回笔记",
				});
				insertButtonEl.addEventListener("click", () => {
					void this.insertAssistantMessage(message.content);
				});

				const copyButtonEl = actionsEl.createEl("button", {
					cls: "obchat-button",
					text: "复制",
				});
				copyButtonEl.addEventListener("click", async () => {
					try {
						await navigator.clipboard.writeText(message.content);
						new Notice("Obchat 已复制回答。");
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						new Notice(`复制失败：${errorMessage}`);
					}
				});
			}
		}

		this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
		this.updateComposerState();
	}

	private scheduleRenderMessages(): void {
		if (this.renderTimer !== null) {
			return;
		}

		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			void this.renderMessages();
		}, 60);
	}

	private updateComposerState(): void {
		if (!this.textareaEl || !this.sendButtonEl) {
			return;
		}

		this.textareaEl.disabled = this.isSending;
		this.sendButtonEl.disabled = this.isSending;
		this.sendButtonEl.textContent = this.isSending ? "生成中" : "发送";
	}

	private async handleSend(): Promise<void> {
		if (this.isSending) {
			return;
		}

		const userInput = this.textareaEl?.value.trim() ?? "";
		if (!userInput) {
			new Notice("请输入消息。");
			return;
		}

		try {
			const contextSnapshot = await buildContextSnapshot(this.app, this.currentContextMode);
			const requestContent = buildPromptContent(userInput, contextSnapshot);

			this.messages.push({
				id: createMessageId(),
				role: "user",
				content: userInput,
				requestContent,
				contextLabel: contextSnapshot?.label ?? null,
			});
			this.persistViewState();

			this.draft = "";
			if (this.textareaEl) {
				this.textareaEl.value = "";
			}
			this.persistViewState();

			this.isSending = true;
			await this.renderMessages();

			const assistantMessage: ConversationMessage = {
				id: createMessageId(),
				role: "assistant",
				content: "",
				requestContent: "",
				contextLabel: null,
				isStreaming: true,
			};
			this.messages.push(assistantMessage);
			this.persistViewState();
			await this.renderMessages();

			for await (const chunk of this.plugin.chatService.stream(
				this.plugin.settings,
				this.messages
					.filter((message) => message.role === "user" || message.role === "assistant")
					.filter((message) => !message.isError && message.id !== assistantMessage.id)
					.map((message) => ({
						role: message.role,
						content: message.requestContent,
					})),
			)) {
				assistantMessage.content += chunk;
				this.scheduleRenderMessages();
				this.persistViewState();
			}

			assistantMessage.requestContent = assistantMessage.content;
			assistantMessage.isStreaming = false;
			this.persistViewState();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const lastMessage = this.messages[this.messages.length - 1];
			if (lastMessage && lastMessage.role === "assistant" && lastMessage.isStreaming) {
				lastMessage.content = `请求失败：${errorMessage}`;
				lastMessage.requestContent = lastMessage.content;
				lastMessage.isStreaming = false;
				lastMessage.isError = true;
			} else {
				this.messages.push({
					id: createMessageId(),
					role: "assistant",
					content: `请求失败：${errorMessage}`,
					requestContent: `请求失败：${errorMessage}`,
					contextLabel: null,
					isError: true,
				});
			}
			this.persistViewState();
			new Notice(`Obchat 请求失败：${errorMessage}`);
		} finally {
			this.isSending = false;
			this.persistViewState();
			await this.renderMessages();
			this.textareaEl?.focus();
		}
	}

	private async insertAssistantMessage(content: string): Promise<void> {
		try {
			await insertContentIntoActiveNote(this.app, content, this.plugin.settings.defaultInsertMode);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			new Notice(`插入失败：${errorMessage}`);
		}
	}

	private persistViewState(): void {
		this.plugin.updateChatState({
			messages: this.messages.map((message) => ({ ...message })),
			draft: this.draft,
			contextMode: this.currentContextMode,
		});
	}
}
