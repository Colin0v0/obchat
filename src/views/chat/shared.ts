import type { ObchatProfile } from "../../types";

export function createMessageId(): string {
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getProfileLabel(profile: ObchatProfile): string {
	return profile.name.trim() || "未命名配置";
}
