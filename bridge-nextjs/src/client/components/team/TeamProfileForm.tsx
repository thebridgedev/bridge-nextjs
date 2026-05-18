'use client';

import type { TeamProfile } from '@nebulr-group/bridge-auth-core';
import type { HTMLAttributes } from 'react';
import { useEffect, useState } from 'react';
import { getBridgeAuth } from '../../../core/bridge-instance';
import { Alert } from '../sdk-auth/shared/Alert';
import { Spinner } from '../sdk-auth/shared/Spinner';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'onError'> {
  onError?: (error: Error) => void;
}

export function TeamProfileForm({ onError, className, style, ...rest }: Props) {
  const [profile, setProfile] = useState<TeamProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const bridge = getBridgeAuth();
        const p = await bridge.team.getProfile();
        if (!mounted) return;
        setProfile(p);
        setFirstName(p.firstName ?? '');
        setLastName(p.lastName ?? '');
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to load profile');
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
      const updated = await bridge.team.updateProfile({ firstName, lastName });
      setProfile(updated);
      setSuccess('Profile updated successfully.');
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to update profile');
      setError(e.message);
      onError?.(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={className} style={style} data-bridge-team-profile {...rest}>
      <h3 className="bridge-team-section-title">My Profile</h3>

      {loading ? (
        <div className="bridge-team-loading">
          <Spinner size={32} />
          <span>Loading profile...</span>
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

          <form className="bridge-team-form" onSubmit={handleSubmit}>
            <div className="bridge-team-form-group">
              <label htmlFor="bridge-profile-email">Email</label>
              <input
                id="bridge-profile-email"
                type="email"
                value={profile?.email ?? ''}
                disabled
                readOnly
              />
            </div>

            <div className="bridge-team-form-row">
              <div className="bridge-team-form-group">
                <label htmlFor="bridge-profile-first-name">First Name</label>
                <input
                  id="bridge-profile-first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="bridge-team-form-group">
                <label htmlFor="bridge-profile-last-name">Last Name</label>
                <input
                  id="bridge-profile-last-name"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>

            {profile?.role && (
              <div className="bridge-team-form-group">
                <label>Role</label>
                <div className="bridge-team-readonly">{profile.role}</div>
              </div>
            )}

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

export default TeamProfileForm;
