export type CommandShell = 'cmd' | 'powershell' | 'bash';

export interface AuthUser {
  id: string;
  email: string;
  role: 'admin' | 'operator';
  totpEnabled: boolean;
}

export interface PasskeyRecord {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
}

export interface DirectoryRecord {
  _id: string;
  label: string;
  path: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  _id: string;
  label: string;
  command: string;
  shell: CommandShell;
  runAsSystem: boolean;
  timeoutMs?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CommandStepInput {
  order?: number;
  commandId?: string;
  directoryId?: string;
  label?: string;
  command?: string;
  shell?: CommandShell;
  runAsSystem?: boolean;
  timeoutMs?: number;
}

export interface ChainTemplateStep {
  commandId?: string;
  directoryId?: string;
  label: string;
  command: string;
  order: number;
  shell: CommandShell;
  runAsSystem: boolean;
  timeoutMs?: number;
}

export interface ChainTemplate {
  _id: string;
  name: string;
  description?: string;
  directoryId?: string;
  steps: ChainTemplateStep[];
  createdAt: string;
  updatedAt: string;
}

export interface CommandRunStep extends ChainTemplateStep {
  directoryLabel?: string;
  directoryPath?: string;
  completed: boolean;
  completedAt?: string;
  error?: boolean;
  log?: string;
}

export interface CommandRun {
  _id: string;
  name?: string;
  directoryId: string;
  directoryLabel: string;
  directoryPath: string;
  templateId?: string;
  templateName?: string;
  steps: CommandRunStep[];
  completed: boolean;
  error?: boolean;
  completedAt?: string;
  failedStep?: string;
  addDate: string;
  processing?: boolean;
  processingStartedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}
