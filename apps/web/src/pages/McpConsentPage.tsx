import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { mcpApi } from '@/api/client';
import type { McpAccessWithTitle } from '@/api/client';
import type { McpOAuthClientInfo } from '@nonotion/shared';

/**
 * OAuth consent screen for MCP clients. The API's /mcp/oauth/authorize
 * endpoint redirects here with the original authorize query params; on
 * approval the API issues a single-use code and we navigate back to the
 * client's redirect_uri.
 */
export default function McpConsentPage() {
  const [searchParams] = useSearchParams();
  const [client, setClient] = useState<McpOAuthClientInfo | null>(null);
  const [enabledDatabases, setEnabledDatabases] = useState<McpAccessWithTitle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const clientId = searchParams.get('client_id') ?? '';
  const redirectUri = searchParams.get('redirect_uri') ?? '';
  const state = searchParams.get('state') ?? undefined;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clientInfo, access] = await Promise.all([
          mcpApi.getOAuthClientInfo(clientId),
          mcpApi.listAccess(),
        ]);
        if (cancelled) return;
        setClient(clientInfo);
        setEnabledDatabases(access.filter((a) => a.enabled));
      } catch {
        if (!cancelled) setError('Invalid or unknown connection request.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const handleApprove = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { redirectUrl } = await mcpApi.approveConsent({
        clientId,
        redirectUri,
        codeChallenge: searchParams.get('code_challenge') ?? '',
        codeChallengeMethod: (searchParams.get('code_challenge_method') ?? 'S256') as 'S256',
        state,
        scope: searchParams.get('scope') ?? undefined,
      });
      window.location.href = redirectUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to authorize');
      setSubmitting(false);
    }
  };

  const handleDeny = () => {
    try {
      const url = new URL(redirectUri);
      url.searchParams.set('error', 'access_denied');
      if (state) url.searchParams.set('state', state);
      window.location.href = url.toString();
    } catch {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-notion-bg">
      <div className="w-full max-w-md px-8 py-10">
        <div className="bg-white border border-notion-border rounded-lg shadow-sm p-8">
          {loading ? (
            <div className="text-center text-notion-text-secondary">Loading…</div>
          ) : !client ? (
            <div className="text-center">
              <h1 className="text-xl font-bold text-notion-text mb-2">Connection error</h1>
              <p className="text-notion-text-secondary">{error ?? 'Unknown client.'}</p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-notion-text">Connect to Nonotion</h1>
                <p className="text-notion-text-secondary mt-2">
                  <span className="font-medium text-notion-text">{client.name}</span> is requesting{' '}
                  <span className="font-medium">read-only</span> access to the databases you have
                  enabled for MCP.
                </p>
              </div>

              <div className="mb-6">
                <div className="text-sm font-medium text-notion-text mb-2">
                  Databases currently enabled for MCP
                </div>
                {enabledDatabases.length === 0 ? (
                  <p className="text-sm text-notion-text-secondary">
                    None yet — you can enable databases from the database toolbar. The connection
                    will see nothing until you do.
                  </p>
                ) : (
                  <ul className="text-sm text-notion-text space-y-1">
                    {enabledDatabases.map((db) => (
                      <li key={db.databaseId} className="flex items-center gap-2">
                        <span>{db.databaseIcon ?? '🗃️'}</span>
                        <span>{db.databaseTitle ?? db.databaseId}</span>
                        {db.allowImages && (
                          <span className="text-xs text-notion-text-secondary">(images)</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md border border-red-200 mb-4">
                  {error}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleDeny}
                  disabled={submitting}
                  className="flex-1 py-2 px-4 border border-notion-border text-notion-text rounded-md hover:bg-notion-bg focus:outline-none disabled:opacity-50"
                >
                  Deny
                </button>
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {submitting ? 'Connecting…' : 'Approve'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
