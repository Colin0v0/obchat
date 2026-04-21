import { App, Notice, PluginSettingTab, Setting } from "obsidian";

import { CONTEXT_OPTIONS, INSERT_OPTIONS, PROVIDER_TITLES } from "../../constants/ui";
import type ObchatPlugin from "../../main";
import type { ObchatContextMode, ObchatInsertMode } from "../../types";

export class ObchatSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly plugin: ObchatPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Obchat 设置" });
		this.renderProviderSection(containerEl);
		this.renderDefaultBehaviorSection(containerEl);
	}

	private renderProviderSection(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "供应商" });
		const providerSectionEl = containerEl.createDiv({ cls: "obchat-provider-section" });

		new Setting(providerSectionEl)
			.setName("管理供应商")
			.setDesc("支持同时保存多个 provider 配置，并在聊天页随时切换。")
			.addButton((button) => {
				button.setButtonText("新增供应商");
				button.setCta();
				button.onClick(() => {
					this.plugin.openProviderConfigModal(undefined, () => {
						this.display();
					});
				});
			});

		const tableEl = providerSectionEl.createEl("table", { cls: "obchat-provider-table" });
		const theadEl = tableEl.createEl("thead");
		const headerRowEl = theadEl.createEl("tr");
		headerRowEl.createEl("th", { text: "名称" });
		headerRowEl.createEl("th", { text: "供应商" });
		headerRowEl.createEl("th", { text: "模型" });
		headerRowEl.createEl("th", { text: "操作" });
		const tbodyEl = tableEl.createEl("tbody");

		for (const profile of this.plugin.settings.profiles) {
			const providerTitle = PROVIDER_TITLES[profile.provider];
			const profileLabel = profile.name.trim() || providerTitle;

			const rowEl = tbodyEl.createEl("tr");
			rowEl.createEl("td", { cls: "obchat-provider-table__name", text: profileLabel });
			rowEl.createEl("td", { text: providerTitle });
			rowEl.createEl("td", { cls: "obchat-provider-table__model", text: profile.model });
			const actionsEl = rowEl.createEl("td", { cls: "obchat-provider-table__actions" });

			this.createProviderTableButton(actionsEl, "配置", () => {
				this.plugin.openProviderConfigModal(profile.id, () => {
					this.display();
				});
			});

			this.createProviderTableButton(actionsEl, "测试", async (buttonEl) => {
				buttonEl.disabled = true;
				try {
					let responseText = "";
					for await (const chunk of this.plugin.chatService.stream(profile, [
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
					new Notice(`${PROVIDER_TITLES[profile.provider]} 连接测试成功。`);
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`连接测试失败：${message}`);
				} finally {
					buttonEl.disabled = false;
				}
			});

			this.createProviderTableButton(actionsEl, "拉模型", async (buttonEl) => {
				buttonEl.disabled = true;
				try {
					const modelIds = await this.plugin.chatService.listModels(profile);
					await this.plugin.updateProfile(profile.id, (targetProfile) => {
						targetProfile.availableModels = modelIds;
						const firstModel = modelIds[0];
						if (firstModel) {
							targetProfile.model = firstModel;
						}
					});
					new Notice(`已为 ${PROVIDER_TITLES[profile.provider]} 获取 ${modelIds.length} 个模型。`);
					this.display();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`拉取模型失败：${message}`);
				} finally {
					buttonEl.disabled = false;
				}
			});

			this.createProviderTableButton(actionsEl, "删除", async (buttonEl) => {
				buttonEl.disabled = true;
				try {
					await this.plugin.removeProfile(profile.id);
					new Notice(`已删除供应商：${profileLabel}`);
					this.display();
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					new Notice(`删除失败：${message}`);
				} finally {
					buttonEl.disabled = false;
				}
			}, this.plugin.settings.profiles.length <= 1);
		}
	}

	private createProviderTableButton(
		parentEl: HTMLElement,
		text: string,
		onClick: (buttonEl: HTMLButtonElement) => void | Promise<void>,
		disabled = false,
	): HTMLButtonElement {
		const buttonEl = parentEl.createEl("button", {
			cls: "obchat-provider-table__button",
			text,
			attr: {
				type: "button",
			},
		});
		buttonEl.disabled = disabled;
		buttonEl.addEventListener("click", () => {
			void onClick(buttonEl);
		});
		return buttonEl;
	}

	private renderDefaultBehaviorSection(containerEl: HTMLElement): void {
		containerEl.createEl("h3", { text: "默认行为" });

		new Setting(containerEl)
			.setName("默认上下文")
			.setDesc("发送时默认附带的内容。")
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
			.setDesc("回答插回笔记的位置。")
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
	}
}
