import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";

import { PROVIDER_TITLES } from "../../constants/ui";
import type ObchatPlugin from "../../main";
import { createEmptyProfile } from "../../stores/profile-store";
import type { ObchatProfile, ObchatProvider } from "../../types";

export class ProviderConfigModal extends Modal {
	private readonly editingProfileId: string | null;
	private readonly draftProfile: ObchatProfile;

	constructor(
		app: App,
		private readonly plugin: ObchatPlugin,
		profile: ObchatProfile | undefined,
		private readonly onSaved?: () => void,
	) {
		super(app);
		this.editingProfileId = profile?.id ?? null;
		this.draftProfile = createEmptyProfile(
			profile
				? {
					...profile,
				}
				: {
					name: `配置 ${this.plugin.settings.profiles.length + 1}`,
				},
		);
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		titleEl.setText(this.editingProfileId ? "编辑供应商配置" : "新增供应商配置");

		new Setting(contentEl)
			.setName("供应商类型")
			.setDesc("选择当前配置要连接的 provider。")
			.addDropdown((dropdown) => {
				Object.entries(PROVIDER_TITLES).forEach(([provider, label]) => {
					dropdown.addOption(provider, label);
				});
				dropdown.setValue(this.draftProfile.provider);
				dropdown.onChange((value) => {
					this.draftProfile.provider = value as ObchatProvider;
				});
			});

		// 弹窗内始终编辑草稿对象，只有点击保存后才回写到插件设置，避免误关闭时污染当前内存状态。
		new Setting(contentEl)
			.setName("显示名称")
			.setDesc("聊天页里用于区分当前供应商。")
			.addText((text) => {
				text.setValue(this.draftProfile.name);
				text.onChange((value) => {
					this.draftProfile.name = value.trim();
				});
			});

		new Setting(contentEl)
			.setName("Base URL")
			.setDesc("OpenAI 兼容系通常填到 `/v1`。")
			.addText((text) => {
				text.setPlaceholder("例如：https://api.openai.com/v1");
				text.setValue(this.draftProfile.baseUrl);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange((value) => {
					this.draftProfile.baseUrl = value.trim();
				});
			});

		new Setting(contentEl)
			.setName("API Key")
			.setDesc("保存在当前 provider 配置里。")
			.addText((text) => {
				text.setPlaceholder("sk-...");
				text.setValue(this.draftProfile.apiKey);
				text.inputEl.type = "password";
				text.inputEl.addClass("obchat-setting-text");
				text.onChange((value) => {
					this.draftProfile.apiKey = value.trim();
				});
			});

		new Setting(contentEl)
			.setName("默认模型")
			.setDesc("聊天页会默认使用这里的模型。")
			.addText((text) => {
				text.setPlaceholder("模型名称");
				text.setValue(this.draftProfile.model);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange((value) => {
					this.draftProfile.model = value.trim();
				});
			});

		if (this.draftProfile.availableModels.length > 0) {
			new Setting(contentEl)
				.setName("已拉取模型")
				.setDesc("从接口返回的模型列表。")
				.addDropdown((dropdown) => {
					this.draftProfile.availableModels.forEach((modelId) => {
						dropdown.addOption(modelId, modelId);
					});
					dropdown.setValue(this.draftProfile.model);
					dropdown.onChange((value) => {
						this.draftProfile.model = value;
					});
				});
		}

		new Setting(contentEl)
			.setName("系统提示词")
			.setDesc("当前 provider 每次聊天都会附带。")
			.addTextArea((textArea) => {
				textArea.setValue(this.draftProfile.systemPrompt);
				textArea.inputEl.rows = 5;
				textArea.inputEl.addClass("obchat-setting-textarea");
				textArea.onChange((value) => {
					this.draftProfile.systemPrompt = value;
				});
			});

		new Setting(contentEl)
			.setName("可用操作")
			.setDesc("可以先拉模型或测试连接，再保存。")
			.addButton((button) => {
				button.setButtonText("拉取模型");
				button.onClick(async () => {
					button.setDisabled(true);
					try {
						const modelIds = await this.plugin.chatService.listModels(this.draftProfile);
						const firstModel = modelIds[0];
						if (!firstModel) {
							throw new Error("没有获取到可用模型。");
						}

						this.draftProfile.availableModels = modelIds;
						this.draftProfile.model = firstModel;
						new Notice(`已获取 ${modelIds.length} 个模型。`);
						this.onOpen();
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`拉取模型失败：${message}`);
					} finally {
						button.setDisabled(false);
					}
				});
			})
			.addButton((button) => {
				button.setButtonText("测试连接");
				button.onClick(async () => {
					button.setDisabled(true);
					try {
						let responseText = "";
						for await (const chunk of this.plugin.chatService.stream(this.draftProfile, [
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
						new Notice("连接测试成功。");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`连接测试失败：${message}`);
					} finally {
						button.setDisabled(false);
					}
				});
			})
			.addButton((button) => {
				button.setButtonText(this.editingProfileId ? "保存" : "创建");
				button.setCta();
				button.onClick(async () => {
					try {
						const nextProfile = createEmptyProfile({
							...this.draftProfile,
							id: this.editingProfileId ?? this.draftProfile.id,
						});
						if (this.editingProfileId) {
							await this.plugin.updateProfile(this.editingProfileId, (profile) => {
								// 统一在这里回写字段，保持配置对象的落盘边界清晰。
								profile.name = nextProfile.name;
								profile.provider = nextProfile.provider;
								profile.baseUrl = nextProfile.baseUrl;
								profile.model = nextProfile.model;
								profile.availableModels = [...nextProfile.availableModels];
								profile.apiKey = nextProfile.apiKey;
								profile.systemPrompt = nextProfile.systemPrompt;
							});
						} else {
							await this.plugin.addProfile(nextProfile, false);
						}
						this.onSaved?.();
						this.close();
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						new Notice(`保存失败：${message}`);
					}
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
