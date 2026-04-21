export function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match?.[1] || !match[2]) {
		throw new Error("图片数据格式无效。");
	}
	return {
		mimeType: match[1],
		base64: match[2],
	};
}
