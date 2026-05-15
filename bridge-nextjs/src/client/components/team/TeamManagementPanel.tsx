'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { useState } from 'react';
import { TeamProfileForm } from './TeamProfileForm';
import { TeamUserList } from './TeamUserList';
import { TeamWorkspaceForm } from './TeamWorkspaceForm';

type Tab = { id: 'users' | 'profile' | 'workspace'; label: string };

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  defaultTab?: 'users' | 'profile' | 'workspace';
  showProfileTab?: boolean;
  showWorkspaceTab?: boolean;
  onError?: (error: Error) => void;
  tabBar?: (ctx: { tabs: Tab[]; activeTab: string; setTab: (id: string) => void }) => ReactNode;
}

export function TeamManagementPanel({
  defaultTab = 'users',
  showProfileTab = true,
  showWorkspaceTab = true,
  onError,
  tabBar,
  className,
  style,
  ...rest
}: Props) {
  const [activeTab, setActiveTab] = useState<'users' | 'profile' | 'workspace'>(defaultTab);

  const tabs: Tab[] = [
    { id: 'users', label: 'Users' },
    ...(showProfileTab ? [{ id: 'profile' as const, label: 'Profile' }] : []),
    ...(showWorkspaceTab ? [{ id: 'workspace' as const, label: 'Workspace' }] : []),
  ];

  const setTab = (id: string) => setActiveTab(id as 'users' | 'profile' | 'workspace');

  return (
    <div className={className} style={style} data-bridge-team-panel {...rest}>
      {tabs.length > 1 ? (
        tabBar ? (
          tabBar({ tabs, activeTab, setTab })
        ) : (
          <nav className="bridge-team-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="bridge-team-tab"
                data-active={activeTab === tab.id}
                onClick={() => setTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        )
      ) : null}

      <div className="bridge-team-tab-content">
        {activeTab === 'users' && <TeamUserList onError={onError} />}
        {activeTab === 'profile' && <TeamProfileForm onError={onError} />}
        {activeTab === 'workspace' && <TeamWorkspaceForm onError={onError} />}
      </div>
    </div>
  );
}

export default TeamManagementPanel;
