import axios from 'axios';
import type {
  AuthUser,
  ChainTemplate,
  CommandRecord,
  CommandRun,
  CommandStepInput,
  DirectoryRecord
} from '../types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5100';
export const TOKEN_STORAGE_KEY = 'server_commands_token';

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

client.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export const extractApiError = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (typeof message === 'string') {
      return message;
    }

    return error.message;
  }

  return error instanceof Error ? error.message : 'Unexpected error occurred.';
};

export const api = {
  async login(email: string, password: string): Promise<
    | { token: string; user: AuthUser; requiresTwoFactor?: never; challengeToken?: never }
    | { requiresTwoFactor: true; challengeToken: string; token?: never; user?: never }
  > {
    const response = await client.post('/api/auth/login', { email, password });
    return response.data;
  },

  async completeTotpLogin(challengeToken: string, code: string): Promise<{ token: string; user: AuthUser }> {
    const response = await client.post('/api/auth/2fa/complete-login', { challengeToken, code });
    return response.data;
  },

  async bootstrapAdmin(email: string, password: string, bootstrapToken: string): Promise<{ token: string; user: AuthUser }> {
    const response = await client.post(
      '/api/auth/bootstrap-admin',
      { email, password },
      {
        headers: {
          'x-bootstrap-token': bootstrapToken
        }
      }
    );

    return response.data;
  },

  async currentUser(): Promise<{ user: AuthUser }> {
    const response = await client.get('/api/auth/me');
    return response.data;
  },

  async listDirectories(): Promise<DirectoryRecord[]> {
    const response = await client.get('/api/directories');
    return response.data.data;
  },

  async createDirectory(payload: {
    label: string;
    path: string;
    description?: string;
  }): Promise<DirectoryRecord> {
    const response = await client.post('/api/directories', payload);
    return response.data;
  },

  async deleteDirectory(id: string): Promise<void> {
    await client.delete(`/api/directories/${id}`);
  },

  async listCommands(): Promise<CommandRecord[]> {
    const response = await client.get('/api/commands');
    return response.data.data;
  },

  async createCommand(payload: {
    label: string;
    command: string;
    shell: 'cmd' | 'powershell' | 'bash';
    runAsSystem: boolean;
    timeoutMs?: number;
    enabled?: boolean;
  }): Promise<CommandRecord> {
    const response = await client.post('/api/commands', payload);
    return response.data;
  },

  async deleteCommand(id: string): Promise<void> {
    await client.delete(`/api/commands/${id}`);
  },

  async listChainTemplates(): Promise<ChainTemplate[]> {
    const response = await client.get('/api/chain-templates');
    return response.data.data;
  },

  async createChainTemplate(payload: {
    name: string;
    description?: string;
    directoryId?: string;
    steps: CommandStepInput[];
  }): Promise<ChainTemplate> {
    const response = await client.post('/api/chain-templates', payload);
    return response.data;
  },

  async deleteChainTemplate(id: string): Promise<void> {
    await client.delete(`/api/chain-templates/${id}`);
  },

  async listCommandRuns(skip = 0, limit = 20): Promise<{ data: CommandRun[]; total: number }> {
    const response = await client.get('/api/command-runs', {
      params: { skip, limit }
    });

    return response.data;
  },

  async createCommandRun(payload: {
    name?: string;
    directoryId?: string;
    templateId?: string;
    steps?: CommandStepInput[];
  }): Promise<CommandRun> {
    const response = await client.post('/api/command-runs', payload);
    return response.data;
  },

  async retryCommandRun(id: string): Promise<CommandRun> {
    const response = await client.post(`/api/command-runs/${id}/retry`);
    return response.data;
  },

  async deleteCommandRun(id: string): Promise<void> {
    await client.delete(`/api/command-runs/${id}`);
  },

  async setup2FA(): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const response = await client.post('/api/auth/2fa/setup');
    return response.data;
  },

  async confirm2FA(code: string): Promise<void> {
    await client.post('/api/auth/2fa/confirm', { code });
  },

  async disable2FA(code: string): Promise<void> {
    await client.post('/api/auth/2fa/disable', { code });
  }
};
