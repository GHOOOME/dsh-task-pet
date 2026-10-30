/**
 * Greninja pet — pure session-event fold.
 *
 * The pet is a projection over the Host session journal, exactly like the
 * repo's session projections: every committed `session/event` advances a
 * per-session state, and a global aggregate decides which animation plays.
 * Nothing here touches the filesystem, the network, timers, or Cordis — the
 * Host bridge feeds it events and serializes `snapshot()` over loopback.
 *
 * Session events of interest (see the Host `session/event` contract):
 *   turn/start, step/start, tool/call, tool/result, turn/end,
 *   assistant/message, session/title, todo/write
 * Unknown event types are ignored (forward-compatible).
 */

/** Aggregate pet modes the desktop app can render. */
export const PET_MODES = Object.freeze(['idle', 'thinking', 'working', 'streaming', 'success', 'error', 'aborted', 'sleep']);

/** Completion/error banners stay up for this long after the terminal event. */
const TERMINAL_HOLD_MS = 3200;
/** After this much quiet time the pet dozes off. */
const SLEEP_AFTER_MS = 10 * 60 * 1000;
/** How many recent events are scanned when reconstructing a pre-existing session. */
const RECOVERY_SCAN_LIMIT = 400;

/** Sortable title for a session, falling back to its directory name or id. */
function titleOf(state) {
	return state.title ?? state.dirName ?? `会话 ${String(state.id).slice(-6)}`;
}

/** Base name of a directory path, without relying on node:path (pure module). */
function baseName(path) {
	if (typeof path !== 'string') return null;
	const trimmed = path.replace(/[\\/]+$/u, '');
	const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
	const name = index >= 0 ? trimmed.slice(index + 1) : trimmed;
	return name === '' ? null : name;
}

/**
 * Fold a `todo/write` payload into display counts.
 * @param todos - the model's complete todo list (or null).
 * @returns `{ done, total, current }`, or null when there is no list.
 */
export function foldTodos(todos) {
	if (!Array.isArray(todos) || todos.length === 0) return null;
	let done = 0;
	let current = '';
	for (const item of todos) {
		if (item === null || typeof item !== 'object') continue;
		if (item.status === 'completed') done += 1;
		else if (current === '' && item.status === 'in_progress' && typeof item.content === 'string') current = item.content;
	}
	return { done, total: todos.length, current };
}

/** Whether a phase means the session is working right now. */
export function isActivePhase(phase) {
	return phase === 'thinking' || phase === 'working' || phase === 'streaming';
}

/** Decode one turn/end reason into the pet's terminal mode. */
export function terminalModeOf(reason) {
	const kind = reason !== null && typeof reason === 'object' ? reason.kind : reason;
	if (kind === 'completed') return 'success';
	if (kind === 'error') return 'error';
	if (kind === 'max-tokens') return 'aborted';
	if (kind === 'blocked') return 'aborted';
	if (kind === 'aborted' || kind === 'interrupted' || kind === 'forked') return 'aborted';
	return 'success';
}

/**
 * One fold of the whole pet state.
 *
 * Telemetry caveat: the Host plugin runs in the same process as the agents, so
 * this class only ever *reads* committed events. It never calls a Session or
 * Agent method that could resume an agent.
 */
export class PetFold {
	/**
	 * @param options - `{ titleFallback: (header) => string | null }`.
	 */
	constructor(options = {}) {
		this.sessions = new Map();
		this.seq = 0;
		this.lastEvent = null;
		this.lastActivityAt = 0;
		this.titleFallback = typeof options.titleFallback === 'function' ? options.titleFallback : header => baseName(header?.cwd);
	}

	/**
	 * Register a session and recover the state it had before this plugin loaded.
	 * @param session - Host Session (its id + header are read; log is read-only).
	 * @param hints - optional projection values (`title`, `todos`) for cold sessions.
	 * @returns the tracked state.
	 */
	register(session, hints) {
		const existing = this.sessions.get(session.id);
		if (existing !== undefined) return existing;
		const header = session.header ?? {};
		const state = {
			id: session.id,
			dirName: baseName(header.cwd),
			isSubagent: header.origin === 'subagent' || header.parentSession !== undefined,
			title: typeof hints?.title === 'string' && hints.title !== '' ? hints.title : null,
			phase: 'idle',
			turn: null,
			step: null,
			startedAt: null,
			tool: null,
			todos: foldTodos(hints?.todos),
			lastEventAt: 0,
			lastDone: null,
		};
		this.sessions.set(session.id, state);
		this.#recover(session, state);
		return state;
	}

