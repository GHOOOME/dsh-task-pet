/**
 * Greninja desktop pet — Host bridge plugin.
 *
 * The pet itself is a separate native macOS app (pet/main.swift) that floats
 * above every window. This plugin is the bridge between it and DSH:
 *
 *  1. folds committed `session/event`s into one pet state (lib/fold.js),
 *  2. serves that state on a loopback-only HTTP endpoint guarded by a random
 *     per-process token,
 *  3. writes `~/.dsh/dsh-task-pet/bridge.json` so the app can reconnect after
 *     a pet-only restart,
 *  4. spawns the pet binary and stops it when the plugin unloads, so the pet
 *     exists exactly while this DSH host runs.
 *
 * Security posture: loopback bind only, 192-bit random token, 0600 discovery
 * file, no state-changing routes, and no call into any Session/Agent method
 * that could resume an agent — this plugin is a pure observer.
 */

import { execFile, spawn } from 'node:child_process';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PetFold } from './lib/fold.js';
import { createPetSettings } from './lib/settings.js';
import { mountSettingsRoutes } from './lib/settings-routes.js';

/** Loader-facing identity of this plugin row. */
export const name = 'dsh-task-pet';

/** Every service used here is optional (`ctx.get`), so activation never blocks. */
export const inject = [];

const PACKAGE_DIR = dirname(fileURLToPath(import.meta.url));
const HOME_DIR = homedir();
const DATA_DIR = join(HOME_DIR, '.dsh', 'dsh-task-pet');
const SETTINGS_FILE = join(DATA_DIR, 'settings.json');
const CHARACTERS_DIR = join(DATA_DIR, 'characters');
const BRIDGE_FILE = join(DATA_DIR, 'bridge.json');
const BUNDLED_CHARACTER_DIR = join(PACKAGE_DIR, 'pet', 'assets');
const BRIDGE_VERSION = 2;
const MAX_SPAWNS = 3;

/** Compare a supplied token with the process token in constant time. */
function tokenMatches(supplied, expected) {
	if (typeof supplied !== 'string' || supplied.length !== expected.length) return false;
	try {
		return timingSafeEqual(Buffer.from(supplied, 'utf8'), Buffer.from(expected, 'utf8'));
	} catch (error) {
		return false;
	}
}

/** Write one JSON response. */
function respond(res, status, body) {
	const text = JSON.stringify(body);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(text),
	});
	res.end(text);
}

/** Read one optional Host service without making it an activation dependency. */
function optionalService(ctx, key) {
	try {
		return typeof ctx.get === 'function' ? ctx.get(key) : undefined;
	} catch (error) {
		return undefined;
	}
}

/**
 * Read the projection hints for a session (title / todo list). Purely
 * observational: `stateOf` only folds already-committed events.
 */
function projectionHints(ctx, session) {
	try {
		const projections = optionalService(ctx, 'sessionProjections');
		if (projections === undefined || typeof projections.stateOf !== 'function') return undefined;
		const title = projections.stateOf(session, 'title');
		const todos = projections.stateOf(session, 'todos');
		if (title === undefined && todos === undefined) return undefined;
		return {
			title: typeof title === 'string' ? title : undefined,
			todos: Array.isArray(todos) ? todos : undefined,
		};
	} catch (error) {
		return undefined;
	}
}

/**
 * Mount the loopback state bridge, register the session observers, and start
 * the pet process.
 * @param ctx - Host cordis context.
 */
