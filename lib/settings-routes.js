/**
 * Browser API for the Settings → Desktop Pet page.
 *
 * Every read/write goes through these exact routes on the DSH web server. They
 * are fenced by the Connection service's own trust check (Host + Origin +
 * authenticated browser credential), the same check the shipped API routes
 * use, and they never touch a Session or Agent.
 *
 *   GET  /api/dsh-task-pet/info     preferences, characters, pet status
 *   GET  /api/dsh-task-pet/preview  one character preview image
 *   POST /api/dsh-task-pet/settings patch preferences (restarts the pet)
 *   POST /api/dsh-task-pet/restart  summon the pet again
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { safeImage } from './settings.js';

/** Pathname prefix reserved for this plugin's settings API. */
export const API_PREFIX = '/api/dsh-task-pet';

const PREVIEW_TYPES = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
};

/** Write one JSON response. */
export function writeJson(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(text),
	});
	res.end(text);
}

/** Read a small JSON request body. */
export async function readJsonBody(req) {
	if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) {
		throw new Error('JSON content type required');
	}
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		size += chunk.length;
		if (size > 16 * 1024) throw new Error('Body too large');
		chunks.push(chunk);
	}
	return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

/**
 * Whether a request may call this API. The Connection service is authoritative;
 * the local fallback keeps the route safe if it is ever unavailable.
 * @param connection - optional `ctx.connection` service.
 * @param req - node request.
 * @returns a rejection status, or undefined when the request is trusted.
 */
export function rejectionFor(connection, req) {
	if (connection !== undefined && typeof connection.requestRejection === 'function') {
		return connection.requestRejection({ headers: req.headers });
	}
	if (req.headers['sec-fetch-site'] === 'cross-site') return 403;
	const origin = req.headers.origin;
	if (origin === undefined) return undefined;
	try {
		const originUrl = new URL(origin);
		if (originUrl.protocol === 'dsh-app:') return originUrl.hostname === 'app' ? undefined : 403;
		const host = req.headers.host;
		if (typeof host !== 'string') return 403;
		return originUrl.host === new URL(`http://${host}`).host ? undefined : 403;
	} catch (error) {
		return 403;
	}
}

/**
 * Mount the settings routes on the web server.
 * @param ctx - context carrying `webServer` (and optionally `connection`).
 * @param deps - `{ settings, status, restart, folder }`.
 * @returns the disposer removing every route.
 */
export function mountSettingsRoutes(ctx, deps) {
	const webServer = ctx.get('webServer');
	if (webServer === undefined || typeof webServer.register !== 'function') return () => {};
	const connection = ctx.get('connection');
	const handle = async (req, res) => {
		const rejection = rejectionFor(connection, req);
		if (rejection !== undefined) {
			writeJson(res, rejection, { ok: false, message: rejection === 401 ? 'Not signed in' : 'Not trusted' });
			return;
		}
		try {
			const url = new URL(req.url, 'http://localhost');
			const action = url.pathname.slice(API_PREFIX.length);
			if (req.method === 'GET' && action === '/info') {
				const characters = (await deps.settings.characters()).map(({ dir, preview, ...character }) => character);
				return writeJson(res, 200, {
					ok: true,
					settings: deps.settings.get(),
					characters,
					folder: deps.folder,
					status: deps.status(),
				});
			}
			if (req.method === 'GET' && action === '/preview') {
				const character = (await deps.settings.characters()).find(candidate => candidate.id === url.searchParams.get('id'));
				const path = character === undefined ? undefined : await safeImage(character.dir, character.preview);
				if (path === undefined) return writeJson(res, 404, { ok: false, message: 'Preview not found' });
				const type = PREVIEW_TYPES[extname(path).toLowerCase()];
				if (type === undefined) return writeJson(res, 415, { ok: false, message: 'Unsupported preview' });
				res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
				res.end(await readFile(path));
				return;
			}
			if (req.method === 'POST' && action === '/settings') {
				return writeJson(res, 200, { ok: true, settings: await deps.settings.patch(await readJsonBody(req)), status: deps.status() });
			}
			if (req.method === 'POST' && action === '/restart') {
				await readJsonBody(req);
				await deps.restart();
				return writeJson(res, 200, { ok: true, status: deps.status() });
			}
			return writeJson(res, 404, { ok: false, message: 'Unknown action' });
		} catch (error) {
			return writeJson(res, 400, { ok: false, message: String(error?.message ?? error) });
		}
	};
	const disposers = ['info', 'preview', 'settings', 'restart'].map(action => webServer.register({
		kind: 'exact',
		path: `${API_PREFIX}/${action}`,
		handler: handle,
	}));
	return () => disposers.forEach(dispose => dispose());
}