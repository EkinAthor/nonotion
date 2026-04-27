import type { Executor, ScopeId, UndoEntry } from './undoTypes';

const MAX_STACK_DEPTH = 200;

interface ScopeState {
  undo: UndoEntry[];
  redo: UndoEntry[];
  txDepth: number;
  txBuffer: UndoEntry[];
  txLabel: string | undefined;
}

const scopes = new Map<ScopeId, ScopeState>();
const executors: Executor[] = [];
let applying = false;

function getOrCreateScope(scopeId: ScopeId): ScopeState {
  let scope = scopes.get(scopeId);
  if (!scope) {
    scope = { undo: [], redo: [], txDepth: 0, txBuffer: [], txLabel: undefined };
    scopes.set(scopeId, scope);
  }
  return scope;
}

function genId(): string {
  return 'ue_' + Math.random().toString(36).slice(2, 11);
}

export function isApplying(): boolean {
  return applying;
}

export async function withApplying<T>(fn: () => Promise<T> | T): Promise<T> {
  const prev = applying;
  applying = true;
  try {
    return await fn();
  } finally {
    applying = prev;
  }
}

export function registerExecutor(executor: Executor): void {
  executors.push(executor);
}

function findExecutor(entry: UndoEntry): Executor | undefined {
  return executors.find((e) => e.matches(entry));
}

export function pushEntry(scopeId: ScopeId, entry: UndoEntry): void {
  if (applying) return;
  const scope = getOrCreateScope(scopeId);

  if (scope.txDepth > 0) {
    scope.txBuffer.push(entry);
    return;
  }

  scope.undo.push(entry);
  if (scope.undo.length > MAX_STACK_DEPTH) {
    scope.undo.shift();
  }
  // New action invalidates the redo stack.
  scope.redo.length = 0;
}

export function beginTransaction(scopeId: ScopeId, label?: string): void {
  const scope = getOrCreateScope(scopeId);
  scope.txDepth += 1;
  if (scope.txDepth === 1) {
    scope.txBuffer = [];
    scope.txLabel = label;
  }
}

export function endTransaction(scopeId: ScopeId): void {
  const scope = scopes.get(scopeId);
  if (!scope || scope.txDepth === 0) return;
  scope.txDepth -= 1;
  if (scope.txDepth > 0) return;

  const buffered = scope.txBuffer;
  const label = scope.txLabel ?? 'change';
  scope.txBuffer = [];
  scope.txLabel = undefined;

  if (buffered.length === 0) return;

  if (buffered.length === 1) {
    pushEntry(scopeId, buffered[0]);
    return;
  }

  const composite: UndoEntry = {
    id: genId(),
    scopeId,
    payload: { kind: 'composite', entries: buffered },
    label,
    timestamp: Date.now(),
    selectionBefore: buffered[0].selectionBefore,
    selectionAfter: buffered[buffered.length - 1].selectionAfter,
  };
  pushEntry(scopeId, composite);
}

export function clearScope(scopeId: ScopeId): void {
  scopes.delete(scopeId);
}

export function clearAll(): void {
  scopes.clear();
}

export async function undo(scopeId: ScopeId): Promise<boolean> {
  const scope = scopes.get(scopeId);
  if (!scope || scope.undo.length === 0) return false;
  const entry = scope.undo.pop()!;
  try {
    await applyEntry(entry, 'undo');
    scope.redo.push(entry);
    return true;
  } catch (error) {
    console.error('[undo] inverse failed; clearing scope', scopeId, error);
    clearScope(scopeId);
    return false;
  }
}

export async function redo(scopeId: ScopeId): Promise<boolean> {
  const scope = scopes.get(scopeId);
  if (!scope || scope.redo.length === 0) return false;
  const entry = scope.redo.pop()!;
  try {
    await applyEntry(entry, 'redo');
    scope.undo.push(entry);
    return true;
  } catch (error) {
    console.error('[redo] forward failed; clearing scope', scopeId, error);
    clearScope(scopeId);
    return false;
  }
}

async function applyEntry(entry: UndoEntry, direction: 'undo' | 'redo'): Promise<void> {
  if (entry.payload.kind === 'composite') {
    const children = entry.payload.entries;
    const ordered = direction === 'undo' ? [...children].reverse() : children;
    await withApplying(async () => {
      for (const child of ordered) {
        await applyEntry(child, direction);
      }
    });
    return;
  }

  const executor = findExecutor(entry);
  if (!executor) {
    throw new Error(`No executor for entry kind: ${entry.payload.kind}`);
  }

  await withApplying(() => executor.apply(entry, direction));
}

// Test/debug helpers (not used in production code paths).
export function _peekStacks(scopeId: ScopeId): { undo: number; redo: number } | null {
  const scope = scopes.get(scopeId);
  if (!scope) return null;
  return { undo: scope.undo.length, redo: scope.redo.length };
}

export function makeEntryId(): string {
  return genId();
}
