import type { ObchatProvider } from "./profile";

export interface ConversationMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	requestContent: string;
	contextLabel: string | null;
	profileId: string;
	profileName: string;
	provider: ObchatProvider;
	model: string;
	isError?: boolean;
	isStreaming?: boolean;
}

export interface ProviderMessage {
	role: "user" | "assistant";
	content: string;
}
