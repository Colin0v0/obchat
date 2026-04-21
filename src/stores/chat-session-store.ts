import type { PersistedChatSession, PersistedChatState } from "../types";

function createSessionId(): string {
	return `session-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createChatSession(partialSession?: Partial<PersistedChatSession>): PersistedChatSession {
	return {
		id: partialSession?.id?.trim() || createSessionId(),
		title: partialSession?.title?.trim() || "新会话",
		messages: Array.isArray(partialSession?.messages) ? partialSession.messages.map((message) => ({ ...message })) : [],
		draft: partialSession?.draft ?? "",
		contextMode: partialSession?.contextMode ?? "current-note",
		updatedAt: partialSession?.updatedAt ?? Date.now(),
	};
}

export function normalizeChatState(chatState: Partial<PersistedChatState> | undefined): PersistedChatState {
	const sessions = Array.isArray(chatState?.sessions) && chatState.sessions.length > 0
		? chatState.sessions.map((session, index) =>
			createChatSession({
				...session,
				title: session?.title?.trim() || `会话 ${index + 1}`,
			}),
		)
		: [createChatSession()];

	const activeSessionId = sessions.find((session) => session.id === chatState?.activeSessionId)?.id ?? sessions[0]!.id;
	return {
		activeSessionId,
		sessions,
	};
}

export function migrateLegacyChatState(legacyState: {
	messages?: PersistedChatSession["messages"];
	draft?: string;
	contextMode?: PersistedChatSession["contextMode"];
} | null | undefined): PersistedChatState {
	const session = createChatSession({
		title: "当前会话",
		messages: legacyState?.messages ?? [],
		draft: legacyState?.draft ?? "",
		contextMode: legacyState?.contextMode ?? "current-note",
	});

	return {
		activeSessionId: session.id,
		sessions: [session],
	};
}

export function getActiveChatSession(chatState: PersistedChatState): PersistedChatSession {
	const activeSession = chatState.sessions.find((session) => session.id === chatState.activeSessionId);
	if (activeSession) {
		return activeSession;
	}

	const firstSession = chatState.sessions[0];
	if (!firstSession) {
		throw new Error("至少需要一个可用会话。");
	}

	return firstSession;
}

export function buildSessionTitleFromMessages(messages: PersistedChatSession["messages"]): string {
	const lastUserMessage = messages.find((message) => message.role === "user");
	if (!lastUserMessage) {
		return "新会话";
	}

	const normalizedTitle = lastUserMessage.content.trim().replace(/\s+/g, " ");
	return normalizedTitle.slice(0, 24) || "新会话";
}
