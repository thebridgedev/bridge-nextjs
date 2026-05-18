'use client';

import type { TeamUser } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';
import { Spinner } from '../sdk-auth/shared/Spinner';
import { TeamAddUserDialog } from './TeamAddUserDialog';
import { TeamConfirmDialog } from './TeamConfirmDialog';
import { TeamEditUserDialog } from './TeamEditUserDialog';
import { TeamUserActionsMenu } from './TeamUserActionsMenu';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onError?: (error: Error) => void;
}

export function TeamUserList({ onError, className, style, ...rest }: Props) {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<TeamUser | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [deletingUser, setDeletingUser] = useState<TeamUser | null>(null);
  const [resettingUser, setResettingUser] = useState<TeamUser | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bridge = getBridgeAuth();
        const [userResult, rolesResult] = await Promise.all([
          bridge.team.listUsers(),
          bridge.team.listUserRoles(),
        ]);
        if (!mounted) return;
        setUsers(userResult.users);
        setRoles(rolesResult);
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to load users');
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

  async function handleDeleteConfirm() {
    if (!deletingUser) return;
    setActionLoading(true);
    try {
      const bridge = getBridgeAuth();
      await bridge.team.deleteUser(deletingUser.id);
      setUsers((prev) => prev.filter((u) => u.id !== deletingUser.id));
      setShowDeleteConfirm(false);
      setDeletingUser(null);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to delete user');
      onError?.(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResetConfirm() {
    if (!resettingUser) return;
    setActionLoading(true);
    try {
      const bridge = getBridgeAuth();
      await bridge.team.sendPasswordResetLink(resettingUser.id);
      setShowResetConfirm(false);
      setResettingUser(null);
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to send reset link');
      onError?.(e);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <>
      <div className={className} style={style} data-bridge-team-users {...rest}>
        <div className="bridge-team-users-header">
          <h3 className="bridge-team-users-title">Team Members</h3>
          <button
            type="button"
            className="bridge-btn bridge-btn-primary"
            onClick={() => setShowAddDialog(true)}
          >
            Add Member
          </button>
        </div>

        {loading ? (
          <div className="bridge-team-loading">
            <Spinner size={32} />
            <span>Loading team members...</span>
          </div>
        ) : error ? (
          <Alert variant="error">{error}</Alert>
        ) : users.length === 0 ? (
          <div className="bridge-team-empty">
            <p>No team members yet.</p>
            <button
              type="button"
              className="bridge-btn bridge-btn-primary"
              onClick={() => setShowAddDialog(true)}
            >
              Add your first team member
            </button>
          </div>
        ) : (
          <div className="bridge-team-table-wrapper">
            <table className="bridge-team-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="bridge-team-user-cell">
                        <div className="bridge-team-user-name">
                          {user.fullName || user.username || user.email}
                        </div>
                        <div className="bridge-team-user-email">{user.email}</div>
                      </div>
                    </td>
                    <td>
                      <span className="bridge-team-badge">{user.role ?? '—'}</span>
                    </td>
                    <td>
                      <span
                        className="bridge-team-status"
                        data-state={user.enabled ? 'active' : 'disabled'}
                      >
                        {user.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="bridge-team-actions-cell">
                      <TeamUserActionsMenu
                        onEdit={() => {
                          setEditingUser(user);
                          setShowEditDialog(true);
                        }}
                        onResetPassword={() => {
                          setResettingUser(user);
                          setShowResetConfirm(true);
                        }}
                        onDelete={() => {
                          setDeletingUser(user);
                          setShowDeleteConfirm(true);
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TeamAddUserDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdded={(added) => setUsers((prev) => [...prev, ...added])}
      />

      <TeamEditUserDialog
        open={showEditDialog}
        user={editingUser}
        roles={roles}
        onClose={() => {
          setShowEditDialog(false);
          setEditingUser(null);
        }}
        onUpdated={(updated) =>
          setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
        }
      />

      <TeamConfirmDialog
        open={showDeleteConfirm}
        title="Delete User"
        message={`Are you sure you want to delete ${
          deletingUser?.email ?? 'this user'
        }? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleDeleteConfirm}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setDeletingUser(null);
        }}
      />

      <TeamConfirmDialog
        open={showResetConfirm}
        title="Reset Password"
        message={`Send a password reset link to ${resettingUser?.email ?? 'this user'}?`}
        confirmLabel="Send Reset Link"
        variant="default"
        loading={actionLoading}
        onConfirm={handleResetConfirm}
        onCancel={() => {
          setShowResetConfirm(false);
          setResettingUser(null);
        }}
      />
    </>
  );
}

export default TeamUserList;
