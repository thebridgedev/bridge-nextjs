'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface Props extends HTMLAttributes<HTMLDialogElement> {
  open?: boolean;
  title?: string;
  message?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'default';
  loading?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  titleSlot?: ReactNode;
  actionsSlot?: (ctx: { loading: boolean; onConfirm?: () => void; onCancel?: () => void }) => ReactNode;
}

export function TeamConfirmDialog({
  open = false,
  title = 'Confirm',
  message = 'Are you sure?',
  confirmLabel = 'Confirm',
  variant = 'danger',
  loading = false,
  onConfirm,
  onCancel,
  titleSlot,
  actionsSlot,
  className,
  style,
  ...rest
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={className}
      style={style}
      data-bridge-team-dialog
      data-variant={variant}
      onClose={() => onCancel?.()}
      {...rest}
    >
      <div className="bridge-team-dialog-content">
        {titleSlot ?? (
          <>
            <h3 className="bridge-team-dialog-title">{title}</h3>
            <p className="bridge-team-dialog-message">{message}</p>
          </>
        )}
        {actionsSlot ? (
          actionsSlot({ loading, onConfirm, onCancel })
        ) : (
          <div className="bridge-team-dialog-actions">
            <button
              type="button"
              className="bridge-btn bridge-btn-secondary"
              onClick={() => onCancel?.()}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`bridge-btn ${
                variant === 'danger' ? 'bridge-btn-danger' : 'bridge-btn-primary'
              }`}
              onClick={() => onConfirm?.()}
              disabled={loading}
            >
              {loading ? 'Processing...' : confirmLabel}
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}

export default TeamConfirmDialog;
