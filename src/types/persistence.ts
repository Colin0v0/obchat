import type { ConversationMessage } from "./chat";
import type { ObchatContextMode, ObchatSettings } from "./profile";

export interface PersistedChatSession {
	id: string;
	title: string;
	messages: ConversationMessage[];
	draft: string;
	contextMode: ObchatContextMode;
	updatedAt: number;
}

export interface PersistedChatState {
	activeSessionId: string;
	sessions: PersistedChatSession[];
}

export interface PersistedPluginData {
	settings: ObchatSettings;
	chatState: PersistedChatState;
}
