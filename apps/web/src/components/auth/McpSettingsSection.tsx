import { useEffect, useState, FormEvent } from 'react';
import { mcpApi } from '@/api/client';
import type { McpAccessWithTitle } from '@/api/client';
import type { McpTokenMeta } from '@nonotion/shared';
import ConfirmDialog from '@/components/common/ConfirmDialog';

/**
 * MCP section of Account settings: personal access token management plus a
 * revocation overview of the databases the user has enabled for MCP.
 */
export default function McpSettingsSection() {
  const [tokens, setTokens] = useState<McpTokenMeta[]>([]);
  const [access, setAccess] = useState<McpAccessWithTitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<McpTokenMeta | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const [tokenList, accessList] = await Promise.all([mcpApi.listTokens(), mcpApi.listAccess()]);
      setTokens(tokenList);
      setAccess(accessList.filter((a) => a.enabled));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MCP settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await mcpApi.createToken(newTokenName.trim());
      setCreatedToken(result.token);
      setCopied(false);
      setNewTokenName('');
      setCreating(false);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await mcpApi.revokeToken(revokeTarget.id);
      setRevokeTarget(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    } finally {
      setBusy(false);
    }
  };

  const handleDisableDatabase = async (databaseId: string) => {
    setBusy(true);
    try {
      await mcpApi.setAccess(databaseId, { enabled: false });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable database');
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!createdToken) return;
    await navigator.clipboard.writeText(createdToken);
    setCopied(true);
  };

  return (
    <section className="border-t border-notion-border pt-6">
      <div>
        <h3 className="text-sm font-medium text-notion-text">Claude / MCP access</h3>
        <p className="text-sm text-notion-text-secondary mt-1">
          Personal access tokens let Claude Code and other MCP clients read the databases you have
          enabled for MCP.
        </p>
      </div>

      {error && (
        <div className="mt-3 p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200">
          {error}
        </div>
      )}

      {createdToken && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <p className="text-sm text-amber-800 font-medium">
            Copy your token now — it will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 text-xs bg-white border border-amber-200 rounded px-2 py-1.5 break-all select-all">
              {createdToken}
            </code>
            <button
              onClick={copyToken}
              className="shrink-0 text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setCreatedToken(null)}
            className="mt-2 text-xs text-amber-700 hover:underline"
          >
            Done, hide token
          </button>
        </div>
      )}

      {/* Token list */}
      <div className="mt-3">
        {loading ? (
          <p className="text-sm text-notion-text-secondary">Loading…</p>
        ) : tokens.length === 0 ? (
          <p className="text-sm text-notion-text-secondary">No access tokens yet.</p>
        ) : (
          <ul className="divide-y divide-notion-border border border-notion-border rounded-md">
            {tokens.map((token) => (
              <li key={token.id} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <div className="text-sm text-notion-text truncate">{token.name}</div>
                  <div className="text-xs text-notion-text-secondary">
                    …{token.tokenSuffix} · created {new Date(token.createdAt).toLocaleDateString()}
                    {token.lastUsedAt
                      ? ` · last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                      : ' · never used'}
                  </div>
                </div>
                <button
                  onClick={() => setRevokeTarget(token)}
                  className="shrink-0 text-sm px-2 py-1 text-red-600 hover:bg-red-50 rounded-md"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <form onSubmit={handleCreate} className="mt-2 flex items-center gap-2">
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              autoFocus
              maxLength={100}
              placeholder="Token name (e.g. Claude Code laptop)"
              className="flex-1 px-3 py-1.5 text-sm border border-notion-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy || newTokenName.trim().length === 0}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="text-sm px-2 py-1.5 text-notion-text-secondary hover:bg-notion-hover rounded-md"
            >
              Cancel
            </button>
          </form>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mt-2 text-sm px-3 py-1.5 border border-notion-border rounded-md text-notion-text hover:bg-notion-hover"
          >
            Create token
          </button>
        )}
      </div>

      {/* MCP-enabled databases overview */}
      <div className="mt-4">
        <div className="text-sm font-medium text-notion-text">Databases enabled for MCP</div>
        {loading ? null : access.length === 0 ? (
          <p className="text-sm text-notion-text-secondary mt-1">
            None — enable a database from its toolbar (MCP button).
          </p>
        ) : (
          <ul className="mt-1 space-y-1">
            {access.map((a) => (
              <li key={a.databaseId} className="flex items-center gap-2 text-sm text-notion-text">
                <span>{a.databaseIcon ?? '🗃️'}</span>
                <span className="truncate">{a.databaseTitle ?? a.databaseId}</span>
                {a.allowImages && (
                  <span className="text-xs text-notion-text-secondary">(images)</span>
                )}
                <button
                  onClick={() => handleDisableDatabase(a.databaseId)}
                  disabled={busy}
                  className="ml-auto shrink-0 text-xs px-2 py-0.5 text-red-600 hover:bg-red-50 rounded"
                >
                  Disable
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        isOpen={revokeTarget !== null}
        title="Revoke token"
        message={`Revoke "${revokeTarget?.name}"? Clients using this token will immediately lose access.`}
        confirmLabel="Revoke"
        destructive
        busy={busy}
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </section>
  );
}
