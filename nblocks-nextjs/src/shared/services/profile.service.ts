import * as jose from 'jose';
import { create } from 'zustand';
import { NblocksConfig } from '../types/config';
import { useTokenStore } from './token.service';

export interface IDToken {
  sub: string;
  preferred_username: string;
  email: string;
  email_verified: boolean;
  name: string;
  family_name?: string;
  given_name?: string;
  locale?: string;
  onboarded?: boolean;
  multi_tenant?: boolean;
  tenant_id?: string;
  tenant_name?: string;
  tenant_locale?: string;
  tenant_logo?: string;
  tenant_onboarded?: boolean;
}

export interface Profile {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  familyName?: string;
  givenName?: string;
  locale?: string;
  onboarded?: boolean;
  multiTenantAccess?: boolean;
  tenant?: {
    id: string;
    name: string;
    locale?: string;
    logo?: string;
    onboarded?: boolean;
  };
}

interface ProfileState {
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
  setProfile: (profile: Profile | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

const useProfileStore = create<ProfileState>((set) => ({
  profile: null,
  isLoading: false,
  error: null,
  setProfile: (profile) => set({ profile }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

export class ProfileService {
  private static instance: ProfileService;
  private jwksClient: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
  private expectedIssuer: string | null = null;
  private expectedAudience: string | null = null;
  private config: NblocksConfig | null = null;
  private isInitialized = false;

  private constructor() {
    // We'll initialize in init method
  }

  public static getInstance(): ProfileService {
    if (!ProfileService.instance) {
      ProfileService.instance = new ProfileService();
    }
    return ProfileService.instance;
  }

  /**
   * Initialize the service with the required configuration
   */
  public init(config: NblocksConfig): void {
    if (this.isInitialized) return;

    try {
      if (!config) {
        console.error('ProfileService - No config available');
        throw new Error('Configuration is required for ProfileService');
      }
      
      this.config = config;
      
      // Use default authBaseUrl if not provided
      this.expectedIssuer = config.authBaseUrl || 'https://auth.nblocks.cloud';
      
      if (!config.appId) {
        console.error('ProfileService - No appId in config');
        throw new Error('appId is required in configuration');
      }

      this.expectedAudience = config.appId;
      
      // Initialize JWKS client
      this.jwksClient = jose.createRemoteJWKSet(
        new URL(`${this.expectedIssuer}/.well-known/jwks.json`)
      );
      
      this.isInitialized = true;
    } catch (error) {
      console.error('ProfileService - Initialization error:', error);
      throw error;
    }
  }

  /**
   * Verifies the ID token and updates the profile
   */
  private async verifyAndUpdateProfile(idToken: string): Promise<void> {
    if (!this.isInitialized) {
      console.error('ProfileService - Not initialized');
      throw new Error('ProfileService is not initialized. Call init() first.');
    }

    if (!this.jwksClient || !this.expectedIssuer || !this.expectedAudience) {
      throw new Error('ProfileService not properly initialized');
    }

    try {
      const { payload } = await jose.jwtVerify(
        idToken,
        this.jwksClient,
        {
          issuer: this.expectedIssuer,
          audience: this.expectedAudience
        }
      );
      
      const tokenData = payload as unknown as IDToken;
      
      // Transform IDToken into Profile
      const profile: Profile = {
        id: tokenData.sub,
        username: tokenData.preferred_username,
        email: tokenData.email,
        emailVerified: tokenData.email_verified,
        fullName: tokenData.name,
        familyName: tokenData.family_name,
        givenName: tokenData.given_name,
        locale: tokenData.locale,
        onboarded: tokenData.onboarded,
        multiTenantAccess: tokenData.multi_tenant,
        tenant: tokenData.tenant_id ? {
          id: tokenData.tenant_id,
          name: tokenData.tenant_name || '',
          locale: tokenData.tenant_locale,
          logo: tokenData.tenant_logo,
          onboarded: tokenData.tenant_onboarded
        } : undefined
      };
      
      useProfileStore.getState().setProfile(profile);
      useProfileStore.getState().setError(null);
    } catch (error) {
      console.error('Error verifying ID token:', error);
      useProfileStore.getState().setProfile(null);
      
      // Set appropriate error message based on the error type
      if (error instanceof jose.errors.JWTExpired) {
        useProfileStore.getState().setError('Token expired');
      } else if (error instanceof jose.errors.JWTInvalid) {
        useProfileStore.getState().setError('Invalid token');
      } else if (error instanceof jose.errors.JWKSNoMatchingKey) {
        useProfileStore.getState().setError('JWKS error');
      } else {
        useProfileStore.getState().setError('Error verifying token');
      }
    }
  }

  /**
   * Gets the current profile synchronously
   */
  getCurrentProfile(): Profile | null {
    return useProfileStore.getState().profile;
  }

  /**
   * Checks if the current profile has completed onboarding
   */
  isOnboarded(): boolean {
    return useProfileStore.getState().profile?.onboarded ?? false;
  }

  /**
   * Checks if the current profile has multi-tenant access
   */
  hasMultiTenantAccess(): boolean {
    return useProfileStore.getState().profile?.multiTenantAccess ?? false;
  }

  /**
   * Clears the current profile
   */
  clearProfile(): void {
    useProfileStore.getState().setProfile(null);
  }

  /**
   * Updates the profile based on the current ID token
   */
  async updateProfile(): Promise<void> {
    if (!this.isInitialized) {
      console.error('ProfileService - Not initialized');
      throw new Error('ProfileService is not initialized. Call init() first.');
    }

    useProfileStore.getState().setLoading(true);
    useProfileStore.getState().setError(null);

    try {
      // Get the ID token from the token store
      const idToken = useTokenStore.getState().getIdToken();
      
      if (!idToken) {
        console.log('No ID token available, clearing profile');
        useProfileStore.getState().setProfile(null);
        return;
      }

      // Verify the token and update the profile
      await this.verifyAndUpdateProfile(idToken);
    } catch (error) {
      console.error('Error updating profile:', error);
      useProfileStore.getState().setError(
        error instanceof Error ? error.message : 'Failed to update profile'
      );
      
      // If the error is due to initialization, try to initialize
      if (!this.isInitialized) {
        try {
          if (this.config) {
            this.init(this.config);
          } else {
            console.error('ProfileService - No config available for initialization');
            throw new Error('Configuration is required for ProfileService');
          }
        } catch (initError) {
          console.error('Failed to initialize ProfileService:', initError);
          throw initError;
        }
      }
    } finally {
      useProfileStore.getState().setLoading(false);
    }
  }

  /**
   * Sets the profile directly without verification
   * This is used as a fallback when verification fails
   */
  setProfile(profile: Profile): void {
    useProfileStore.getState().setProfile(profile);
    useProfileStore.getState().setError(null);
  }
} 