import type { ObchatProfile } from "../../types";
import { getProfileLabel } from "./shared";

export function renderProfileOptions(
	profileSelectEl: HTMLSelectElement | null,
	profiles: ObchatProfile[],
	activeProfile: ObchatProfile,
): void {
	if (!profileSelectEl) {
		return;
	}

	profileSelectEl.empty();
	profiles.forEach((profile, index) => {
		profileSelectEl.createEl("option", {
			value: profile.id,
			text: getProfileLabel(profile) || `配置 ${index + 1}`,
		});
	});
	profileSelectEl.value = activeProfile.id;
}

export function renderModelOptions(modelSelectEl: HTMLSelectElement | null, activeProfile: ObchatProfile): void {
	if (!modelSelectEl) {
		return;
	}

	const candidateModels = Array.from(new Set([activeProfile.model.trim(), ...activeProfile.availableModels])).filter(Boolean);
	modelSelectEl.empty();

	if (candidateModels.length === 0) {
		modelSelectEl.createEl("option", {
			value: "",
			text: "未加载模型列表",
		});
		modelSelectEl.value = "";
		return;
	}

	candidateModels.forEach((modelId) => {
		modelSelectEl.createEl("option", {
			value: modelId,
			text: modelId,
		});
	});
	const selectedModel = activeProfile.model.trim() || candidateModels[0] || "";
	modelSelectEl.value = selectedModel;
}
