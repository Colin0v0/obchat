import type { ObchatContextMode } from "./profile";

export interface ContextSnapshot {
	mode: Exclude<ObchatContextMode, "none">;
	label: string;
	content: string;
}
