import type { App } from "obsidian";

import { buildCurrentNoteContextSnapshot, buildSelectionContextSnapshot } from "../context/active-note-context";
import { buildVaultRelatedContextSnapshot } from "../context/vault-related-context";
import type { ContextSnapshot, ObchatContextMode } from "../types";

export async function buildContextSnapshot(
	app: App,
	mode: ObchatContextMode,
	userInput: string,
): Promise<ContextSnapshot | null> {
	if (mode === "none") {
		return null;
	}

	if (mode === "selection") {
		return buildSelectionContextSnapshot(app);
	}

	if (mode === "current-note") {
		return buildCurrentNoteContextSnapshot(app);
	}

	return buildVaultRelatedContextSnapshot(app, userInput);
}
