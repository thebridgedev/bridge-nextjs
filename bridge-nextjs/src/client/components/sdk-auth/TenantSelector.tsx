'use client';

import type { MessageOverrides, TenantUser } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { getBridgeAuth, useBridgeStore } from '../../../core/bridge-instance';
import { AuthFormWrapper } from './shared/AuthFormWrapper';
import { Alert } from './shared/Alert';
import { Spinner } from './shared/Spinner';
import { getTranslator } from '../../../i18n';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError' | 'onSelect'> {
  onSelect?: () => void;
  onError?: (error: Error) => void;
  tenantItem?: (tu: TenantUser) => ReactNode;
  /** Per-key copy overrides for this component only (TBP-630). */
  messages?: MessageOverrides;
}

export function TenantSelector({
  onSelect,
  onError,
  tenantItem,
  messages,
  className,
  style,
  ...rest
}: Props) {
  const t = getTranslator(messages);
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
      setError(err.message || t('tenant.error.select'));
      onError?.(err);
    } finally {
      setLoading(false);
      setSelectedId(null);
    }
  }

  return (
    <AuthFormWrapper heading={t('tenant.chooseHeading')} className={className} style={style} {...rest}>
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
