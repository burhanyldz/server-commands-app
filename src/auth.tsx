import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, extractApiError, TOKEN_STORAGE_KEY } from './lib/api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  twoFactorPending: boolean;
  login: (email: string, password: string) => Promise<void>;
  completeTotpLogin: (code: string) => Promise<void>;
  bootstrapAdmin: (email: string, password: string, bootstrapToken: string) => Promise<void>;
  logout: () => void;
  setup2FA: () => Promise<{ secret: string; qrCodeDataUrl: string }>;
  confirm2FA: (code: string) => Promise<void>;
  disable2FA: (code: string) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const persistAuth = (token: string, user: AuthUser): void => {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem('server_commands_user', JSON.stringify(user));
};

const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem('server_commands_user');
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const token = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (!token) {
        setIsReady(true);
        return;
      }

      try {
        const response = await api.currentUser();
        setUser(response.user);
      } catch {
        clearAuth();
        setUser(null);
      } finally {
        setIsReady(true);
      }
    })();
  }, []);

  const refreshUser = useCallback(async () => {
    const response = await api.currentUser();
    setUser(response.user);
    const stored = localStorage.getItem('server_commands_user');
    if (stored) {
      localStorage.setItem('server_commands_user', JSON.stringify(response.user));
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      twoFactorPending: challengeToken !== null,
      login: async (email: string, password: string) => {
        const response = await api.login(email, password);
        if (response.requiresTwoFactor) {
          setChallengeToken(response.challengeToken);
          return;
        }
        persistAuth(response.token, response.user);
        setUser(response.user);
      },
      completeTotpLogin: async (code: string) => {
        if (!challengeToken) {
          throw new Error('No active 2FA challenge.');
        }
        const response = await api.completeTotpLogin(challengeToken, code);
        setChallengeToken(null);
        persistAuth(response.token, response.user);
        setUser(response.user);
      },
      bootstrapAdmin: async (email: string, password: string, bootstrapToken: string) => {
        const response = await api.bootstrapAdmin(email, password, bootstrapToken);
        persistAuth(response.token, response.user);
        setUser(response.user);
      },
      logout: () => {
        clearAuth();
        setChallengeToken(null);
        setUser(null);
      },
      setup2FA: async () => {
        return api.setup2FA();
      },
      confirm2FA: async (code: string) => {
        await api.confirm2FA(code);
        await refreshUser();
      },
      disable2FA: async (code: string) => {
        await api.disable2FA(code);
        await refreshUser();
      },
      refreshUser
    }),
    [isReady, user, challengeToken, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }

  return context;
};

export const formatAuthError = (error: unknown): string => extractApiError(error);