	/**
	 * Apply one committed session event.
	 * @param session - the Session whose log grew.
	 * @param event - the appended SessionEvent.
	 * @returns nothing.
	 */
	applyEvent(session, event) {
		if (event === null || typeof event !== 'object') return;
		const state = this.register(session);
		const at = typeof event.time === 'number' ? event.time : Date.now();
		state.lastEventAt = at;
		this.lastActivityAt = Math.max(this.lastActivityAt, at);
		const data = event.data ?? {};
		switch (event.type) {
			case 'turn/start': {
				state.phase = 'thinking';
				state.turn = data.turn ?? state.turn;
				state.startedAt = at;
				state.tool = null;
				this.#emit({ kind: 'turn_start', session: state, at });
				return;
			}
			case 'step/start': {
				state.step = data.step ?? state.step;
				if (state.tool === null && (state.phase === 'idle' || state.phase === 'thinking')) state.phase = 'thinking';
				return;
			}
			case 'tool/call': {
				state.phase = 'working';
				state.tool = { name: String(data.name ?? 'tool'), startedAt: at };
				this.#emit({ kind: 'tool', session: state, at, tool: state.tool.name });
				return;
			}
			case 'tool/result': {
				const tool = state.tool?.name ?? null;
				state.tool = null;
				if (state.phase === 'working') state.phase = 'thinking';
				this.#emit({ kind: 'tool_result', session: state, at, tool, ok: data.error === undefined });
				return;
			}
			case 'assistant/message': {
				if (state.phase !== 'working') state.phase = 'streaming';
				return;
			}
			case 'turn/end': {
				const mode = terminalModeOf(data.reason);
				const elapsedMs = typeof state.startedAt === 'number' ? Math.max(0, at - state.startedAt) : 0;
				const todos = state.todos;
				state.phase = 'idle';
				state.startedAt = null;
				state.turn = null;
				state.tool = null;
				state.lastDone = { mode, at, elapsedMs };
				this.#emit({ kind: mode, session: state, at, elapsedMs, reason: data.reason ?? null, todos });
				return;
			}
			case 'session/title': {
				if (typeof data.title === 'string' && data.title.trim() !== '') state.title = data.title.trim();
				return;
			}
			case 'todo/write': {
				state.todos = foldTodos(data.todos);
				return;
			}
			default:
				return;
		}
	}

	/**
	 * Reconcile one Agent's running bit without inventing turn history.
	 * @param session - the Agent's Session.
	 * @param status - `running` or `idle`.
	 * @param now - current epoch milliseconds.
	 */
	handleAgentStatus(session, status, now = Date.now()) {
		const state = this.register(session);
		if (status === 'running' && state.phase === 'idle' && state.turn === null) {
			state.phase = 'thinking';
			state.startedAt = now;
		} else if (status !== 'running' && state.phase !== 'idle' && state.turn === null) {
			state.phase = 'idle';
			state.startedAt = null;
		}
	}

