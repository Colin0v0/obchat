import { Modal, Notice, Setting } from "obsidian";
import type { App } from "obsidian";

export class SessionTitleModal extends Modal {
	private draftTitle: string;

	constructor(
		app: App,
		initialTitle: string,
		private readonly onConfirm: (title: string) => Promise<void>,
	) {
		super(app);
		this.draftTitle = initialTitle;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		contentEl.empty();
		titleEl.setText("重命名会话");

		new Setting(contentEl)
			.setName("会话标题")
			.setDesc("用于在会话列表里区分不同聊天。")
			.addText((text) => {
				text.setValue(this.draftTitle);
				text.inputEl.addClass("obchat-setting-text");
				text.onChange((value) => {
					this.draftTitle = value.trim();
				});
				window.setTimeout(() => {
					text.inputEl.focus();
					text.inputEl.select();
				}, 0);
			});

		new Setting(contentEl)
			.addButton((button) => {
				button.setButtonText("取消");
				button.onClick(() => {
					this.close();
				});
			})
			.addButton((button) => {
				button.setButtonText("保存");
				button.setCta();
				button.onClick(async () => {
					if (!this.draftTitle.trim()) {
						new Notice("请输入会话标题。");
						return;
					}

					await this.onConfirm(this.draftTitle.trim());
					this.close();
				});
			});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
