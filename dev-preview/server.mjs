import { createServer } from "http";
import { readFile } from "fs/promises";
import { extname, join, normalize } from "path";

const PORT = 4173;
const ROOT = process.cwd();

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".txt": "text/plain; charset=utf-8",
};

function getMimeType(pathname) {
	return MIME_TYPES[extname(pathname)] ?? "application/octet-stream";
}

function resolvePath(urlPath) {
	const pathname = urlPath === "/" ? "/dev-preview/index.html" : urlPath;
	const normalizedPath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
	return join(ROOT, normalizedPath);
}

createServer(async (request, response) => {
	try {
		const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
		const filePath = resolvePath(requestUrl.pathname);
		const fileContent = await readFile(filePath);
		response.writeHead(200, {
			"Content-Type": getMimeType(filePath),
			"Cache-Control": "no-store",
		});
		response.end(fileContent);
	} catch (error) {
		response.writeHead(404, {
			"Content-Type": "text/plain; charset=utf-8",
		});
		response.end("Not Found");
	}
}).listen(PORT, () => {
	console.log(`Obchat UI preview running at http://localhost:${PORT}`);
});
