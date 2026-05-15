'use client';

import type { TeamUser } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';

interface Props extends HTMLAttributes<HTMLDialogElement> {
  open?: boolean;
  onClose?: () => void;
  onAdded?: (users: TeamUser[]) => void;
  titleSlot?: ReactNode;
  actionsSlot?: (ctx: { loading: boolean; onConfirm?: () => void; onCancel?: () => void }) => ReactNode;
}

export function TeamAddUserDialog({
  open = false,
  onClose,
  onAdded,
  titleSlot,
  actionsSlot,
  className,
  style,
  ...rest
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [emailsText, setEmailsText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setEmailsText('');
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function handleSubmit() {
    const emails = emailsText
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setError('Please enter at least one email address.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const bridge = getBridgeAuth();
      const created = await bridge.team.createUsers(emails);
      onAdded?.(created);
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add users');
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
            <h3 className="bridge-team-dialog-title">Add Team Members</h3>
            <p className="bridge-team-dialog-subtitle">
              Enter email addresses separated by commas or new lines.
            </p>
          </>
        )}

        {error && (
          <div className="bridge-team-dialog-error">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <div className="bridge-team-form-group">
          <label htmlFor="bridge-add-emails">Email addresses</label>
          <textarea
            id="bridge-add-emails"
            value={emailsText}
            onChange={(e) => setEmailsText(e.target.value)}
            placeholder="user1@example.com&#10;user2@example.com"
            rows={4}
            disabled={loading}
          />
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
              disabled={loading || !emailsText.trim()}
            >
              {loading ? 'Adding...' : 'Add Members'}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}

export default TeamAddUserDialog;
