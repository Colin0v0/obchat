import type { App } from "obsidian";

import type { PersistedChatSession } from "../types";

const EXPORT_FOLDER = "Obchat Exports";

function sanitizeMarkdownFileName(fileName: string): string {
	return fileName
		.trim()
		.replace(/[\\/:*?"<>|#^[\]]/g, "-")
		.replace(/\s+/g, " ")
		.slice(0, 80) || "Obchat 会话";
}

function formatExportDate(timestamp: number): string {
	const date = new Date(timestamp);
	const pad = (value: number) => value.toString().padStart(2, "0");
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
	].join("-");
}

function buildExportMarkdown(session: PersistedChatSession): string {
	const lines = [
		`# ${session.title}`,
		"",
		`- 导出时间：${new Date().toLocaleString()}`,
		`- 消息数：${session.messages.length}`,
		"",
		"---",
		"",
	];

	for (const message of session.messages) {
		const roleLabel = message.role === "user" ? "用户" : "助手";
		lines.push(`## ${roleLabel}`);
		if (message.profileName || message.model) {
			lines.push("");
			lines.push(`> ${[message.profileName, message.model].filter(Boolean).join(" · ")}`);
		}
		if (message.contextLabel) {
			lines.push("");
			lines.push(`> 上下文：${message.contextLabel}`);
		}
		if (message.contextReferences?.length) {
			lines.push("");
			lines.push("> 引用笔记：");
			for (const reference of message.contextReferences) {
				lines.push(`> - ${reference.path}`);
			}
		}
		if (message.imageAttachments?.length) {
			lines.push("");
			lines.push(`> 图片：${message.imageAttachments.map((attachment) => attachment.name).join("、")}`);
		}
		lines.push("");
		lines.push(message.content.trim() || "（空消息）");
		lines.push("");
	}

	return `${lines.join("\n").trim()}\n`;
}

async function ensureExportFolder(app: App): Promise<void> {
	const folderExists = await app.vault.adapter.exists(EXPORT_FOLDER);
	if (!folderExists) {
		await app.vault.createFolder(EXPORT_FOLDER);
	}
}

async function getAvailableExportPath(app: App, baseName: string): Promise<string> {
	let path = `${EXPORT_FOLDER}/${baseName}.md`;
	let index = 2;
	while (await app.vault.adapter.exists(path)) {
		path = `${EXPORT_FOLDER}/${baseName} ${index}.md`;
		index += 1;
	}
	return path;
}

export async function exportChatSessionToMarkdown(app: App, session: PersistedChatSession): Promise<string> {
	if (session.messages.length === 0) {
		throw new Error("当前会话还没有可导出的消息。");
	}

	await ensureExportFolder(app);
	const baseName = `${formatExportDate(session.updatedAt)} ${sanitizeMarkdownFileName(session.title)}`;
	const exportPath = await getAvailableExportPath(app, baseName);
	await app.vault.create(exportPath, buildExportMarkdown(session));
	return exportPath;
}
