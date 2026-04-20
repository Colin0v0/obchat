import type { App } from "obsidian";

// 这里只做一层很薄的封装，方便后面统一管理密钥读取。
export class ObchatSecretStore {
	constructor(private readonly app: App) {}

	async getSecret(secretName: string): Promise<string> {
		const normalizedSecretName = secretName.trim();
		if (!normalizedSecretName) {
			throw new Error("请先在设置中填写 API Key 的密钥名称。");
		}

		if (!this.app.secretStorage || typeof this.app.secretStorage.get !== "function") {
			throw new Error("当前 Obsidian 版本不支持 Secret Storage。");
		}

		const secret = await this.app.secretStorage.get(normalizedSecretName);
		return (secret ?? "").trim();
	}
}
