/**
 * Handoff between the canvas drop handler and block edit components.
 * The drop handler creates a block first (instant placeholder, correct ordering
 * for multi-file drops), then stashes the dropped File under the new block's id;
 * the mounted edit component (FileEdit/ImageEdit) claims it and runs its own
 * upload path (validation, spinner, inline errors). Keyed by the client temp id,
 * which blockStore keeps as the canonical block key — no remount, no id swap.
 *
 * Delivery is order-independent: React mounts the block synchronously for
 * discrete events (drop), which can happen before OR after the stash microtask —
 * whichever side arrives second completes the handoff.
 */
const pendingUploads = new Map<string, File>();
const waiters = new Map<string, (file: File) => void>();

export function stashPendingUpload(blockId: string, file: File): void {
  const waiter = waiters.get(blockId);
  if (waiter) {
    waiters.delete(blockId);
    waiter(file);
    return;
  }
  pendingUploads.set(blockId, file);
}

/**
 * Claim the pending upload for a block: delivers immediately if already stashed,
 * otherwise waits for the stash. Returns an unsubscribe for unmount cleanup.
 */
export function claimPendingUpload(blockId: string, onFile: (file: File) => void): () => void {
  const file = pendingUploads.get(blockId);
  if (file) {
    pendingUploads.delete(blockId);
    onFile(file);
    return () => {};
  }
  waiters.set(blockId, onFile);
  return () => {
    if (waiters.get(blockId) === onFile) waiters.delete(blockId);
  };
}
