import { App, Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";

import type ObchatPlugin from "./main";
import type { ObchatContextMode, ObchatInsertMode, ObchatProvider, ObchatSettings } from "./types";

export const DEFAULT_SETTINGS: ObchatSettings = {
	provider: "codex",
	baseUrl: "",
	model: "",
	systemPrompt: "你是一个简洁、可靠的 Obsidian 写作助手。请直接回答，不要编造信息。",
	defaultContextMode: "current-note",
	defaultInsertMode: "cursor",
	apiKeySecretName: "obchat-api-key",
};

const PROVIDER_OPTIONS: Record<ObchatProvider, string> = {
	codex: "Codex / OpenAI Responses",
	claude: "Claude",
	gemini: "Gemini",
	"openai-compatible": "OpenAI-compatible",
};

const CONTEXT_OPTIONS: Record<ObchatContextMode, string> = {
	none: "无上下文",
	selection: "当前选中文本",
	"current-note": "当前笔记全文",
};

const INSERT_OPTIONS: Record<ObchatInsertMode, string> = {
	cursor: "插入到光标处",
	append: "追加到文末",
	"replace-selection": "替换当前选区",
};

export class ObchatSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ObchatPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Obchat 设置" });

		new Setting(containerEl)
			.setName("Provider")
			.setDesc("选择当前侧边栏默认使用的模型提供方。")
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(PROVIDER_OPTIONS)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.provider);
				dropdown.onChange(async (value: ObchatProvider) => {
					this.plugin.settings.provider = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Base URL")
			.setDesc("填写当前 provider 对应的接口根地址。")
			.addText((text) => {
				text.setPlaceholder("例如：https://api.openai.com/v1");
				text.setValue(this.plugin.settings.baseUrl);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange(async (value) => {
					this.plugin.settings.baseUrl = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Model")
			.setDesc("填写模型名称，例如 gpt-5、claude-sonnet-4-5、gemini-2.5-pro。")
			.addText((text) => {
				text.setPlaceholder("模型名称");
				text.setValue(this.plugin.settings.model);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange(async (value) => {
					this.plugin.settings.model = value.trim();
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("系统提示词")
			.setDesc("这里会作为每次聊天的固定 system prompt。")
			.addTextArea((textArea) => {
				textArea.setValue(this.plugin.settings.systemPrompt);
				textArea.inputEl.rows = 5;
				textArea.inputEl.addClass("obchat-setting-textarea");
				textArea.onChange(async (value) => {
					this.plugin.settings.systemPrompt = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("默认上下文")
			.setDesc("决定发送消息时默认带不带当前笔记内容。")
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(CONTEXT_OPTIONS)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.defaultContextMode);
				dropdown.onChange(async (value: ObchatContextMode) => {
					this.plugin.settings.defaultContextMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("默认插入方式")
			.setDesc("控制助手回答插回笔记时的默认落点。")
			.addDropdown((dropdown) => {
				for (const [value, label] of Object.entries(INSERT_OPTIONS)) {
					dropdown.addOption(value, label);
				}
				dropdown.setValue(this.plugin.settings.defaultInsertMode);
				dropdown.onChange(async (value: ObchatInsertMode) => {
					this.plugin.settings.defaultInsertMode = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("密钥名称")
			.setDesc("这个名称会指向 Obsidian 钥匙串里的密钥条目。")
			.addText((text) => {
				text.setPlaceholder("例如：obchat-api-key");
				text.setValue(this.plugin.settings.apiKeySecretName);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange(async (value) => {
					this.plugin.settings.apiKeySecretName = value.trim();
					await this.plugin.saveSettings();
				});
			});

		const secretSetting = new Setting(containerEl)
			.setName("API Key")
			.setDesc("通过 Obsidian 官方钥匙串保存敏感密钥，插件设置文件里不会保存明文。");

		secretSetting.settingEl.addClass("obchat-secret-setting");
		new SecretComponent(this.app, secretSetting.controlEl)
			.setValue(this.plugin.settings.apiKeySecretName)
			.onChange(async (value) => {
				this.plugin.settings.apiKeySecretName = value.trim();
				await this.plugin.saveSettings();
			});

		new Setting(containerEl)
			.setName("测试连接")
			.setDesc("使用当前设置和密钥发一条最小请求。")
			.addButton((button) => {
				button.setButtonText("测试");
				button.setCta();
				button.onClick(async () => {
					button.setDisabled(true);
					try {
						let responseText = "";
						for await (const chunk of this.plugin.chatService.stream(this.plugin.settings, [
							{
								role: "user",
								content: "请只回复“连接成功”。",
							},
						])) {
							responseText += chunk;
						}
						if (!responseText.trim()) {
							throw new Error("上游返回了空响应。");
						}
						new Notice("Obchat 连接测试成功。");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`Obchat 连接测试失败：${message}`);
					} finally {
						button.setDisabled(false);
					}
				});
			});
	}
}
