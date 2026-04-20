export type ObchatProvider = "codex" | "claude" | "gemini" | "openai-compatible";

export type ObchatContextMode = "none" | "selection" | "current-note";

export type ObchatInsertMode = "cursor" | "append" | "replace-selection";

export interface ObchatSettings {
	provider: ObchatProvider;
	baseUrl: string;
	model: string;
	systemPrompt: string;
	defaultContextMode: ObchatContextMode;
	defaultInsertMode: ObchatInsertMode;
	apiKeySecretName: string;
}

export interface ContextSnapshot {
	mode: Exclude<ObchatContextMode, "none">;
	label: string;
	content: string;
}

export interface ConversationMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	requestContent: string;
	contextLabel: string | null;
	isError?: boolean;
	isStreaming?: boolean;
}

export interface ProviderMessage {
	role: "user" | "assistant";
	content: string;
}

export interface ProviderRequest {
	baseUrl: string;
	model: string;
	apiKey: string;
	systemPrompt: string;
	messages: ProviderMessage[];
}

export interface PersistedChatState {
	messages: ConversationMessage[];
	draft: string;
	contextMode: ObchatContextMode;
}

export interface PersistedPluginData {
	settings: ObchatSettings;
	chatState: PersistedChatState;
}
