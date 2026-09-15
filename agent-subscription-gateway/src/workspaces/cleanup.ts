import type { RunStore } from "../storage/run-store";
import type { WorkspaceManager } from "./workspace-manager";

export async function cleanupExpiredWorkspaces(
  store: RunStore,
  manager: Pick<WorkspaceManager, "remove">,
  before: number,
): Promise<string[]> {
  const removed: string[] = [];
  for (const run of store.listWorkspaceCleanupCandidates(before)) {
    if (!run.workspacePath) continue;
    await manager.remove(run.workspacePath);
    if (store.clearWorkspace(run.provider, run.runId, run.workspacePath)) {
      removed.push(run.workspacePath);
    }
  }
  return removed;
}

export function startWorkspaceCleanup(options: {
  store: RunStore;
  manager: Pick<WorkspaceManager, "remove">;
  retentionMs: number;
  intervalMs: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}): () => void {
  if (!Number.isInteger(options.retentionMs) || options.retentionMs < 1) {
    throw new Error("Workspace retention must be a positive integer.");
  }
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 1) {
    throw new Error("Workspace cleanup interval must be a positive integer.");
  }

  let running = false;
  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      await cleanupExpiredWorkspaces(
        options.store,
        options.manager,
        (options.now?.() ?? Date.now()) - options.retentionMs,
      );
    } catch (error) {
      options.onError?.(error);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void sweep(), options.intervalMs);
  timer.unref();
  void sweep();
  return () => clearInterval(timer);
}
