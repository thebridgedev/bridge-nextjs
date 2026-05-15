'use client';

import type { ApiToken, CreateApiTokenInput } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';

type AvailablePrivilege = {
  key: string;
  description?: string;
};

interface Props extends HTMLAttributes<HTMLDivElement> {}

export function ApiTokenManagement({ className, style, ...rest }: Props) {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createExpiry, setCreateExpiry] = useState('');

  const [availablePrivileges, setAvailablePrivileges] = useState<AvailablePrivilege[]>([]);
  const [selectedPrivileges, setSelectedPrivileges] = useState<string[]>([]);
  const [privSearch, setPrivSearch] = useState('');
  const [privDropdownOpen, setPrivDropdownOpen] = useState(false);

  const [newToken, setNewToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);

  const [revokeTarget, setRevokeTarget] = useState<ApiToken | null>(null);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await getBridgeAuth().apiTokens.listTokens();
        if (mounted) setTokens(list);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : 'Failed to load API tokens');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!showCreateForm) return;
    (async () => {
      try {
        const list = await (getBridgeAuth().apiTokens as any).listAvailablePrivileges?.();
        if (Array.isArray(list)) setAvailablePrivileges(list);
      } catch {
        /* non-fatal — picker shows empty */
      }
    })();
  }, [showCreateForm]);

  useEffect(() => {
    if (!privDropdownOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      const picker = document.querySelector('.bridge-privilege-picker');
      if (picker && !picker.contains(e.target as Node)) setPrivDropdownOpen(false);
    }
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [privDropdownOpen]);

  function resetCreateForm() {
    setCreateName('');
    setSelectedPrivileges([]);
    setPrivSearch('');
    setPrivDropdownOpen(false);
    setCreateExpiry('');
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const input: CreateApiTokenInput = {
        name: createName.trim(),
        privileges: selectedPrivileges,
        expireAt: createExpiry || undefined,
      };
      const result = await getBridgeAuth().apiTokens.createToken(input);
      setNewToken(result.token);
      setTokens((prev) => [result.record, ...prev]);
      setShowCreateForm(false);
      resetCreateForm();
      setSuccess('Token created. Copy it now — it will not be shown again.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
    } finally {
      setCreating(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevoking(true);
    setError(null);
    try {
      await getBridgeAuth().apiTokens.revokeToken(revokeTarget.id);
      setTokens((prev) => prev.filter((t) => t.id !== revokeTarget.id));
      setSuccess(`Token "${revokeTarget.name}" revoked.`);
      setRevokeDialogOpen(false);
      setRevokeTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke token');
    } finally {
      setRevoking(false);
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess('Copied to clipboard!');
      setTimeout(() => setSuccess(null), 3000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }

  function formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString();
  }

  const filteredPrivileges = availablePrivileges.filter(
    (p) =>
      !selectedPrivileges.includes(p.key) &&
      p.key.toLowerCase().includes(privSearch.toLowerCase())
  );

  return (
    <>
      <div
        className={className}
        style={style}
        data-bridge-api-tokens
        data-loading={loading}
        data-creating={creating}
        {...rest}
      >
        <div className="bridge-api-header">
          <div>
            <h2 className="bridge-api-title">API Tokens</h2>
            <p className="bridge-api-subtitle">
              Long-lived JWT tokens for programmatic API access.
            </p>
          </div>
          <button
            type="button"
            className="bridge-btn bridge-btn-primary"
            onClick={() => {
              setShowCreateForm((v) => {
                const next = !v;
                if (!next) resetCreateForm();
                return next;
              });
            }}
          >
            {showCreateForm ? '✕ Cancel' : '+ Create Token'}
          </button>
        </div>

        {error && <div className="bridge-api-error-banner">{error}</div>}
        {success && <div className="bridge-api-success-banner">{success}</div>}

        {newToken && (
          <div className="bridge-api-new-token-banner">
            <p className="bridge-api-new-token-warning">
              ⚠ Store this token securely — you won't be able to see it again.
            </p>
            <div className="bridge-api-new-token-row">
              <input
                className="bridge-input bridge-api-token-input"
                type={showToken ? 'text' : 'password'}
                readOnly
                value={newToken}
              />
              <button
                type="button"
                className="bridge-btn-outline"
                onClick={() => setShowToken((v) => !v)}
                title={showToken ? 'Hide token' : 'Show token'}
              >
                {showToken ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                className="bridge-btn-outline"
                onClick={() => copyToClipboard(newToken)}
              >
                Copy
              </button>
            </div>
            <button
              type="button"
              className="bridge-btn-outline"
              onClick={() => {
                setNewToken(null);
                setShowToken(false);
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {showCreateForm && (
          <div className="bridge-api-inline-form">
            <h3 className="bridge-api-inline-form-title">New API Token</h3>
            <form className="bridge-api-inline-form-fields" onSubmit={handleCreate}>
              <div className="bridge-api-inline-form-row">
                <div className="bridge-api-inline-field">
                  <label className="bridge-label" htmlFor="token-name">
                    Name <span className="bridge-api-required">*</span>
                  </label>
                  <input
                    id="token-name"
                    className="bridge-input"
                    type="text"
                    placeholder="e.g. CI pipeline token"
                    required
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                  />
                </div>
                <div className="bridge-api-inline-field">
                  <label className="bridge-label">Privileges</label>
                  <div className="bridge-privilege-picker" data-open={privDropdownOpen}>
                    <div
                      className="bridge-privilege-chips"
                      onClick={() => setPrivDropdownOpen((v) => !v)}
                    >
                      {selectedPrivileges.map((priv) => (
                        <span key={priv} className="bridge-privilege-chip">
                          {priv}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPrivileges((prev) => prev.filter((p) => p !== priv));
                            }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {selectedPrivileges.length === 0 && (
                        <span className="bridge-privilege-placeholder">Select privileges…</span>
                      )}
                    </div>
                    {privDropdownOpen && (
                      <div className="bridge-privilege-dropdown">
                        <input
                          className="bridge-privilege-search"
                          type="text"
                          placeholder="Search…"
                          value={privSearch}
                          onChange={(e) => setPrivSearch(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        {filteredPrivileges.length === 0 ? (
                          <div className="bridge-privilege-empty">No privileges found</div>
                        ) : (
                          filteredPrivileges.map((priv) => (
                            <button
                              key={priv.key}
                              type="button"
                              className="bridge-privilege-option"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedPrivileges((prev) => [...prev, priv.key]);
                                setPrivSearch('');
                              }}
                            >
                              <span className="bridge-privilege-option-key">{priv.key}</span>
                              {priv.description && (
                                <span className="bridge-privilege-option-desc">
                                  {priv.description}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div className="bridge-api-inline-field bridge-api-inline-field--narrow">
                  <label className="bridge-label" htmlFor="token-expiry">
                    Expiry (optional)
                  </label>
                  <input
                    id="token-expiry"
                    className="bridge-input"
                    type="date"
                    value={createExpiry}
                    onChange={(e) => setCreateExpiry(e.target.value)}
                  />
                </div>
              </div>
              <div className="bridge-api-inline-form-actions">
                <button
                  type="submit"
                  className="bridge-btn bridge-btn-primary"
                  disabled={creating || !createName.trim()}
                >
                  {creating ? 'Creating…' : 'Create Token'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bridge-api-table-wrapper">
          {loading ? (
            <div className="bridge-api-empty">Loading…</div>
          ) : tokens.length === 0 ? (
            <div className="bridge-api-empty">
              No API tokens yet. Create one to get started.
            </div>
          ) : (
            <table className="bridge-api-table">
              <thead className="bridge-api-table-head">
                <tr>
                  <th className="bridge-api-th">Name</th>
                  <th className="bridge-api-th">Privileges</th>
                  <th className="bridge-api-th">Created</th>
                  <th className="bridge-api-th">Expires</th>
                  <th className="bridge-api-th"></th>
                </tr>
              </thead>
              <tbody>
                {tokens.map((token) => (
                  <tr key={token.id} className="bridge-api-row">
                    <td className="bridge-api-td-name">{token.name}</td>
                    <td className="bridge-api-td">
                      <div className="bridge-api-privileges">
                        {token.privileges.map((priv) => (
                          <span key={priv} className="bridge-badge">
                            {priv}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="bridge-api-td-muted">{formatDate(token.createdAt)}</td>
                    <td className="bridge-api-td-muted">{formatDate(token.expireAt)}</td>
                    <td className="bridge-api-td-actions">
                      <button
                        type="button"
                        className="bridge-btn-danger-sm"
                        onClick={() => {
                          setRevokeTarget(token);
                          setRevokeDialogOpen(true);
                        }}
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {revokeDialogOpen && (
        <>
          <div
            className="bridge-dialog-overlay"
            role="presentation"
            onClick={() => {
              setRevokeDialogOpen(false);
              setRevokeTarget(null);
            }}
          />
          <div className="bridge-dialog" role="dialog" aria-modal="true">
            <h3 className="bridge-dialog-title">Revoke token?</h3>
            <p className="bridge-dialog-body">
              Token <strong>{revokeTarget?.name}</strong> will be permanently revoked and can no longer be used.
            </p>
            <div className="bridge-dialog-footer">
              <button
                type="button"
                className="bridge-btn-outline"
                onClick={() => {
                  setRevokeDialogOpen(false);
                  setRevokeTarget(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bridge-btn bridge-btn-danger"
                disabled={revoking}
                onClick={confirmRevoke}
              >
                {revoking ? 'Revoking…' : 'Revoke'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default ApiTokenManagement;
