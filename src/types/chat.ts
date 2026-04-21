import type { ContextReference } from "./context";
import type { ObchatProvider } from "./profile";

export interface ImageAttachment {
	id: string;
	name: string;
	mimeType: string;
	dataUrl: string;
	source: "manual" | "current-note";
}

export interface ConversationMessage {
	id: string;
	role: "user" | "assistant";
	content: string;
	requestContent: string;
	contextLabel: string | null;
	contextReferences?: ContextReference[];
	imageAttachments?: ImageAttachment[];
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
	imageAttachments?: ImageAttachment[];
}
