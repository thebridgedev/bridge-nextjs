'use client';

import type { TeamWorkspace } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';
import { Spinner } from '../sdk-auth/shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onError?: (error: Error) => void;
}

export function TeamWorkspaceForm({ onError, className, style, ...rest }: Props) {
  const [workspace, setWorkspace] = useState<TeamWorkspace | null>(null);
  const [name, setName] = useState('');
  const [locale, setLocale] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bridge = getBridgeAuth();
        const w = await bridge.team.getWorkspace();
        if (!mounted) return;
        setWorkspace(w);
        setName(w.name ?? '');
        setLocale(w.locale ?? '');
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to load workspace');
        if (!mounted) return;
        setError(e.message);
        onError?.(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [onError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const bridge = getBridgeAuth();
      await bridge.team.updateWorkspace({ name, locale });
      setSuccess('Workspace updated successfully.');
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update workspace');
      setError(e.message);
      onError?.(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className} style={style} data-bridge-team-workspace {...rest}>
      <h3 className="bridge-team-section-title">Workspace Settings</h3>

      {loading ? (
        <div className="bridge-team-loading">
          <Spinner size={32} />
          <span>Loading workspace...</span>
        </div>
      ) : (
        <>
          {error && (
            <div className="bridge-team-alert">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
          {success && (
            <div className="bridge-team-alert">
              <Alert variant="success">{success}</Alert>
            </div>
          )}

          {workspace?.logo && (
            <div className="bridge-team-logo">
              <img src={workspace.logo} alt={`${workspace.name} logo`} />
            </div>
          )}

          <form className="bridge-team-form" onSubmit={handleSubmit}>
            <div className="bridge-team-form-group">
              <label htmlFor="bridge-workspace-name">Workspace Name</label>
              <input
                id="bridge-workspace-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="bridge-team-form-group">
              <label htmlFor="bridge-workspace-locale">Locale</label>
              <input
                id="bridge-workspace-locale"
                type="text"
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
                placeholder="en"
                disabled={saving}
              />
            </div>

            {workspace?.plan && (
              <div className="bridge-team-form-group">
                <label>Current Plan</label>
                <div className="bridge-team-readonly">{workspace.plan}</div>
              </div>
            )}

            <div className="bridge-team-form-group">
              <label>MFA</label>
              <div className="bridge-team-readonly">{workspace?.mfa ? 'Enabled' : 'Disabled'}</div>
            </div>

            <div className="bridge-team-form-actions">
              <button
                type="submit"
                className="bridge-btn bridge-btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}

export default TeamWorkspaceForm;
