import { ItemView, Notice, setIcon } from "obsidian";
import type { IconName, WorkspaceLeaf } from "obsidian";

import { OBCHAT_VIEW_TYPE, STREAMING_RENDER_THROTTLE_MS } from "../../constants/ui";
import { buildPromptContent } from "../../context/prompt-builder";
import type ObchatPlugin from "../../main";
import { buildContextSnapshot } from "../../services/context-service";
import { insertContentIntoActiveNote } from "../../services/document-service";
import { MarkdownReviewModal } from "../modals/markdown-review-modal";
import { SessionTitleModal } from "../modals/session-title-modal";
import { updateComposerState } from "./composer-state";
import { renderModelOptions, renderProfileOptions } from "./header-controls";
import { renderMessageList } from "./message-list";
import { createMessageId, getProfileLabel } from "./shared";
import type { ConversationMessage, ObchatContextMode, ObchatProfile } from "../../types";

const GENERATION_ABORT_MESSAGE = "请求已取消。";

export class ObchatChatView extends ItemView {
	private messages: ConversationMessage[] = [];
	private currentContextMode: ObchatContextMode;
	private isSending = false;
	private isLoadingModels = false;
	private isComposingWithIme = false;
	private draft = "";
	private renderTimer: number | null = null;
	private currentAbortController: AbortController | null = null;