export async function apply(ctx) {
	const fold = new PetFold();
	const token = randomBytes(24).toString('base64url');
	const startedAt = Date.now();
	const timers = new Set();
	let disposed = false;
	let server = null;
	let port = 0;
	let child = null;
	let spawnCount = 0;
	let lastError = null;
	let settings;
	let selectedSkin;
	let stopping = false;

	/** Late timer that is cleared on dispose. */
	const later = (callback, delay) => {
		const timer = setTimeout(() => {
			timers.delete(timer);
			callback();
		}, delay);
		timers.add(timer);
		return timer;
	};

	/** Register a session that already exists when the plugin activates. */
	const registerExisting = session => {
		try {
			fold.register(session, projectionHints(ctx, session));
		} catch (error) {
			/* A malformed session must not stop the pet. */
		}
	};

	// ---- State sources (observation only) ---------------------------------
	ctx.on('session/created', session => {
		registerExisting(session);
	});
	ctx.on('session/event', (session, event) => {
		try {
			fold.applyEvent(session, event);
		} catch (error) {
			/* Keep the bridge alive even if one event is malformed. */
		}
	});
	ctx.on('agent/status', payload => {
		try {
			const session = payload?.agent?.session;
			if (session !== undefined) fold.handleAgentStatus(session, payload.status);
		} catch (error) {
			/* ignore */
		}
	});

	// Recover the live state of agents that already run when we activate.
	try {
		const agents = optionalService(ctx, 'agents');
		if (agents !== undefined && typeof agents.list === 'function') {
			for (const agent of agents.list()) {
				const session = agent?.session;
				if (session === undefined) continue;
				registerExisting(session);
				if (agent.status === 'running') fold.handleAgentStatus(session, 'running', Date.now());
			}
		}
	} catch (error) {
		/* ignore */
	}

	// ---- HTTP bridge ------------------------------------------------------
	server = createServer((req, res) => {
		let url;
		try {
			url = new URL(req.url ?? '/', 'http://127.0.0.1');
		} catch (error) {
			respond(res, 400, { ok: false, code: 'bad-request' });
			return;
		}
		if (req.method !== 'GET') {
			respond(res, 405, { ok: false, code: 'method-not-allowed' });
			return;
		}
		if (url.pathname === '/health') {
			respond(res, 200, { ok: true, app: 'dsh-task-pet-bridge', bridge: BRIDGE_VERSION, port, pid: process.pid });
			return;
		}
		if (url.pathname !== '/state') {
			respond(res, 404, { ok: false, code: 'not-found' });
			return;
		}
		if (!tokenMatches(url.searchParams.get('token') ?? '', token)) {
			respond(res, 401, { ok: false, code: 'unauthorized' });
			return;
		}
		try {
			const snapshot = fold.snapshot(Date.now());
			respond(res, 200, {
				...snapshot,
				bridge: { version: BRIDGE_VERSION, pid: process.pid, port, startedAt },
			});
		} catch (error) {
			respond(res, 500, { ok: false, code: 'snapshot-failed' });
		}
	});
	server.on('error', error => {
		console.warn('[task-pet] bridge server error:', error?.message ?? error);
	});


	/** Publish the loopback endpoint for a pet launched outside the spawn path. */
	const publishBridgeFile = async () => {
		try {
			await mkdir(dirname(BRIDGE_FILE), { recursive: true });
			await writeFile(BRIDGE_FILE, JSON.stringify({
				version: BRIDGE_VERSION,
				app: 'dsh-task-pet',
				port,
				token,
				pid: process.pid,
				startedAt,
			}), { mode: 0o600 });
			await chmod(BRIDGE_FILE, 0o600);
		} catch (error) {
			console.warn('[task-pet] cannot write bridge file:', error?.message ?? error);
		}
	};

	// ---- Pet process ------------------------------------------------------

	/** Resolve the pet binary, honoring the debug override. */
	const petBinary = () => process.env.DSH_GRENINJA_PET_BIN ?? join(PACKAGE_DIR, 'bin', 'dsh-task-pet');

	/** Spawn the desktop pet, retrying a limited number of times on crashes. */
	const spawnPet = () => {
		if (disposed || stopping || process.env.DSH_GRENINJA_PET_DISABLE === '1') return;
		if (process.platform !== 'darwin' || process.arch !== 'arm64') { lastError = 'This build supports Apple Silicon macOS only'; return; }
		const binary = petBinary();
		if (!existsSync(binary)) {
			console.warn('[task-pet] pet binary missing; run pet/build.sh first:', binary);
			return;
		}
		if (spawnCount >= MAX_SPAWNS) return;
		spawnCount += 1;
		const skin = selectedSkin;
		if (!skin) return;
		const args = [
			'--port', String(port),
			'--token', token,
			'--skin', skin,
			'--scale', String(settings.get().scale),
		];
		const prefs = settings.get();
		const env = { ...process.env, DSH_TASK_PET_MUTED: String(prefs.muted), DSH_GRENINJA_PET_COMPLETION_MS: String(prefs.completionBubbleMs) };
		const proc = spawn(binary, args, { stdio: 'ignore', detached: false, env });
		child = proc;
		proc.on('error', error => {
			lastError = String(error?.message ?? error);
			console.warn('[task-pet] cannot start pet:', lastError);
		});
		proc.on('exit', (code, signal) => {
			if (child === proc) child = null;
			if (disposed || stopping) return;
			// A clean exit is the user quitting the pet on purpose; respect it.
			if (code === 0 || signal === 'SIGTERM' || signal === 'SIGKILL') return;
			later(() => spawnPet(), 2000);
		});
	};

	/** Save applies through a bounded native-process restart; the DSH Host stays running. */
	const restartPet = async () => {
		stopping = true;
		const previous = child;
		child = null;
		if (previous && previous.exitCode === null && previous.signalCode === null) {
			await new Promise(resolve => {
				previous.once('exit', resolve);
				previous.kill('SIGTERM');
				const timeout = setTimeout(() => { if (previous.exitCode === null && previous.signalCode === null) previous.kill('SIGKILL'); resolve(); }, 1500);
				timeout.unref();
			});
		}
		selectedSkin = await settings.skinDir();
		spawnCount = 0;
		stopping = false;
		lastError = null;
		spawnPet();
	};
	settings = await createPetSettings({
		file: SETTINGS_FILE, charactersDir: CHARACTERS_DIR, bundledDir: BUNDLED_CHARACTER_DIR,
		personalDir: process.env.DSH_GRENINJA_PET_SKIN ?? join(HOME_DIR, '.dsh', 'greninja-pet', 'skin'),
		onApply: restartPet,
	});
	selectedSkin = await settings.skinDir();
	const status = () => ({ running: !!child && child.exitCode === null && child.signalCode === null, platform: process.platform, arch: process.arch, error: lastError });
	// Mount only once the browser carrier exists; on a cold profile our row can
	// activate before the webServer row does.
	ctx.inject(['webServer'], webCtx => {
		const dispose = mountSettingsRoutes(webCtx, { settings, status, restart: restartPet, folder: CHARACTERS_DIR, openFolder: () => new Promise((resolve, reject) => execFile('open', [CHARACTERS_DIR], error => (error ? reject(error) : resolve()))) });
		webCtx.effect(() => dispose, 'task-pet: settings API');
	});

	server.listen(0, '127.0.0.1', () => {
		const address = server.address();
		port = typeof address === 'object' && address !== null ? address.port : 0;
		void publishBridgeFile();
		spawnPet();
	});
	// ---- Teardown ---------------------------------------------------------
	ctx.effect(() => () => {
		disposed = true;
		for (const timer of timers) clearTimeout(timer);
		timers.clear();
		if (child !== null) {
			const proc = child;
			child = null;
			try {
				proc.kill('SIGTERM');
				const force = setTimeout(() => {
					try {
						proc.kill('SIGKILL');
					} catch (error) {
						/* already gone */
					}
				}, 1000);
				if (typeof force.unref === 'function') force.unref();
			} catch (error) {
				/* already gone */
			}
		}
		if (server !== null) {
			try {
				server.close();
			} catch (error) {
				/* already closed */
			}
		}
		void unlink(BRIDGE_FILE).catch(() => {});
	}, 'task-pet: bridge + pet process');
}
