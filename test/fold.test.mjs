import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PetFold, foldTodos, terminalModeOf, isActivePhase } from '../lib/fold.js';

/**
 * Unit tests for the pure pet fold. The Host bridge only feeds committed
 * SessionEvents into this class, so replaying event sequences here exercises
 * exactly what the desktop pet renders.
 */

/** Build a fake Host Session carrying the fields the fold reads. */
function fakeSession(id, header = {}, events = []) {
	return {
		id,
		header: { id, createdAt: 0, isSeeded: false, ...header },
		ownEvents: () => events,
	};
}

/** Build one committed SessionEvent. */
function ev(type, time, data = {}) {
	return { type, seq: time, time, data };
}

test('foldTodos: counts completed and the in-progress task', () => {
	assert.equal(foldTodos(null), null);
	assert.equal(foldTodos([]), null);
	assert.deepEqual(foldTodos([
		{ content: 'a', status: 'completed' },
		{ content: 'b', status: 'in_progress' },
		{ content: 'c', status: 'pending' },
	]), { done: 1, total: 3, current: 'b' });
});

test('terminalModeOf: maps every turn/end reason class', () => {
	assert.equal(terminalModeOf({ kind: 'completed' }), 'success');
	assert.equal(terminalModeOf({ kind: 'error' }), 'error');
	assert.equal(terminalModeOf({ kind: 'aborted' }), 'aborted');
	assert.equal(terminalModeOf({ kind: 'interrupted' }), 'aborted');
	assert.equal(terminalModeOf({ kind: 'max-tokens' }), 'aborted');
	assert.equal(terminalModeOf(undefined), 'success');
	assert.equal(isActivePhase('thinking'), true);
	assert.equal(isActivePhase('idle'), false);
});

test('fold: register recovers a running turn from the committed log', () => {
	const session = fakeSession('s1', { cwd: '/tmp/project' }, [
		ev('user/message', 100, { role: 'user' }),
		ev('turn/start', 120, { turn: 1 }),
		ev('step/start', 130, { turn: 1, step: 1 }),
		ev('tool/call', 200, { name: 'bash' }),
	]);
	const fold = new PetFold();
	const state = fold.register(session);
	assert.equal(state.title, null);
	assert.equal(state.dirName, 'project');
	assert.equal(state.phase, 'working');
	assert.equal(state.startedAt, 120);
	assert.equal(state.tool.name, 'bash');
});

test('fold: turn lifecycle drives phases and the terminal event', () => {
	const fold = new PetFold();
	const session = fakeSession('s1', { cwd: '/work/demo' });
	fold.register(session);

	fold.applyEvent(session, ev('turn/start', 1000, { turn: 1 }));
	assert.equal(fold.sessionState('s1', 1100).phase, 'thinking');

	fold.applyEvent(session, ev('tool/call', 1500, { name: 'grep' }));
	assert.equal(fold.sessionState('s1', 1600).phase, 'working');
	assert.equal(fold.sessionState('s1', 1600).tool.name, 'grep');
	assert.equal(fold.sessionState('s1', 1600).elapsedMs, 600);

	fold.applyEvent(session, ev('tool/result', 2000, { error: undefined }));
	assert.equal(fold.sessionState('s1', 2100).phase, 'thinking');

	fold.applyEvent(session, ev('turn/end', 5000, { turn: 1, reason: { kind: 'completed' } }));
	const done = fold.sessionState('s1', 5100);
	assert.equal(done.phase, 'idle');
	assert.equal(done.elapsedMs, 0);
	assert.equal(done.tool, null);
	assert.equal(fold.lastEvent.kind, 'success');
	assert.equal(fold.lastEvent.elapsedMs, 4000);
	assert.equal(fold.snapshot(5100).mode, 'success');

	// The success banner expires after its hold window.
	assert.equal(fold.snapshot(5000 + 4000).mode, 'idle');
});

