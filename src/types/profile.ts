export type ObchatProvider = "codex" | "claude" | "gemini" | "openai-compatible";

export type ObchatContextMode = "none" | "selection" | "current-note" | "vault-related";

export type ObchatInsertMode = "cursor" | "append" | "replace-selection";

export interface ObchatProfile {
	id: string;
	name: string;
	provider: ObchatProvider;
	baseUrl: string;
	model: string;
	availableModels: string[];
	apiKey: string;
	systemPrompt: string;
}

export interface ObchatSettings {
	activeProfileId: string;
	profiles: ObchatProfile[];
	defaultContextMode: ObchatContextMode;
	defaultInsertMode: ObchatInsertMode;
}

export interface LegacyObchatSettings {
	provider?: ObchatProvider;
	baseUrl?: string;
	model?: string;
	apiKey?: string;
	systemPrompt?: string;
	defaultContextMode?: ObchatContextMode;
	defaultInsertMode?: ObchatInsertMode;
}
