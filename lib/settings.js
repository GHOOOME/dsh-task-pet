/** Durable preferences and read-only local character discovery. */
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

const ID = /^[a-z0-9][a-z0-9-]{0,47}$/u;
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
export const isCharacterId = id => typeof id === 'string' && ID.test(id);
export const defaultSettings = () => ({ version: 1, character: 'default', scale: 2, muted: false, completionBubbleMs: 6000 });

export function normalizeSettings(raw) {
	const base = defaultSettings();
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
	if (isCharacterId(raw.character)) base.character = raw.character;
	if (Number.isInteger(raw.scale) && raw.scale >= 1 && raw.scale <= 6) base.scale = raw.scale;
	if (typeof raw.muted === 'boolean') base.muted = raw.muted;
	if (Number.isInteger(raw.completionBubbleMs) && raw.completionBubbleMs >= 0 && raw.completionBubbleMs <= 120000) base.completionBubbleMs = raw.completionBubbleMs;
	return base;
}

export function validatePatch(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Settings must be an object');
	const allowed = new Set(['character', 'scale', 'muted', 'completionBubbleMs']);
	if (Object.keys(raw).some(k => !allowed.has(k))) throw new Error('Unknown setting');
	if ('character' in raw && !isCharacterId(raw.character)) throw new Error('Invalid character id');
	if ('scale' in raw && (!Number.isInteger(raw.scale) || raw.scale < 1 || raw.scale > 6)) throw new Error('Scale must be 1–6');
	if ('muted' in raw && typeof raw.muted !== 'boolean') throw new Error('Muted must be boolean');
	if ('completionBubbleMs' in raw && (!Number.isInteger(raw.completionBubbleMs) || raw.completionBubbleMs < 0 || raw.completionBubbleMs > 120000)) throw new Error('Duration must be 0–120000 ms');
	return raw;
}

export async function saveSettingsFile(file, settings) {
	await mkdir(dirname(file), { recursive: true });
	const temporary = `${file}.${randomBytes(6).toString('hex')}.tmp`;
	await writeFile(temporary, `${JSON.stringify(normalizeSettings(settings), null, 2)}\n`, { mode: 0o600 });
	// Both paths are in the same known settings directory; replace only this document.
	await rename(temporary, file);
}
export async function loadSettingsFile(file) {
	try { return normalizeSettings(JSON.parse(await readFile(file, 'utf8'))); }
	catch (e) { if (e.code === 'ENOENT' || e instanceof SyntaxError) return defaultSettings(); throw e; }
}

/** Reject traversal and escaping symlinks, including preview files. */
export async function safeImage(root, name) {
	if (typeof name !== 'string' || !name || isAbsolute(name) || name.includes('\\') || !IMAGES.has(extname(name).toLowerCase())) return undefined;
	try {
		const base = await realpath(root);
		const target = await realpath(resolve(base, name));
		const rel = relative(base, target);
		if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined;
		const info = await stat(target);
		return info.isFile() && info.size <= 8 * 1024 * 1024 ? target : undefined;
	} catch { return undefined; }
}

export async function readCharacter(id, dir) {
	let manifest;
	try { manifest = JSON.parse(await readFile(join(dir, 'skin.json'), 'utf8')); } catch { manifest = {}; }
	if (!manifest || typeof manifest !== 'object') manifest = {};
	const states = manifest.states && typeof manifest.states === 'object' ? manifest.states : {};
	const idle = states.idle ?? states.default;
	const choices = [idle?.sprite, ...(Array.isArray(idle?.frames) ? idle.frames : []), 'sprite.png', 'idle.png', 'greninja.png'];
	let preview;
	for (const candidate of choices) { if (await safeImage(dir, candidate)) { preview = candidate; break; } }
	if (!preview) return null;
	return { id, dir, preview,
		name: typeof manifest.name === 'string' ? manifest.name.slice(0, 120) : id,
		author: typeof manifest.author === 'string' ? manifest.author.slice(0, 120) : null,
		license: typeof manifest.license === 'string' ? manifest.license.slice(0, 120) : null,
		states: Object.keys(states), builtin: id === 'default' };
}

export async function listCharacters(root, fallbackDir, personalDir) {
	const result = [];
	const fallback = await readCharacter('default', fallbackDir);
	if (fallback) result.push(fallback);
	if (personalDir && existsSync(personalDir)) {
		const item = await readCharacter('personal', personalDir);
		if (item) result.push(item);
	}
	let entries = [];
	try { entries = await readdir(root, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
	for (const entry of entries) {
		if (!entry.isDirectory() || !isCharacterId(entry.name) || ['default', 'personal'].includes(entry.name)) continue;
		const item = await readCharacter(entry.name, join(root, entry.name));
		if (item) result.push(item);
	}
	return result;
}

/**
 * Copy bundled characters into the user library once. Existing directories are
 * never overwritten, so a user's edits and installed versions survive upgrades.
 * @param bundledRoot - package `pet/characters` directory.
 * @param charactersRoot - `~/.dsh/dsh-task-pet/characters`.
 * @returns the ids that were seeded.
 */
export async function seedCharacters(bundledRoot, charactersRoot) {
	let entries = [];
	try { entries = await readdir(bundledRoot, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
	await mkdir(charactersRoot, { recursive: true });
	const seeded = [];
	for (const entry of entries) {
		if (!entry.isDirectory() || !isCharacterId(entry.name)) continue;
		const target = join(charactersRoot, entry.name);
		if (existsSync(join(target, 'skin.json'))) continue;
		await cp(join(bundledRoot, entry.name), target, { recursive: true, force: true });
		seeded.push(entry.name);
	}
	return seeded;
}

/** One mutation implementation used by both browser and native pet adapters. */
export async function createPetSettings({ file, charactersDir, bundledDir, personalDir, onApply }) {
	const hadSettings = existsSync(file);
	let current = await loadSettingsFile(file);
	let queue = Promise.resolve();
	const characters = () => listCharacters(charactersDir, bundledDir, personalDir);
	if (!hadSettings && (await characters()).some(c => c.id === 'personal')) current.character = 'personal';
	await mkdir(charactersDir, { recursive: true });
	await saveSettingsFile(file, current);
	return {
		get: () => ({ ...current }), characters,
		async skinDir() { return (await characters()).find(c => c.id === current.character)?.dir ?? bundledDir; },
		patch(patch, { apply = true } = {}) {
			const next = queue.then(async () => {
				validatePatch(patch);
				const merged = normalizeSettings({ ...current, ...patch });
				if (!(await characters()).some(c => c.id === merged.character)) throw new Error('Character not found; refresh the library');
				await saveSettingsFile(file, merged);
				current = merged;
				if (apply) await onApply?.(merged);
				return { ...current };
			});
			queue = next.catch(() => {});
			return next;
		},
	};
}