	/** Record one observable event in the rolling "last event" slot. */
	#emit(partial) {
		this.seq += 1;
		this.lastEvent = { ...partial, seq: this.seq };
	}

	/**
	 * Read one session's current display state.
	 * @param id - session id.
	 * @param now - current epoch milliseconds.
	 * @returns the display state, or undefined.
	 */
	sessionState(id, now = Date.now()) {
		const state = this.sessions.get(id);
		if (state === undefined) return undefined;
		return {
			id: state.id,
			title: titleOf(state),
			isSubagent: state.isSubagent,
			phase: state.phase,
			elapsedMs: typeof state.startedAt === 'number' ? Math.max(0, now - state.startedAt) : 0,
			tool: state.tool === null ? null : { name: state.tool.name, elapsedMs: Math.max(0, now - state.tool.startedAt) },
			todos: state.todos,
			lastEventAt: state.lastEventAt,
		};
	}

	/**
	 * Serialize the state the desktop pet polls.
	 * @param now - current epoch milliseconds.
	 * @returns a JSON-safe aggregate snapshot.
	 */
	snapshot(now = Date.now()) {
		const top = [...this.sessions.values()].filter(state => !state.isSubagent);
		const active = top.filter(state => isActivePhase(state.phase));
		const last = this.lastEvent;
		let mode = 'idle';
		if (last !== null && now - last.at <= TERMINAL_HOLD_MS) {
			mode = last.kind === 'success' ? 'success' : last.kind === 'error' ? 'error' : last.kind === 'aborted' ? 'aborted' : null;
		}
		if (mode === null || mode === 'idle') {
			if (active.some(state => state.phase === 'working')) mode = 'working';
			else if (active.some(state => state.phase === 'streaming')) mode = 'streaming';
			else if (active.length > 0) mode = 'thinking';
			else mode = 'idle';
			if (mode === 'idle' && this.lastActivityAt > 0 && now - this.lastActivityAt > SLEEP_AFTER_MS) mode = 'sleep';
		}
		const sessions = top
			.sort((a, b) => b.lastEventAt - a.lastEventAt)
			.slice(0, 6)
			.map(state => ({
				id: state.id,
				title: titleOf(state),
				phase: state.phase,
				elapsedMs: typeof state.startedAt === 'number' ? Math.max(0, now - state.startedAt) : 0,
				tool: state.tool === null ? null : { name: state.tool.name, elapsedMs: Math.max(0, now - state.tool.startedAt) },
				todos: state.todos,
				lastEventAt: state.lastEventAt,
			}));
		return {
			version: 1,
			now,
			seq: this.seq,
			mode,
			activeCount: active.length,
			sessionCount: top.length,
			sessions,
			lastActivityAt: this.lastActivityAt,
			lastEvent: last === null ? null : {
				seq: last.seq,
				kind: last.kind,
				at: last.at,
				title: titleOf(last.session),
				sessionId: last.session.id,
				elapsedMs: last.elapsedMs ?? 0,
				tool: last.tool ?? null,
				ok: last.ok ?? null,
				reason: last.reason ?? null,
				todos: last.todos ?? null,
			},
		};
	}

	/**
	 * Rebuild the live turn state from the committed tail of a session that was
	 * already running when this plugin loaded. Bounded scan; never throws.
	 * @param session - Host Session (read-only log access via ownEvents()).
	 * @param state - the state to fill.
	 */
	#recover(session, state) {
		try {
			const events = typeof session.ownEvents === 'function' ? session.ownEvents() : [];
			if (!Array.isArray(events) || events.length === 0) return;
			const start = Math.max(0, events.length - RECOVERY_SCAN_LIMIT);
			let sawTitle = state.title !== null;
			let sawTodos = state.todos !== null;
			let turnStartAt = null;
			let turnNumber = null;
			let toolCallName = null;
			let toolCallAt = null;
			let sawToolResultAfterCall = false;
			for (let index = events.length - 1; index >= start; index -= 1) {
				const event = events[index];
				const type = event?.type;
				if (type === 'session/title' && !sawTitle && typeof event.data?.title === 'string' && event.data.title !== '') {
					state.title = event.data.title;
					sawTitle = true;
					continue;
				}
				if (type === 'todo/write' && !sawTodos) {
					state.todos = foldTodos(event.data?.todos);
					sawTodos = true;
					continue;
				}
				if (turnStartAt !== null) continue;
				if (type === 'turn/end') {
					if (turnStartAt === null && state.lastDone === null) {
						const mode = terminalModeOf(event.data?.reason);
						state.lastDone = { mode, at: event.time ?? 0, elapsedMs: 0 };
					}
					return;
				}
				if (type === 'tool/result') {
					if (toolCallName !== null) sawToolResultAfterCall = true;
					continue;
				}
				if (type === 'tool/call' && toolCallName === null) {
					toolCallName = String(event.data?.name ?? 'tool');
					toolCallAt = event.time ?? null;
					continue;
				}
				if (type === 'turn/start') {
					turnStartAt = event.time ?? null;
					turnNumber = event.data?.turn ?? null;
				}
			}
			if (turnStartAt !== null) {
				state.phase = toolCallName !== null && !sawToolResultAfterCall ? 'working' : 'thinking';
				state.startedAt = turnStartAt;
				state.turn = turnNumber;
				if (toolCallName !== null && !sawToolResultAfterCall) {
					state.tool = { name: toolCallName, startedAt: toolCallAt ?? turnStartAt };
				}
			}
		} catch (error) {
			/* Recovery is best-effort; fresh events still drive the fold. */
		}
	}
}
