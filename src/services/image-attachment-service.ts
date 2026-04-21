import { TFile, type App } from "obsidian";

import type { ImageAttachment } from "../types";
import { getActiveMarkdownView } from "../utils/obsidian-view";

const SUPPORTED_IMAGE_EXTENSIONS: Record<string, string> = {
	avif: "image/avif",
	gif: "image/gif",
	jpeg: "image/jpeg",
	jpg: "image/jpeg",
	png: "image/png",
	webp: "image/webp",
};

function createImageAttachmentId(): string {
	return `image-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getImageMimeTypeByName(name: string): string | null {
	const extension = name.split(".").pop()?.toLowerCase() ?? "";
	return SUPPORTED_IMAGE_EXTENSIONS[extension] ?? null;
}

function isSupportedImageFile(file: File): boolean {
	return file.type.startsWith("image/") || Boolean(getImageMimeTypeByName(file.name));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fileToDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result !== "string") {
				reject(new Error("无法读取图片内容。"));
				return;
			}
			resolve(reader.result);
		};
		reader.onerror = () => {
			reject(new Error("读取图片失败。"));
		};
		reader.readAsDataURL(file);
	});
}

function parseMarkdownImageTargets(markdown: string): string[] {
	const targets: string[] = [];
	const markdownImagePattern = /!\[[^\]]*]\(([^)]+)\)/g;
	const wikiImagePattern = /!\[\[([^\]]+)]]/g;
	for (const match of markdown.matchAll(markdownImagePattern)) {
		const rawTarget = match[1]?.trim();
		if (rawTarget) {
			targets.push(rawTarget.replace(/^<|>$/g, "").split("#")[0]!.trim());
		}
	}
	for (const match of markdown.matchAll(wikiImagePattern)) {
		const rawTarget = match[1]?.trim();
		if (rawTarget) {
			targets.push(rawTarget.split("|")[0]!.split("#")[0]!.trim());
		}
	}
	return targets.filter(Boolean);
}

export async function createImageAttachmentsFromFiles(files: File[]): Promise<ImageAttachment[]> {
	const imageFiles = files.filter(isSupportedImageFile);
	const attachments: ImageAttachment[] = [];
	for (const file of imageFiles) {
		const mimeType = file.type || getImageMimeTypeByName(file.name);
		if (!mimeType) {
			throw new Error(`不支持的图片类型：${file.name}`);
		}
		attachments.push({
			id: createImageAttachmentId(),
			name: file.name,
			mimeType,
			dataUrl: await fileToDataUrl(file),
			source: "manual",
		});
	}
	return attachments;
}

export async function createCurrentNoteImageAttachments(app: App): Promise<ImageAttachment[]> {
	const markdownView = getActiveMarkdownView(app);
	if (!markdownView?.file) {
		return [];
	}

	const markdown = await app.vault.cachedRead(markdownView.file);
	const attachments: ImageAttachment[] = [];
	for (const target of parseMarkdownImageTargets(markdown)) {
		const imageFile = app.metadataCache.getFirstLinkpathDest(target, markdownView.file.path);
		if (!(imageFile instanceof TFile)) {
			continue;
		}

		const mimeType = getImageMimeTypeByName(imageFile.name);
		if (!mimeType) {
			continue;
		}

		const buffer = await app.vault.readBinary(imageFile);
		attachments.push({
			id: createImageAttachmentId(),
			name: imageFile.name,
			mimeType,
			dataUrl: `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`,
			source: "current-note",
		});
	}
	return attachments;
}
