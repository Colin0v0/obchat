interface ComposerStateElements {
	textareaEl: HTMLTextAreaElement | null;
	sendButtonEl: HTMLButtonElement | null;
	profileSelectEl: HTMLSelectElement | null;
	modelSelectEl: HTMLSelectElement | null;
	contextSelectEl: HTMLSelectElement | null;
	refreshModelsButtonEl: HTMLButtonElement | null;
}

export function updateComposerState(
	elements: ComposerStateElements,
	options: {
		isSending: boolean;
		isLoadingModels: boolean;
	},
): void {
	const { textareaEl, sendButtonEl } = elements;
	if (!textareaEl || !sendButtonEl) {
		return;
	}

	const disableControls = options.isSending || options.isLoadingModels;
	textareaEl.disabled = options.isSending;
	sendButtonEl.disabled = options.isLoadingModels;
	sendButtonEl.textContent = options.isSending ? "停止" : "发送";
	if (elements.profileSelectEl) {
		elements.profileSelectEl.disabled = disableControls;
	}
	if (elements.modelSelectEl) {
		elements.modelSelectEl.disabled = disableControls;
	}
	if (elements.contextSelectEl) {
		elements.contextSelectEl.disabled = options.isSending;
	}
	if (elements.refreshModelsButtonEl) {
		elements.refreshModelsButtonEl.disabled = disableControls;
	}
}
