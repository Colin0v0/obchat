import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import { ObchatChatService } from "./chat-service";
import { ObchatChatView, OBCHAT_VIEW_TYPE } from "./chat-view";
import { DEFAULT_CHAT_STATE } from "./defaults";
import { ObchatSecretStore } from "./secret-store";
import { DEFAULT_SETTINGS, ObchatSettingTab } from "./settings";
import type { ObchatContextMode, ConversationMessage, ObchatSettings, PersistedChatState, PersistedPluginData } from "./types";

function isPersistedPluginData(data: unknown): data is Partial<PersistedPluginData> {
	return Boolean(data) && typeof data === "object" && data !== null && ("settings" in data || "chatState" in data);
}

export default class ObchatPlugin extends Plugin {
	settings: ObchatSettings = DEFAULT_SETTINGS;
	chatState: PersistedChatState = DEFAULT_CHAT_STATE;
	secretStore!: ObchatSecretStore;
	chatService!: ObchatChatService;
	private persistTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.secretStore = new ObchatSecretStore(this.app);
		this.chatService = new ObchatChatService(this.secretStore);

		this.registerView(
			OBCHAT_VIEW_TYPE,
			(leaf: WorkspaceLeaf) => new ObchatChatView(leaf, this),
		);

		this.addRibbonIcon("message-square", "打开 Obchat", () => {
			void this.activateChatView();
		});

		this.addCommand({
			id: "open-obchat-sidebar",
			name: "打开 Obchat 侧边栏",
			callback: () => {
				void this.activateChatView();
			},
		});

		this.addCommand({
			id: "clear-obchat-conversation",
			name: "清空 Obchat 当前对话",
			callback: () => {
				this.clearOpenChatViews();
			},
		});

		this.addSettingTab(new ObchatSettingTab(this.app, this));
	}

	async onunload(): Promise<void> {
		await this.persistPluginData();
		const leaves = this.app.workspace.getLeavesOfType(OBCHAT_VIEW_TYPE);
		for (const leaf of leaves) {
			await leaf.detach();
		}
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as unknown;
		if (isPersistedPluginData(data)) {
			this.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? {});
			this.chatState = Object.assign({}, DEFAULT_CHAT_STATE, data.chatState ?? {});
			return;
		}

		const legacySettings = (data as Partial<ObchatSettings> | null) ?? {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, legacySettings);
		this.chatState = Object.assign({}, DEFAULT_CHAT_STATE);
	}

	async saveSettings(): Promise<void> {
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	async activateChatView(): Promise<void> {
		const existingLeaf = this.app.workspace.getLeavesOfType(OBCHAT_VIEW_TYPE)[0];
		if (existingLeaf) {
			await this.app.workspace.revealLeaf(existingLeaf);
			return;
		}

		const rightLeaf = this.app.workspace.getRightLeaf(false);
		const targetLeaf = rightLeaf ?? this.app.workspace.getLeaf("split", "vertical");
		await targetLeaf.setViewState({
			type: OBCHAT_VIEW_TYPE,
			active: true,
		});
		await this.app.workspace.revealLeaf(targetLeaf);
	}

	async openPluginSettings(): Promise<void> {
		const settingManager = (
			this.app as typeof this.app & {
				setting?: {
					open(): void;
					openTabById(id: string): void;
				};
			}
		).setting;

		if (!settingManager) {
			new Notice("当前环境无法直接打开设置页。");
			return;
		}

		settingManager.open();
		settingManager.openTabById(this.manifest.id);
	}

	updateChatState(
		partialState: Partial<{
			messages: ConversationMessage[];
			draft: string;
			contextMode: ObchatContextMode;
		}>,
	): void {
		this.chatState = {
			...this.chatState,
			...partialState,
		};
		this.schedulePersistPluginData();
	}

	private refreshOpenChatViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(OBCHAT_VIEW_TYPE);
		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ObchatChatView) {
				view.refreshFromSettings();
			}
		}
	}

	private clearOpenChatViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(OBCHAT_VIEW_TYPE);
		if (leaves.length === 0) {
			new Notice("当前还没有打开 Obchat 侧边栏。");
			return;
		}

		for (const leaf of leaves) {
			const view = leaf.view;
			if (view instanceof ObchatChatView) {
				view.clearConversation();
			}
		}

		new Notice("Obchat 当前对话已清空。");
	}

	private schedulePersistPluginData(): void {
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
		}

		// 用轻量节流减少流式输出过程中频繁写盘。
		this.persistTimer = window.setTimeout(() => {
			void this.persistPluginData();
		}, 300);
	}

	private async persistPluginData(): Promise<void> {
		if (this.persistTimer !== null) {
			window.clearTimeout(this.persistTimer);
			this.persistTimer = null;
		}

		const payload: PersistedPluginData = {
			settings: this.settings,
			chatState: this.chatState,
		};
		await this.saveData(payload);
	}
}
