import type { ObchatSettings, PersistedChatState } from "../types";
import { createChatSession } from "../stores/chat-session-store";

export const DEFAULT_SYSTEM_PROMPT = "你是一个简洁、可靠的 Obsidian 写作助手。请直接回答，不要编造信息。";

export const DEFAULT_SETTINGS: ObchatSettings = {
	activeProfileId: "",
	profiles: [],
	defaultContextMode: "current-note",
	defaultInsertMode: "cursor",
};

const DEFAULT_CHAT_SESSION = createChatSession();

export const DEFAULT_CHAT_STATE: PersistedChatState = {
	activeSessionId: DEFAULT_CHAT_SESSION.id,
	sessions: [DEFAULT_CHAT_SESSION],
};
