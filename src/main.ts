import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";

import { DEFAULT_CHAT_STATE, DEFAULT_SETTINGS } from "./constants/defaults";
import { OBCHAT_VIEW_TYPE } from "./constants/ui";
import { ObchatChatService } from "./services/chat-service";
import {
	buildSessionTitleFromMessages,
	createChatSession,
	getActiveChatSession,
	migrateLegacyChatState,
	normalizeChatState,
} from "./stores/chat-session-store";
import { ensureActiveProfileId, migrateLegacySettings, normalizeProfiles } from "./stores/profile-store";
import { ObchatChatView } from "./views/chat/chat-view";
import { ProviderConfigModal } from "./views/modals/provider-config-modal";
import { ObchatSettingTab } from "./views/settings/settings-tab";
import type {
	LegacyObchatSettings,
	ObchatContextMode,
	ObchatProfile,
	ConversationMessage,
	ObchatSettings,
	PersistedChatState,
	PersistedPluginData,
} from "./types";

function isPersistedPluginData(data: unknown): data is Partial<PersistedPluginData> {
	return Boolean(data) && typeof data === "object" && data !== null && ("settings" in data || "chatState" in data);
}

export default class ObchatPlugin extends Plugin {
	settings: ObchatSettings = DEFAULT_SETTINGS;
	chatState: PersistedChatState = DEFAULT_CHAT_STATE;
	chatService!: ObchatChatService;
	private persistTimer: number | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.chatService = new ObchatChatService();

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
			const rawSettings = Object.assign({}, DEFAULT_SETTINGS, data.settings ?? {});
			const profiles = normalizeProfiles(rawSettings.profiles);
			this.settings = {
				...rawSettings,
				profiles,
				activeProfileId: ensureActiveProfileId({
					activeProfileId: rawSettings.activeProfileId,
					profiles,
				}),
			};
			const rawChatState = data.chatState as Partial<PersistedChatState> & {
				messages?: ConversationMessage[];
				draft?: string;
				contextMode?: ObchatContextMode;
			};
			this.chatState = Array.isArray(rawChatState?.sessions)
				? normalizeChatState(rawChatState)
				: migrateLegacyChatState(rawChatState);
			return;
		}

		const legacySettings = (data as LegacyObchatSettings | null) ?? {};
		this.settings = migrateLegacySettings(legacySettings);
		this.chatState = normalizeChatState(DEFAULT_CHAT_STATE);
	}

	async saveSettings(): Promise<void> {
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	getActiveProfile(): ObchatProfile {
		const activeProfile = this.settings.profiles.find((profile) => profile.id === this.settings.activeProfileId);
		if (activeProfile) {
			return activeProfile;
		}

		const normalizedProfiles = normalizeProfiles(this.settings.profiles);
		const firstProfile = normalizedProfiles[0];
		if (!firstProfile) {
			throw new Error("至少需要一个可用配置。");
		}

		this.settings.profiles = normalizedProfiles;
		this.settings.activeProfileId = firstProfile.id;
		return firstProfile;
	}

	async setActiveProfile(profileId: string): Promise<void> {
		const matchedProfile = this.settings.profiles.find((profile) => profile.id === profileId);
		if (!matchedProfile) {
			throw new Error("找不到要切换的配置。");
		}

		this.settings.activeProfileId = matchedProfile.id;
		await this.saveSettings();
	}

	async updateProfile(profileId: string, updater: (profile: ObchatProfile) => void): Promise<void> {
		const matchedProfile = this.settings.profiles.find((profile) => profile.id === profileId);
		if (!matchedProfile) {
			throw new Error("找不到要更新的配置。");
		}

		updater(matchedProfile);
		await this.saveSettings();
	}

	async addProfile(profile: ObchatProfile, makeActive = false): Promise<void> {
		this.settings.profiles = [...this.settings.profiles, profile];
		if (makeActive || this.settings.profiles.length === 1) {
			this.settings.activeProfileId = profile.id;
		}
		await this.saveSettings();
	}

	async removeProfile(profileId: string): Promise<void> {
		if (this.settings.profiles.length <= 1) {
			throw new Error("至少保留一个供应商配置。");
		}

		const nextProfiles = this.settings.profiles.filter((profile) => profile.id !== profileId);
		if (nextProfiles.length === this.settings.profiles.length) {
			throw new Error("找不到要删除的配置。");
		}

		this.settings.profiles = nextProfiles;
		this.settings.activeProfileId = ensureActiveProfileId({
			activeProfileId: this.settings.activeProfileId === profileId ? "" : this.settings.activeProfileId,
			profiles: nextProfiles,
		});
		await this.saveSettings();
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

	openProviderConfigModal(profileId?: string, onSaved?: () => void): void {
		const targetProfile = profileId
			? this.settings.profiles.find((profile) => profile.id === profileId)
			: undefined;

		if (profileId && !targetProfile) {
			new Notice("找不到要配置的供应商。");
			return;
		}

		new ProviderConfigModal(this.app, this, targetProfile, onSaved).open();
	}

	getActiveChatSession() {
		return getActiveChatSession(this.chatState);
	}

	async setActiveChatSession(sessionId: string): Promise<void> {
		const targetSession = this.chatState.sessions.find((session) => session.id === sessionId);
		if (!targetSession) {
			throw new Error("找不到要切换的会话。");
		}

		this.chatState.activeSessionId = targetSession.id;
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	async createChatSession(makeActive = true): Promise<void> {
		const session = createChatSession();
		this.chatState.sessions = [session, ...this.chatState.sessions];
		if (makeActive) {
			this.chatState.activeSessionId = session.id;
		}
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	async renameChatSession(sessionId: string, title: string): Promise<void> {
		const targetSession = this.chatState.sessions.find((session) => session.id === sessionId);
		if (!targetSession) {
			throw new Error("找不到要重命名的会话。");
		}

		targetSession.title = title.trim() || targetSession.title;
		targetSession.updatedAt = Date.now();
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	async removeChatSession(sessionId: string): Promise<void> {
		if (this.chatState.sessions.length <= 1) {
			throw new Error("至少保留一个会话。");
		}

		const nextSessions = this.chatState.sessions.filter((session) => session.id !== sessionId);
		if (nextSessions.length === this.chatState.sessions.length) {
			throw new Error("找不到要删除的会话。");
		}

		this.chatState.sessions = nextSessions;
		this.chatState.activeSessionId = this.chatState.activeSessionId === sessionId
			? nextSessions[0]!.id
			: this.chatState.activeSessionId;
		await this.persistPluginData();
		this.refreshOpenChatViews();
	}

	updateChatState(
		partialState: Partial<{
			messages: ConversationMessage[];
			draft: string;
			contextMode: ObchatContextMode;
		}>,
	): void {
		const activeSession = this.getActiveChatSession();
		activeSession.messages = partialState.messages
			? partialState.messages.map((message) => ({ ...message }))
			: activeSession.messages;
		activeSession.draft = partialState.draft ?? activeSession.draft;
		activeSession.contextMode = partialState.contextMode ?? activeSession.contextMode;
		activeSession.updatedAt = Date.now();
		if (
			activeSession.messages.some((message) => message.role === "user")
			&& (activeSession.title === "新会话" || activeSession.title === "当前会话")
		) {
			activeSession.title = buildSessionTitleFromMessages(activeSession.messages);
		}
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