test('fold: error and aborted turn endings report their own mode', () => {
	const fold = new PetFold();
	const session = fakeSession('s1');
	fold.register(session);
	fold.applyEvent(session, ev('turn/start', 0, { turn: 1 }));
	fold.applyEvent(session, ev('turn/end', 1000, { turn: 1, reason: { kind: 'error', error: { message: 'boom' } } }));
	assert.equal(fold.lastEvent.kind, 'error');
	assert.equal(fold.snapshot(1100).mode, 'error');

	const other = fakeSession('s2');
	fold.register(other);
	fold.applyEvent(other, ev('turn/start', 2000, { turn: 1 }));
	fold.applyEvent(other, ev('turn/end', 2100, { turn: 1, reason: { kind: 'interrupted' } }));
	assert.equal(fold.lastEvent.kind, 'aborted');
	assert.equal(fold.snapshot(2200).mode, 'aborted');
});

test('fold: title, todos and subagent flags flow into the snapshot', () => {
	const fold = new PetFold();
	const root = fakeSession('root', { cwd: '/Users/me/projects/alpha' });
	const child = fakeSession('child', { cwd: '/Users/me/projects/alpha', origin: 'subagent', parentSession: 'root' });
	fold.register(root);
	fold.register(child);
	fold.applyEvent(root, ev('session/title', 10, { title: '重构通知插件' }));
	fold.applyEvent(root, ev('todo/write', 20, {
		todos: [
			{ content: 'design', status: 'completed' },
			{ content: 'build', status: 'in_progress' },
		],
	}));
	fold.applyEvent(root, ev('turn/start', 30, { turn: 2 }));
	fold.applyEvent(root, ev('tool/call', 40, { name: 'bash' }));

	const snap = fold.snapshot(1000);
	assert.equal(snap.sessions.length, 1, 'subagent sessions are excluded from the pet display');
	assert.equal(snap.sessions[0].title, '重构通知插件');
	assert.equal(snap.sessions[0].todos.done, 1);
	assert.equal(snap.sessions[0].todos.current, 'build');
	assert.equal(snap.activeCount, 1);
	assert.equal(snap.mode, 'working');
	assert.equal(snap.lastEvent.kind, 'tool');
	assert.equal(snap.lastEvent.tool, 'bash');
});

test('fold: projection hints prefill cold sessions', () => {
	const fold = new PetFold();
	const session = fakeSession('cold', { cwd: '/tmp/x' });
	const state = fold.register(session, { title: '冷会话', todos: [{ content: 'a', status: 'completed' }] });
	assert.equal(state.title, '冷会话');
	assert.deepEqual(state.todos, { done: 1, total: 1, current: '' });
});

test('fold: agent status reconciles a running bit without a live turn', () => {
	const fold = new PetFold();
	const session = fakeSession('s1');
	fold.register(session);
	fold.handleAgentStatus(session, 'running', 1000);
	assert.equal(fold.sessionState('s1', 1100).phase, 'thinking');
	fold.handleAgentStatus(session, 'idle', 2000);
	assert.equal(fold.sessionState('s1', 2100).phase, 'idle');
});

test('fold: sleeps after the quiet window and counts multiple active sessions', () => {
	const fold = new PetFold();
	const a = fakeSession('a');
	const b = fakeSession('b');
	fold.register(a);
	fold.register(b);
	fold.applyEvent(a, ev('turn/start', 0, { turn: 1 }));
	fold.applyEvent(b, ev('turn/start', 0, { turn: 1 }));
	fold.applyEvent(b, ev('tool/call', 100, { name: 'web_search' }));
	const snap = fold.snapshot(200);
	assert.equal(snap.activeCount, 2);
	assert.equal(snap.mode, 'working');
	assert.equal(snap.sessions.length, 2);

	// Finish both turns; the pet dozes off only after a long quiet window.
	fold.applyEvent(a, ev('turn/end', 300, { turn: 1, reason: { kind: 'completed' } }));
	fold.applyEvent(b, ev('turn/end', 300, { turn: 1, reason: { kind: 'completed' } }));
	assert.equal(fold.snapshot(4000).mode, 'idle');
	assert.equal(fold.snapshot(11 * 60 * 1000).mode, 'sleep');
});

test('fold: unknown events are ignored and never throw', () => {
	const fold = new PetFold();
	const session = fakeSession('s1');
	fold.register(session);
	fold.applyEvent(session, { type: 'future/unknown', time: 1, data: {} });
	fold.applyEvent(session, null);
	fold.applyEvent(session, { type: 'turn/start' });
	assert.equal(fold.snapshot(10).mode, 'thinking');
});
