import { DEFAULT_SYSTEM_PROMPT } from "../constants/defaults";
import type { LegacyObchatSettings, ObchatProfile, ObchatSettings } from "../types";

function createProfileId(): string {
	return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createEmptyProfile(partialProfile?: Partial<ObchatProfile>): ObchatProfile {
	return {
		id: partialProfile?.id?.trim() || createProfileId(),
		name: partialProfile?.name?.trim() || "默认配置",
		provider: partialProfile?.provider ?? "codex",
		baseUrl: partialProfile?.baseUrl?.trim() || "",
		model: partialProfile?.model?.trim() || "",
		availableModels: Array.isArray(partialProfile?.availableModels)
			? partialProfile.availableModels
					.map((modelId) => (typeof modelId === "string" ? modelId.trim() : ""))
					.filter(Boolean)
			: [],
		apiKey: partialProfile?.apiKey?.trim() || "",
		systemPrompt: partialProfile?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
	};
}

export function normalizeProfiles(profiles: ObchatProfile[] | undefined): ObchatProfile[] {
	if (!Array.isArray(profiles) || profiles.length === 0) {
		return [createEmptyProfile()];
	}

	return profiles.map((profile, index) =>
		createEmptyProfile({
			...profile,
			name: profile?.name?.trim() || `配置 ${index + 1}`,
		}),
	);
}

export function ensureActiveProfileId(settings: Pick<ObchatSettings, "activeProfileId" | "profiles">): string {
	const activeProfile = settings.profiles.find((profile) => profile.id === settings.activeProfileId);
	const firstProfile = settings.profiles[0];
	if (!firstProfile) {
		throw new Error("至少需要一个可用配置。");
	}

	return activeProfile?.id ?? firstProfile.id;
}

export function migrateLegacySettings(legacySettings: LegacyObchatSettings): ObchatSettings {
	const profile = createEmptyProfile({
		name: "默认配置",
		provider: legacySettings.provider ?? "codex",
		baseUrl: legacySettings.baseUrl ?? "",
		model: legacySettings.model ?? "",
		apiKey: legacySettings.apiKey ?? "",
		systemPrompt: legacySettings.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
	});

	return {
		activeProfileId: profile.id,
		profiles: [profile],
		defaultContextMode: legacySettings.defaultContextMode ?? "current-note",
		defaultInsertMode: legacySettings.defaultInsertMode ?? "cursor",
	};
}
