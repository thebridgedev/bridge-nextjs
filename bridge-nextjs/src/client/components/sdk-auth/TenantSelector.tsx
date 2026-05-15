'use client';

import type { TenantUser } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { getBridgeAuth, useBridgeStore } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError' | 'onSelect'> {
  onSelect?: () => void;
  onError?: (error: Error) => void;
  tenantItem?: (tu: TenantUser) => ReactNode;
}

export function TenantSelector({
  onSelect,
  onError,
  tenantItem,
  className,
  style,
  ...rest
}: Props) {
  const tenantUsers = useBridgeStore((s) => s.tenantUsers);

  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(tenantUser: TenantUser) {
    if (loading) return;
    setError(null);
    setSelectedId(tenantUser.id);
    setLoading(true);
    try {
      await (getBridgeAuth() as any).selectTenant(tenantUser.id);
      onSelect?.();
    } catch (err: any) {
      setError(err.message || 'Failed to select workspace.');
      onError?.(err);
    } finally {
      setLoading(false);
      setSelectedId(null);
    }
  }

  return (
    <AuthFormWrapper heading="Choose a workspace" className={className} style={style} {...rest}>
      {error && <Alert variant="error">{error}</Alert>}

      <div className="bridge-tenant-list">
        {tenantUsers.map((tu) => (
          <button
            key={tu.id}
            type="button"
            className="bridge-tenant-item"
            data-tenant-id={tu.id}
            data-loading={selectedId === tu.id}
            onClick={() => handleSelect(tu)}
            disabled={loading}
          >
            {tenantItem ? (
              tenantItem(tu)
            ) : (
              <>
                <span className="bridge-tenant-avatar">
                  {tu.tenant.logo ? (
                    <img src={tu.tenant.logo} alt={tu.tenant.name} />
                  ) : (
                    tu.tenant.name.charAt(0).toUpperCase()
                  )}
                </span>
                <span className="bridge-tenant-info">
                  <span className="bridge-tenant-name">{tu.tenant.name}</span>
                  <span className="bridge-tenant-user">{tu.fullName}</span>
                </span>
                {selectedId === tu.id && <Spinner size={18} />}
              </>
            )}
          </button>
        ))}
      </div>
    </AuthFormWrapper>
  );
}

export default TenantSelector;
