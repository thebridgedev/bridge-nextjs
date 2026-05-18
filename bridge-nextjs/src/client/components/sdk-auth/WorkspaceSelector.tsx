'use client';

import type { Workspace } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth, useBridgeStore } from '../../../core/bridge-instance';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onSwitch?: () => void;
  onError?: (error: Error) => void;
  workspaceItem?: (ctx: {
    workspace: Workspace;
    isActive: boolean;
    isLoading: boolean;
    onSelect: () => void;
  }) => ReactNode;
}

export function WorkspaceSelector({
  onSwitch,
  onError,
  workspaceItem,
  className,
  style,
  ...rest
}: Props) {
  const profile = useBridgeStore((s) => s.profile);
  const currentWorkspaceId = profile?.id ?? null;

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const ws = await (getBridgeAuth() as any).getWorkspaces();
        if (mounted) setWorkspaces(ws);
      } catch (err: any) {
        if (mounted) setLoadError(err.message || 'Failed to load workspaces.');
      } finally {
        if (mounted) setLoadingList(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSelect(workspace: Workspace) {
    if (switchingId) return;
    setSwitchError(null);
    setSwitchingId(workspace.id);
    try {
      await (getBridgeAuth() as any).switchWorkspace(workspace.id);
      onSwitch?.();
    } catch (err: any) {
      setSwitchError(err.message || 'Failed to switch workspace.');
      onError?.(err);
    } finally {
      setSwitchingId(null);
    }
  }

  return (
    <div
      className={className}
      style={style}
      data-bridge-workspace-selector
      data-loading-list={loadingList}
      {...rest}
    >
      {(loadError || switchError) && (
        <Alert variant="error">{loadError ?? switchError}</Alert>
      )}

      {loadingList ? (
        <div data-bridge-workspace-loading>
          <Spinner size={24} />
        </div>
      ) : (
        <div data-bridge-workspace-list>
          {workspaces.map((ws) => {
            const isActive = ws.id === currentWorkspaceId;
            const isLoading = switchingId === ws.id;
            const onSelect = () => handleSelect(ws);

            if (workspaceItem) {
              return (
                <div key={ws.id}>
                  {workspaceItem({ workspace: ws, isActive, isLoading, onSelect })}
                </div>
              );
            }

            return (
              <button
                key={ws.id}
                type="button"
                data-bridge-workspace-item
                data-tenant-id={ws.tenant.id}
                data-active={isActive}
                data-loading={isLoading}
                disabled={!!switchingId}
                onClick={onSelect}
              >
                <span data-bridge-workspace-avatar>
                  {ws.tenant.logo ? (
                    <img src={ws.tenant.logo} alt={ws.tenant.name} />
                  ) : (
                    ws.tenant.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span data-bridge-workspace-info>
                  <span data-bridge-workspace-name>{ws.tenant.name}</span>
                  <span data-bridge-workspace-user>{ws.fullName}</span>
                </span>
                {isLoading && <Spinner size={18} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default WorkspaceSelector;
