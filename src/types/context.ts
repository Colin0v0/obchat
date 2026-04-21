import type { ObchatContextMode } from "./profile";

export interface ContextReference {
	path: string;
	score: number;
	preview: string;
}

export interface ContextSnapshot {
	mode: Exclude<ObchatContextMode, "none">;
	label: string;
	content: string;
	references?: ContextReference[];
}