	private sessionSelectEl: HTMLSelectElement | null = null;
	private profileSelectEl: HTMLSelectElement | null = null;
	private modelSelectEl: HTMLSelectElement | null = null;
	private contextSelectEl: HTMLSelectElement | null = null;
	private messagesEl: HTMLElement | null = null;
	private textareaEl: HTMLTextAreaElement | null = null;
	private regenerateButtonEl: HTMLButtonElement | null = null;
	private sendButtonEl: HTMLButtonElement | null = null;
	private refreshModelsButtonEl: HTMLButtonElement | null = null;
	private emptyStateEl: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: ObchatPlugin) {
		super(leaf);
		const activeSession = plugin.getActiveChatSession();
		this.currentContextMode = activeSession.contextMode;
		this.draft = activeSession.draft;
		this.messages = [...activeSession.messages];
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
		this.currentAbortController?.abort();
		if (this.renderTimer !== null) {
			window.clearTimeout(this.renderTimer);
			this.renderTimer = null;
		}
	}

	refreshFromSettings(): void {
		const activeSession = this.plugin.getActiveChatSession();
		this.messages = [...activeSession.messages];
		this.draft = activeSession.draft;
		this.currentContextMode = activeSession.contextMode;
		if (!this.currentContextMode) {
			this.currentContextMode = this.plugin.settings.defaultContextMode;
		}
		this.renderSessionOptions();
		if (this.contextSelectEl) {
			this.contextSelectEl.value = this.currentContextMode;
		}
		if (this.textareaEl) {
			this.textareaEl.value = this.draft;
		}
		this.renderProfileOptions();
		this.renderModelOptions();
		void this.renderMessages();
	}

	clearConversation(): void {
		this.messages = [];
		this.persistViewState();
		void this.renderMessages();
	}

	private createIconActionButton(
		parentEl: HTMLElement,
		icon: IconName,
		label: string,
		onClick: () => void | Promise<void>,
	): HTMLButtonElement {
		const buttonEl = parentEl.createEl("button", {
			cls: "clickable-icon obchat-icon-button",
			attr: {
				type: "button",
				"aria-label": label,
			},
			title: label,
		});

		// 统一用 Obsidian 内置的 lucide 图标，避免每个按钮都重复写同样的初始化逻辑。
		setIcon(buttonEl, icon);
		buttonEl.addEventListener("click", () => {
			void onClick();
		});
		return buttonEl;
	}

	private buildLayout(): void {
		this.contentEl.empty();
		this.contentEl.addClass("obchat-view");

		const headerEl = this.contentEl.createDiv({ cls: "obchat-header" });
		const headerMainEl = headerEl.createDiv({ cls: "obchat-header__main" });
		headerMainEl.createEl("div", { cls: "obchat-header__title", text: "Obchat" });
		this.sessionSelectEl = headerMainEl.createEl("select", { cls: "dropdown obchat-select obchat-select--session" });
		this.sessionSelectEl.setAttribute("aria-label", "切换会话");
		this.sessionSelectEl.title = "切换会话";
		this.sessionSelectEl.addEventListener("change", () => {
			const nextSessionId = this.sessionSelectEl?.value ?? "";
			if (!nextSessionId) {
				return;
			}

			void this.handleSessionChange(nextSessionId);
		});

		const actionsEl = headerEl.createDiv({ cls: "obchat-header__actions" });
		const createSessionButtonEl = this.createIconActionButton(actionsEl, "plus", "新建会话", () => {
			void this.handleCreateSession();
		});
		createSessionButtonEl.addClass("obchat-icon-button--header");

		const renameSessionButtonEl = this.createIconActionButton(actionsEl, "pencil", "重命名当前会话", () => {
			this.openRenameSessionModal();
		});
		renameSessionButtonEl.addClass("obchat-icon-button--header");

		const clearButtonEl = this.createIconActionButton(actionsEl, "trash-2", "清空当前对话", () => {
			void this.handleDeleteSession();
		});
		clearButtonEl.addClass("obchat-icon-button--header");

		const controlsEl = this.contentEl.createDiv({ cls: "obchat-controls" });

		const profileGroupEl = controlsEl.createDiv({ cls: "obchat-controls__group" });
		this.profileSelectEl = profileGroupEl.createEl("select", { cls: "dropdown obchat-select obchat-select--wide" });
		this.profileSelectEl.setAttribute("aria-label", "切换供应商");
		this.profileSelectEl.title = "切换供应商";
		this.profileSelectEl.addEventListener("change", () => {
			const nextProfileId = this.profileSelectEl?.value ?? "";
			if (!nextProfileId) {
				return;
			}

			void this.handleProfileChange(nextProfileId);
		});

		const modelGroupEl = controlsEl.createDiv({ cls: "obchat-controls__group obchat-controls__group--model" });
		this.modelSelectEl = modelGroupEl.createEl("select", { cls: "dropdown obchat-select obchat-select--wide" });
		this.modelSelectEl.setAttribute("aria-label", "切换模型");
		this.modelSelectEl.title = "切换模型";
		this.modelSelectEl.addEventListener("change", () => {
			const nextModel = this.modelSelectEl?.value ?? "";
			if (!nextModel) {
				return;
			}

			void this.handleModelChange(nextModel);
		});

		const controlsActionsEl = controlsEl.createDiv({ cls: "obchat-controls__actions" });

		this.refreshModelsButtonEl = this.createIconActionButton(controlsActionsEl, "refresh-cw", "刷新模型列表", () => {
			void this.refreshModelsFromProvider();
		});
		this.refreshModelsButtonEl.addClass("obchat-icon-button--inline", "obchat-controls__action");

		const providerSettingsButtonEl = this.createIconActionButton(controlsActionsEl, "settings-2", "配置当前供应商", () => {
			this.plugin.openProviderConfigModal(this.plugin.getActiveProfile().id, () => {
				this.refreshFromSettings();
			});
		});
		providerSettingsButtonEl.addClass("obchat-icon-button--inline", "obchat-controls__action");

		this.messagesEl = this.contentEl.createDiv({ cls: "obchat-messages" });
		this.emptyStateEl = this.messagesEl.createDiv({ cls: "obchat-empty" });
		this.emptyStateEl.setText("开始对话");

		const composerEl = this.contentEl.createDiv({ cls: "obchat-composer" });
		const composerTopbarEl = composerEl.createDiv({ cls: "obchat-composer__topbar" });
		this.contextSelectEl = composerTopbarEl.createEl("select", { cls: "dropdown obchat-select" });
		this.contextSelectEl.createEl("option", { value: "none", text: "无上下文" });
		this.contextSelectEl.createEl("option", { value: "selection", text: "当前选中文本" });
		this.contextSelectEl.createEl("option", { value: "current-note", text: "当前笔记全文" });
		this.contextSelectEl.createEl("option", { value: "vault-related", text: "全库相关笔记" });
		this.contextSelectEl.value = this.currentContextMode;
		this.contextSelectEl.addEventListener("change", () => {
			this.currentContextMode = this.contextSelectEl?.value as ObchatContextMode;
			this.persistViewState();
		});

		const composerActionsEl = composerTopbarEl.createDiv({ cls: "obchat-composer__actions" });
		this.regenerateButtonEl = composerActionsEl.createEl("button", {
			cls: "obchat-button obchat-button--ghost",
			text: "重新生成",
			attr: {
				type: "button",
			},
		});
		this.regenerateButtonEl.addEventListener("click", () => {
			void this.handleRegenerate();
		});

		this.sendButtonEl = composerTopbarEl.createEl("button", {
			cls: "mod-cta obchat-button obchat-button--send",
			text: "发送",
			attr: {
				type: "button",
			},
		});
		this.sendButtonEl.addEventListener("click", () => {
			if (this.isSending) {
				this.stopGeneration();
				return;
			}

			void this.handleSend();
		});

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
		this.textareaEl.addEventListener("compositionstart", () => {
			this.isComposingWithIme = true;
		});
		this.textareaEl.addEventListener("compositionend", () => {
			this.isComposingWithIme = false;
		});
		this.textareaEl.addEventListener("keydown", (event) => {
			if (event.isComposing || this.isComposingWithIme || event.keyCode === 229) {
				return;
			}

			if (event.key !== "Enter" || event.shiftKey) {
				return;
			}

			event.preventDefault();
			void this.handleSend();
		});
	}

	private renderProfileOptions(): void {
		const activeProfile = this.plugin.getActiveProfile();
		renderProfileOptions(this.profileSelectEl, this.plugin.settings.profiles, activeProfile);
	}

	private renderSessionOptions(): void {
		if (!this.sessionSelectEl) {
			return;
		}

		const activeSession = this.plugin.getActiveChatSession();
		this.sessionSelectEl.empty();
		this.plugin.chatState.sessions.forEach((session, index) => {
			this.sessionSelectEl?.createEl("option", {
				value: session.id,
				text: session.title.trim() || `会话 ${index + 1}`,
			});
		});
		this.sessionSelectEl.value = activeSession.id;
	}

	private renderModelOptions(): void {
		const activeProfile = this.plugin.getActiveProfile();
		renderModelOptions(this.modelSelectEl, activeProfile);
	}

	private renderHeaderMeta(): void {
		// 顶部不再重复展示 provider/model 文案，避免和下面的控件值形成双重信息噪音。
	}

	private async renderMessages(): Promise<void> {
		await renderMessageList({
			app: this.app,
			component: this,
			messagesEl: this.messagesEl,
			messages: this.messages,
			isSending: this.isSending,
			createIconActionButton: (parentEl, icon, label, onClick) => this.createIconActionButton(parentEl, icon, label, onClick),
			onInsertMessage: (content) => this.insertAssistantMessage(content),
			onReviewMessage: (content) => {
				new MarkdownReviewModal(this.app, content).open();
			},
			onRendered: () => {
				this.updateComposerState();
			},
		});
	}

	private scheduleRenderMessages(): void {
		if (this.renderTimer !== null) {
			return;
		}

		this.renderTimer = window.setTimeout(() => {
			this.renderTimer = null;
			void this.renderMessages();
		}, STREAMING_RENDER_THROTTLE_MS);
	}

	private updateComposerState(): void {
		updateComposerState(
			{
				textareaEl: this.textareaEl,
				regenerateButtonEl: this.regenerateButtonEl,
				sendButtonEl: this.sendButtonEl,
				profileSelectEl: this.profileSelectEl,
				modelSelectEl: this.modelSelectEl,
				contextSelectEl: this.contextSelectEl,
				refreshModelsButtonEl: this.refreshModelsButtonEl,
			},
			{
				isSending: this.isSending,
				isLoadingModels: this.isLoadingModels,
				canRegenerate: this.canRegenerate(),
			},
		);
	}

	private canRegenerate(): boolean {
		return this.messages.some((message) => message.role === "user");
	}

	private async handleSessionChange(sessionId: string): Promise<void> {
		if (this.isSending) {
			new Notice("请先停止当前生成，再切换会话。");
			this.renderSessionOptions();
			return;
		}

		try {
			await this.plugin.setActiveChatSession(sessionId);
			this.refreshFromSettings();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`切换会话失败：${message}`);
		}
	}

	private async handleCreateSession(): Promise<void> {
		if (this.isSending) {
			new Notice("请先停止当前生成，再新建会话。");
			return;
		}

		await this.plugin.createChatSession(true);
		this.refreshFromSettings();
		this.textareaEl?.focus();
	}

	private openRenameSessionModal(): void {
		const activeSession = this.plugin.getActiveChatSession();
		new SessionTitleModal(this.app, activeSession.title, async (title) => {
			await this.plugin.renameChatSession(activeSession.id, title);
			this.refreshFromSettings();
		}).open();
	}

	private async handleDeleteSession(): Promise<void> {
		if (this.isSending) {
			new Notice("请先停止当前生成，再删除会话。");
			return;
		}

		try {
			const activeSession = this.plugin.getActiveChatSession();
			await this.plugin.removeChatSession(activeSession.id);
			this.refreshFromSettings();
			new Notice("已删除当前会话。");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`删除会话失败：${message}`);
		}
	}

	private stopGeneration(): void {
		if (!this.isSending) {
			return;
		}

		// 通过 AbortController 中断底层 SSE 读取，避免“界面显示停止、网络还在跑”的假停止。
		this.currentAbortController?.abort();
	}

	private async generateAssistantReply(
		activeProfile: ObchatProfile,
		profileName: string,
		modelName: string,
	): Promise<void> {
		const assistantMessage: ConversationMessage = {
			id: createMessageId(),
			role: "assistant",
			content: "",
			requestContent: "",
			contextLabel: null,
			profileId: activeProfile.id,
			profileName,
			provider: activeProfile.provider,
			model: modelName,
			isStreaming: true,
		};
		this.messages.push(assistantMessage);
		this.persistViewState();
		await this.renderMessages();

		const abortController = new AbortController();
		this.currentAbortController = abortController;
		try {
			for await (const chunk of this.plugin.chatService.stream(
				activeProfile,
				this.messages
					.filter((message) => message.role === "user" || message.role === "assistant")
					.filter((message) => !message.isError && message.id !== assistantMessage.id)
					.map((message) => ({
						role: message.role,
						content: message.requestContent,
					})),
				abortController.signal,
			)) {
				assistantMessage.content += chunk;
				this.scheduleRenderMessages();
				this.persistViewState();
			}

			assistantMessage.requestContent = assistantMessage.content;
			assistantMessage.isStreaming = false;
			this.persistViewState();
		} catch (error) {
			if (error instanceof Error && error.message === GENERATION_ABORT_MESSAGE) {
				if (assistantMessage.content.trim()) {
					assistantMessage.requestContent = assistantMessage.content;
					assistantMessage.isStreaming = false;
				} else {
					this.messages = this.messages.filter((message) => message.id !== assistantMessage.id);
				}
				this.persistViewState();
				new Notice("已停止生成。");
				return;
			}

			if (assistantMessage.id !== this.messages[this.messages.length - 1]?.id) {
				throw error;
			}

			const errorMessage = error instanceof Error ? error.message : String(error);
			assistantMessage.content = `请求失败：${errorMessage}`;
			assistantMessage.requestContent = assistantMessage.content;
			assistantMessage.isStreaming = false;
			assistantMessage.isError = true;
			this.persistViewState();
			new Notice(`Obchat 请求失败：${errorMessage}`);
		} finally {
			if (this.currentAbortController === abortController) {
				this.currentAbortController = null;
			}
		}
	}

	private async handleRegenerate(): Promise<void> {
		if (this.isSending) {
			return;
		}

		const lastUserIndex = [...this.messages]
			.map((message, index) => ({ message, index }))
			.reverse()
			.find((item) => item.message.role === "user")?.index;

		if (lastUserIndex === undefined) {
			new Notice("当前还没有可以重新生成的内容。");
			return;
		}

		this.messages = this.messages.slice(0, lastUserIndex + 1);
		this.persistViewState();
		await this.renderMessages();

		const activeProfile = this.plugin.getActiveProfile();
		const profileName = getProfileLabel(activeProfile);
		const modelName = activeProfile.model.trim();
		this.isSending = true;
		try {
			await this.generateAssistantReply(activeProfile, profileName, modelName);
		} finally {
			this.isSending = false;
			this.persistViewState();
			await this.renderMessages();
			this.textareaEl?.focus();
		}
	}

	private async handleProfileChange(profileId: string): Promise<void> {
		try {
			await this.plugin.setActiveProfile(profileId);
			this.renderProfileOptions();
			this.renderModelOptions();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`切换配置失败：${message}`);
		}
	}

	private async handleModelChange(modelId: string): Promise<void> {
		const activeProfile = this.plugin.getActiveProfile();
		try {
			await this.plugin.updateProfile(activeProfile.id, (profile) => {
				profile.model = modelId;
			});
			this.renderModelOptions();
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`切换模型失败：${message}`);
		}
	}

	private async refreshModelsFromProvider(): Promise<void> {
		const activeProfile = this.plugin.getActiveProfile();
		this.isLoadingModels = true;
		this.updateComposerState();
		try {
			const modelIds = await this.plugin.chatService.listModels(activeProfile);
			await this.plugin.updateProfile(activeProfile.id, (profile) => {
				profile.availableModels = modelIds;
				if (!profile.model.trim() && modelIds.length > 0) {
					const firstModel = modelIds[0];
					if (!firstModel) {
						throw new Error("没有获取到可用模型。");
					}

					profile.model = firstModel;
				}
			});
			this.renderModelOptions();
			new Notice(`已刷新 ${modelIds.length} 个模型。`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`刷新模型失败：${message}`);
		} finally {
			this.isLoadingModels = false;
			this.updateComposerState();
		}
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

		const activeProfile = this.plugin.getActiveProfile();
		const profileName = getProfileLabel(activeProfile);
		const modelName = activeProfile.model.trim();

		try {
			const contextSnapshot = await buildContextSnapshot(this.app, this.currentContextMode, userInput);
			const requestContent = buildPromptContent(userInput, contextSnapshot);

			this.messages.push({
				id: createMessageId(),
				role: "user",
				content: userInput,
				requestContent,
				contextLabel: contextSnapshot?.label ?? null,
				profileId: activeProfile.id,
				profileName,
				provider: activeProfile.provider,
				model: modelName,
			});
			this.persistViewState();

			this.draft = "";
			if (this.textareaEl) {
				this.textareaEl.value = "";
			}
			this.persistViewState();

			this.isSending = true;
			await this.generateAssistantReply(activeProfile, profileName, modelName);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
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
