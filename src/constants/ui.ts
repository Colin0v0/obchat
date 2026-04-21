import type { ObchatContextMode, ObchatInsertMode, ObchatProvider } from "../types";

export const OBCHAT_VIEW_TYPE = "obchat-sidebar-view";

// 流式渲染不能太激进，否则会频繁重排 Markdown，导致侧边栏明显抖动。
export const STREAMING_RENDER_THROTTLE_MS = 120;

export const PROVIDER_TITLES: Record<ObchatProvider, string> = {
	codex: "Codex / OpenAI Responses",
	claude: "Claude",
	gemini: "Gemini",
	"openai-compatible": "OpenAI-compatible",
};

export const CONTEXT_OPTIONS: Partial<Record<ObchatContextMode, string>> = {
	none: "无上下文",
	"current-note": "当前笔记全文",
	"vault-related": "全库相关笔记",
};

export const INSERT_OPTIONS: Record<ObchatInsertMode, string> = {
	cursor: "插入到光标处",
	append: "追加到文末",
	"replace-selection": "替换当前选区",
};
