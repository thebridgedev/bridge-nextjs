'use client';

import type { TeamUser } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';

interface Props extends HTMLAttributes<HTMLDialogElement> {
  open?: boolean;
  user?: TeamUser | null;
  roles?: string[];
  onClose?: () => void;
  onUpdated?: (user: TeamUser) => void;
  titleSlot?: ReactNode;
  actionsSlot?: (ctx: { loading: boolean; onConfirm?: () => void; onCancel?: () => void }) => ReactNode;
}

export function TeamEditUserDialog({
  open = false,
  user = null,
  roles = [],
  onClose,
  onUpdated,
  titleSlot,
  actionsSlot,
  className,
  style,
  ...rest
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [selectedRole, setSelectedRole] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setSelectedRole(user?.role ?? '');
      setEnabled(user?.enabled ?? true);
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, user]);

  async function handleSubmit() {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const bridge = getBridgeAuth();
      const updated = await bridge.team.updateUser({
        id: user.id,
        role: selectedRole || undefined,
        enabled,
      });
      onUpdated?.(updated);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setLoading(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={className}
      style={style}
      data-bridge-team-dialog
      onClose={() => onClose?.()}
      {...rest}
    >
      <div className="bridge-team-dialog-content">
        {titleSlot ?? (
          <>
            <h3 className="bridge-team-dialog-title">Edit User</h3>
            {user && <p className="bridge-team-dialog-subtitle">{user.email}</p>}
          </>
        )}

        {error && (
          <div className="bridge-team-dialog-error">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <div className="bridge-team-form-group">
          <label htmlFor="bridge-edit-role">Role</label>
          <select
            id="bridge-edit-role"
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            disabled={loading}
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="bridge-team-form-group">
          <label className="bridge-team-checkbox-label">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              disabled={loading}
            />
            <span>Enabled</span>
          </label>
        </div>

        {actionsSlot ? (
          actionsSlot({ loading, onConfirm: handleSubmit, onCancel: onClose })
        ) : (
          <div className="bridge-team-dialog-actions">
            <button
              type="button"
              className="bridge-btn bridge-btn-secondary"
              onClick={() => onClose?.()}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className="bridge-btn bridge-btn-primary"
              onClick={handleSubmit}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}

export default TeamEditUserDialog;
