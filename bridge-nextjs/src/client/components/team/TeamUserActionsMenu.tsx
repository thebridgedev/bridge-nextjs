'use client';

import type { HTMLAttributes } from 'react';
import { useEffect, useRef, useState } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  onEdit?: () => void;
  onResetPassword?: () => void;
  onDelete?: () => void;
}

export function TeamUserActionsMenu({
  onEdit,
  onResetPassword,
  onDelete,
  className,
  style,
  ...rest
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isOpen]);

  const handleAction = (fn?: () => void) => {
    setIsOpen(false);
    fn?.();
  };

  return (
    <div
      ref={menuRef}
      className={className}
      style={style}
      data-bridge-team-actions
      {...rest}
    >
      <button
        type="button"
        className="bridge-team-actions-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        aria-label="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {isOpen && (
        <div className="bridge-team-actions-menu">
          <button
            type="button"
            className="bridge-team-actions-item"
            onClick={() => handleAction(onEdit)}
          >
            Edit
          </button>
          <button
            type="button"
            className="bridge-team-actions-item"
            onClick={() => handleAction(onResetPassword)}
          >
            Reset Password
          </button>
          <button
            type="button"
            className="bridge-team-actions-item bridge-team-actions-item--danger"
            onClick={() => handleAction(onDelete)}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default TeamUserActionsMenu;
