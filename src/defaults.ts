import type { PersistedChatState } from "./types";

export const DEFAULT_CHAT_STATE: PersistedChatState = {
	messages: [],
	draft: "",
	contextMode: "current-note",
};
