import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, extractApiError, TOKEN_STORAGE_KEY } from './lib/api';
import type { AuthUser } from './types';

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  login: (email: string, password: string) => Promise<void>;
  bootstrapAdmin: (email: string, password: string, bootstrapToken: string) => Promise<void>;
  logout: () => void;
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

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      setIsReady(true);
      return;
    }

    api
      .currentUser()
      .then((response) => {
        setUser(response.user);
      })
      .catch(() => {
        clearAuth();
        setUser(null);
      })
      .finally(() => {
        setIsReady(true);
      });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      login: async (email: string, password: string) => {
        const response = await api.login(email, password);
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
        setUser(null);
      }
    }),
    [isReady, user]
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
