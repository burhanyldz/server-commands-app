import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { formatAuthError, useAuth } from './auth';
import { api, extractApiError } from './lib/api';
import type {
  CommandRecord,
  CommandRun,
  CommandShell,
  CommandStepInput,
  DirectoryRecord,
  PasskeyRecord
} from './types';

interface StepDraft {
  id: string;
  commandId?: string;
  label: string;
  command: string;
  shell: CommandShell;
  runAsSystem: boolean;
  timeoutMs: string;
}

type DefinitionManagementTab = 'directories' | 'commands';

const SHELL_OPTIONS: Array<{ value: CommandShell; label: string }> = [
  { value: 'cmd', label: 'cmd' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'bash', label: 'bash' }
];

const createDraftId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()}`;
};

const createInlineStepDraft = (): StepDraft => ({
  id: createDraftId(),
  label: '',
  command: '',
  shell: 'cmd',
  runAsSystem: true,
  timeoutMs: ''
});

const createStepFromCommand = (command: CommandRecord): StepDraft => ({
  id: createDraftId(),
  commandId: command._id,
  label: command.label,
  command: command.command,
  shell: command.shell,
  runAsSystem: command.runAsSystem,
  timeoutMs: command.timeoutMs ? String(command.timeoutMs) : ''
});

const createStepFromRun = (step: CommandRun['steps'][number]): StepDraft => ({
  id: createDraftId(),
  label: step.label,
  command: step.command,
  shell: step.shell,
  runAsSystem: step.runAsSystem,
  timeoutMs: step.timeoutMs ? String(step.timeoutMs) : ''
});

const formatDate = (value?: string): string => {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const serializeDraftSteps = (steps: StepDraft[]): CommandStepInput[] => {
  return steps.map((step, index) => {
    const timeoutValue = step.timeoutMs.trim() ? Number(step.timeoutMs.trim()) : undefined;

    if (step.commandId) {
      return {
        order: index + 1,
        commandId: step.commandId
      };
    }

    return {
      order: index + 1,
      label: step.label.trim(),
      command: step.command.trim(),
      shell: step.shell,
      runAsSystem: step.runAsSystem,
      timeoutMs: Number.isFinite(timeoutValue) ? timeoutValue : undefined
    };
  });
};

const isStepDraftValid = (step: StepDraft): boolean => {
  if (step.commandId) {
    return true;
  }

  return step.label.trim().length > 0 && step.command.trim().length > 0;
};

const StatusBadge = ({ run }: { run: CommandRun }) => {
  if (!run.completed) {
    return <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">In progress</span>;
  }

  if (run.error) {
    return (
      <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
        Failed{run.failedStep ? ` at ${run.failedStep}` : ''}
      </span>
    );
  }

  return <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Completed</span>;
};

const StepBuilder = ({
  title,
  commands,
  steps,
  setSteps
}: {
  title: string;
  commands: CommandRecord[];
  steps: StepDraft[];
  setSteps: Dispatch<SetStateAction<StepDraft[]>>;
}) => {
  const [selectedCommandId, setSelectedCommandId] = useState('');

  const effectiveSelectedId = selectedCommandId || (commands.length > 0 ? commands[0]._id : '');

  const addSavedCommand = () => {
    const selected = commands.find((command) => command._id === effectiveSelectedId);
    if (!selected) {
      return;
    }

    setSteps((current) => [...current, createStepFromCommand(selected)]);
  };

  const addInlineStep = () => {
    setSteps((current) => [...current, createInlineStepDraft()]);
  };

  const updateStep = (id: string, patch: Partial<StepDraft>, clearCommandRef = false) => {
    setSteps((current) =>
      current.map((step) => {
        if (step.id !== id) {
          return step;
        }

        return {
          ...step,
          ...patch,
          commandId: clearCommandRef ? undefined : patch.commandId === undefined ? step.commandId : patch.commandId
        };
      })
    );
  };

  const removeStep = (id: string) => {
    setSteps((current) => current.filter((step) => step.id !== id));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    setSteps((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) {
        return current;
      }

      const cloned = [...current];
      const [item] = cloned.splice(index, 1);
      cloned.splice(nextIndex, 0, item);
      return cloned;
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">{title}</h3>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          value={effectiveSelectedId}
          onChange={(event) => setSelectedCommandId(event.target.value)}
          disabled={commands.length === 0}
        >
          {commands.map((command) => (
            <option key={command._id} value={command._id}>
              {command.label} - {command.command}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={addSavedCommand}
          disabled={commands.length === 0}
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-sky-700 disabled:opacity-60"
        >
          Add Saved
        </button>
        <button
          type="button"
          onClick={addInlineStep}
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-amber-700"
        >
          Add Custom
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {steps.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
            No steps added.
          </p>
        )}

        {steps.map((step, index) => (
          <div key={step.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-600">
                Step {index + 1} {step.commandId ? '(saved command)' : '(custom)'}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveStep(index, -1)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600"
                >
                  Up
                </button>
                <button
                  type="button"
                  onClick={() => moveStep(index, 1)}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600"
                >
                  Down
                </button>
                <button
                  type="button"
                  onClick={() => removeStep(step.id)}
                  className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold text-rose-700"
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Label
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={step.label}
                  onChange={(event) => updateStep(step.id, { label: event.target.value }, true)}
                />
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Shell
                <select
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={step.shell}
                  onChange={(event) => updateStep(step.id, { shell: event.target.value as CommandShell }, true)}
                >
                  {SHELL_OPTIONS.map((shell) => (
                    <option key={shell.value} value={shell.value}>
                      {shell.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="mt-2 block text-xs font-semibold text-slate-700">
              Command
              <textarea
                className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                value={step.command}
                onChange={(event) => updateStep(step.id, { command: event.target.value }, true)}
              />
            </label>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={step.runAsSystem}
                  onChange={(event) => updateStep(step.id, { runAsSystem: event.target.checked }, true)}
                />
                Run as NT AUTHORITY\\SYSTEM
              </label>

              <label className="text-xs font-semibold text-slate-700">
                Timeout (ms)
                <input
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
                  value={step.timeoutMs}
                  onChange={(event) => updateStep(step.id, { timeoutMs: event.target.value }, true)}
                  placeholder="Optional"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

const LoginScreen = () => {
  const { login, loginWithPasskey, bootstrapAdmin, twoFactorPending, completeTotpLogin, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBootstrap, setShowBootstrap] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await login(email, password);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTotpLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await completeTotpLogin(totpCode);
    } catch (err) {
      setError(formatAuthError(err));
      setTotpCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await bootstrapAdmin(email, password, bootstrapToken);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (!email) {
      setError('Enter your email address first, then click Sign in with Passkey.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await loginWithPasskey(email);
    } catch (err) {
      setError(formatAuthError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (twoFactorPending) {
    return (
      <main className="theme-scope theme-auth-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
        <div className="theme-auth-backdrop absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,173,96,0.35),_transparent_35%),radial-gradient(circle_at_85%_20%,_rgba(39,159,191,0.28),_transparent_30%),linear-gradient(160deg,#f8fcff_0%,#fffaf2_65%,#f6fbff_100%)]" />
        <section className="w-full max-w-md rounded-3xl border border-sky-100 bg-white/90 p-8 shadow-[0_20px_55px_rgba(31,111,138,0.18)] backdrop-blur animate-[fadeIn_0.5s_ease]">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Server Commands</p>
          <h1 className="mb-1 text-3xl font-black text-slate-900">Two-Factor Auth</h1>
          <p className="mb-6 text-sm text-slate-600">
            Open your authenticator app and enter the 6-digit code for Server Commands.
          </p>

          <form className="space-y-4" onSubmit={handleTotpLogin}>
            <label className="block text-sm font-semibold text-slate-700">
              Authenticator Code
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-2xl font-mono tracking-[0.5em] outline-none ring-0 transition focus:border-sky-500"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={totpCode}
                onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))}
                autoFocus
                required
              />
            </label>

            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={isSubmitting || totpCode.length < 6}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? 'Verifying...' : 'Verify'}
            </button>
          </form>

          <button
            type="button"
            className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
            onClick={() => { logout(); setError(null); setTotpCode(''); }}
          >
            Back to sign in
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="theme-scope theme-auth-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="theme-auth-backdrop absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(255,173,96,0.35),_transparent_35%),radial-gradient(circle_at_85%_20%,_rgba(39,159,191,0.28),_transparent_30%),linear-gradient(160deg,#f8fcff_0%,#fffaf2_65%,#f6fbff_100%)]" />
      <section className="w-full max-w-md rounded-3xl border border-sky-100 bg-white/90 p-8 shadow-[0_20px_55px_rgba(31,111,138,0.18)] backdrop-blur animate-[fadeIn_0.5s_ease]">
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-sky-600">Server Commands</p>
        <h1 className="mb-1 text-3xl font-black text-slate-900">Control Panel</h1>
        <p className="mb-6 text-sm text-slate-600">Sign in with your dedicated server-commands admin account.</p>

        <form className="space-y-4" onSubmit={handleLogin}>
          <label className="block text-sm font-semibold text-slate-700">
            Email
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-sky-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-0 transition focus:border-sky-500"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
            />
          </label>

          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="my-4 flex items-center gap-2">
          <hr className="flex-1 border-slate-200" />
          <span className="text-xs font-medium text-slate-400">or use passkey</span>
          <hr className="flex-1 border-slate-200" />
        </div>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={() => void handlePasskeyLogin()}
          className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? 'Verifying…' : 'Sign in with Touch ID / Passkey'}
        </button>

        <button
          type="button"
          className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-sky-700"
          onClick={() => setShowBootstrap((value) => !value)}
        >
          {showBootstrap ? 'Hide bootstrap form' : 'Need first admin? Bootstrap one'}
        </button>

        {showBootstrap && (
          <form className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4" onSubmit={handleBootstrap}>
            <label className="block text-xs font-bold uppercase tracking-wide text-slate-600">
              Bootstrap token
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium"
                type="password"
                value={bootstrapToken}
                onChange={(event) => setBootstrapToken(event.target.value)}
                required
              />
            </label>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700 disabled:opacity-60"
            >
              {isSubmitting ? 'Creating...' : 'Create first admin'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};

const DashboardScreen = () => {
  const { user, logout, setup2FA, confirm2FA, disable2FA } = useAuth();

  const [directories, setDirectories] = useState<DirectoryRecord[]>([]);
  const [commands, setCommands] = useState<CommandRecord[]>([]);
  const [runs, setRuns] = useState<CommandRun[]>([]);

  const [directoryLabel, setDirectoryLabel] = useState('');
  const [directoryPath, setDirectoryPath] = useState('');
  const [directoryDescription, setDirectoryDescription] = useState('');

  const [commandLabel, setCommandLabel] = useState('');
  const [commandText, setCommandText] = useState('');
  const [commandShell, setCommandShell] = useState<CommandShell>('cmd');
  const [commandRunAsSystem, setCommandRunAsSystem] = useState(true);
  const [commandTimeout, setCommandTimeout] = useState('');

  const [runName, setRunName] = useState('');
  const [runDirectoryId, setRunDirectoryId] = useState('');
  const [runSteps, setRunSteps] = useState<StepDraft[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [runsPage, setRunsPage] = useState(0);
  const [runsHasMore, setRunsHasMore] = useState(false);
  const [isDefinitionsModalOpen, setIsDefinitionsModalOpen] = useState(false);
  const [managementTab, setManagementTab] = useState<DefinitionManagementTab>('directories');
  const [isAddingDirectory, setIsAddingDirectory] = useState(false);
  const [isAddingCommand, setIsAddingCommand] = useState(false);

  const [editingDirectoryId, setEditingDirectoryId] = useState<string | null>(null);
  const [editDirectoryLabel, setEditDirectoryLabel] = useState('');
  const [editDirectoryPath, setEditDirectoryPath] = useState('');
  const [editDirectoryDescription, setEditDirectoryDescription] = useState('');

  const [editingCommandId, setEditingCommandId] = useState<string | null>(null);
  const [editCommandLabel, setEditCommandLabel] = useState('');
  const [editCommandText, setEditCommandText] = useState('');
  const [editCommandShell, setEditCommandShell] = useState<CommandShell>('cmd');
  const [editCommandRunAsSystem, setEditCommandRunAsSystem] = useState(true);
  const [editCommandTimeout, setEditCommandTimeout] = useState('');

  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [totpQrCode, setTotpQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [setupStep, setSetupStep] = useState<'idle' | 'scanning'>('idle');
  const [totpSetupCode, setTotpSetupCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [securityMessage, setSecurityMessage] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [isSecuritySubmitting, setIsSecuritySubmitting] = useState(false);

  // Passkeys state
  const [passkeys, setPasskeys] = useState<PasskeyRecord[]>([]);
  const [newPasskeyName, setNewPasskeyName] = useState('');
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);

  const pageSize = 15;

  const loadRuns = async (reset = true) => {
    const nextPage = reset ? 0 : runsPage + 1;
    const skip = nextPage * pageSize;
    const response = await api.listCommandRuns(skip, pageSize);

    setRunsHasMore(response.data.length === pageSize);
    setRunsPage(nextPage);

    if (reset) {
      setRuns(response.data);
      return;
    }

    setRuns((current) => [...current, ...response.data]);
  };

  const loadEverything = async () => {
    setIsLoading(true);

    try {
      const [directoryData, commandData] = await Promise.all([
        api.listDirectories(),
        api.listCommands()
      ]);

      setDirectories(directoryData);
      setCommands(commandData);

      if (!runDirectoryId && directoryData.length > 0) {
        setRunDirectoryId(directoryData[0]._id);
      }

      await loadRuns(true);
      setError(null);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadEverything();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadRuns(true).catch((err) => setError(extractApiError(err)));
    }, 15_000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runsPage]);

  useEffect(() => {
    if (!isDefinitionsModalOpen && !isSecurityModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsDefinitionsModalOpen(false);
        setIsSecurityModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDefinitionsModalOpen, isSecurityModalOpen]);

  useEffect(() => {
    if (!isDefinitionsModalOpen) {
      setIsAddingDirectory(false);
      setIsAddingCommand(false);
      setEditingDirectoryId(null);
      setEditingCommandId(null);
    }
  }, [isDefinitionsModalOpen]);

  useEffect(() => {
    if (!isSecurityModalOpen) {
      setSetupStep('idle');
      setTotpQrCode('');
      setTotpSecret('');
      setTotpSetupCode('');
      setTotpDisableCode('');
      setSecurityMessage(null);
      setSecurityError(null);
      setNewPasskeyName('');
      return;
    }
    // Load passkeys when modal opens
    setIsLoadingPasskeys(true);
    void api.listPasskeys()
      .then(setPasskeys)
      .catch(() => setPasskeys([]))
      .finally(() => setIsLoadingPasskeys(false));
  }, [isSecurityModalOpen]);

  const withSubmission = async (action: () => Promise<void>) => {
    setIsSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await action();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateDirectory = async (event: React.FormEvent) => {
    event.preventDefault();

    await withSubmission(async () => {
      await api.createDirectory({
        label: directoryLabel,
        path: directoryPath,
        description: directoryDescription || undefined
      });

      setDirectoryLabel('');
      setDirectoryPath('');
      setDirectoryDescription('');
      setIsAddingDirectory(false);
      setMessage('Directory saved.');
      await loadEverything();
    });
  };

  const handleCreateCommand = async (event: React.FormEvent) => {
    event.preventDefault();

    await withSubmission(async () => {
      await api.createCommand({
        label: commandLabel,
        command: commandText,
        shell: commandShell,
        runAsSystem: commandRunAsSystem,
        timeoutMs: commandTimeout.trim() ? Number(commandTimeout.trim()) : undefined
      });

      setCommandLabel('');
      setCommandText('');
      setCommandShell('cmd');
      setCommandRunAsSystem(true);
      setCommandTimeout('');
      setIsAddingCommand(false);
      setMessage('Command saved.');
      await loadEverything();
    });
  };

  const startEditingDirectory = (directory: DirectoryRecord) => {
    setEditingDirectoryId(directory._id);
    setEditDirectoryLabel(directory.label);
    setEditDirectoryPath(directory.path);
    setEditDirectoryDescription(directory.description ?? '');
  };

  const cancelEditingDirectory = () => {
    setEditingDirectoryId(null);
    setEditDirectoryLabel('');
    setEditDirectoryPath('');
    setEditDirectoryDescription('');
  };

  const handleUpdateDirectory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingDirectoryId) return;

    await withSubmission(async () => {
      await api.updateDirectory(editingDirectoryId, {
        label: editDirectoryLabel,
        path: editDirectoryPath,
        description: editDirectoryDescription || undefined
      });

      cancelEditingDirectory();
      setMessage('Directory updated.');
      await loadEverything();
    });
  };

  const startEditingCommand = (command: CommandRecord) => {
    setEditingCommandId(command._id);
    setEditCommandLabel(command.label);
    setEditCommandText(command.command);
    setEditCommandShell(command.shell);
    setEditCommandRunAsSystem(command.runAsSystem);
    setEditCommandTimeout(command.timeoutMs ? String(command.timeoutMs) : '');
  };

  const cancelEditingCommand = () => {
    setEditingCommandId(null);
    setEditCommandLabel('');
    setEditCommandText('');
    setEditCommandShell('cmd');
    setEditCommandRunAsSystem(true);
    setEditCommandTimeout('');
  };

  const handleUpdateCommand = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingCommandId) return;

    await withSubmission(async () => {
      await api.updateCommand(editingCommandId, {
        label: editCommandLabel,
        command: editCommandText,
        shell: editCommandShell,
        runAsSystem: editCommandRunAsSystem,
        timeoutMs: editCommandTimeout.trim() ? Number(editCommandTimeout.trim()) : undefined
      });

      cancelEditingCommand();
      setMessage('Command updated.');
      await loadEverything();
    });
  };

  const handleQueueAdHocRun = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!runDirectoryId) {
      setError('Select a directory for ad-hoc run.');
      return;
    }

    if (!runSteps.length || runSteps.some((step) => !isStepDraftValid(step))) {
      setError('All ad-hoc run steps must be valid.');
      return;
    }

    await withSubmission(async () => {
      await api.createCommandRun({
        name: runName.trim() || undefined,
        directoryId: runDirectoryId,
        steps: serializeDraftSteps(runSteps)
      });

      setRunName('');
      setRunSteps([]);
      setMessage('Ad-hoc command run queued.');
      await loadRuns(true);
    });
  };

  const handleClearRunForm = () => {
    setRunName('');
    setRunDirectoryId(directories[0]?._id ?? '');
    setRunSteps([]);
    setError(null);
    setMessage('Ad-hoc run form cleared.');
  };

  const handleDeleteDirectory = async (id: string) => {
    await withSubmission(async () => {
      await api.deleteDirectory(id);
      setMessage('Directory deleted.');
      await loadEverything();
    });
  };

  const handleDeleteCommand = async (id: string) => {
    await withSubmission(async () => {
      await api.deleteCommand(id);
      setMessage('Command deleted.');
      await loadEverything();
    });
  };

  const handleRetryRun = async (id: string) => {
    await withSubmission(async () => {
      await api.retryCommandRun(id);
      setMessage('Retry queued.');
      await loadRuns(true);
    });
  };

  const handleReuseRun = (run: CommandRun) => {
    const directoryExists = directories.some((directory) => directory._id === run.directoryId);
    const fallbackDirectoryId = directories[0]?._id ?? '';

    setRunName(run.name || run.templateName || '');
    setRunDirectoryId(directoryExists ? run.directoryId : fallbackDirectoryId);
    setRunSteps(
      run.steps
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((step) => createStepFromRun(step))
    );

    if (directoryExists) {
      setError(null);
      setMessage('Run loaded into ad-hoc form. You can edit and queue it.');
    } else {
      setError('Original run directory no longer exists. Select a directory before queueing.');
      setMessage('Run loaded into ad-hoc form with the closest available settings.');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteRun = async (id: string) => {
    await withSubmission(async () => {
      await api.deleteCommandRun(id);
      setMessage('Run deleted.');
      await loadRuns(true);
    });
  };

  const handleSetup2FA = async () => {
    setIsSecuritySubmitting(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const result = await setup2FA();
      setTotpQrCode(result.qrCodeDataUrl);
      setTotpSecret(result.secret);
      setSetupStep('scanning');
    } catch (err) {
      setSecurityError(extractApiError(err));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  const handleConfirm2FA = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSecuritySubmitting(true);
    setSecurityError(null);
    try {
      await confirm2FA(totpSetupCode);
      setSecurityMessage('2FA enabled successfully.');
      setSetupStep('idle');
      setTotpSetupCode('');
      setTotpQrCode('');
      setTotpSecret('');
    } catch (err) {
      setSecurityError(extractApiError(err));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  const handleDisable2FA = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSecuritySubmitting(true);
    setSecurityError(null);
    try {
      await disable2FA(totpDisableCode);
      setSecurityMessage('2FA disabled.');
      setTotpDisableCode('');
    } catch (err) {
      setSecurityError(extractApiError(err));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  const handleRegisterPasskey = async () => {
    setIsSecuritySubmitting(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      const { options, challengeToken } = await api.passkeyRegisterOptions();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const registrationResponse = await startRegistration({ optionsJSON: options as any });
      await api.passkeyRegisterVerify(challengeToken, registrationResponse, newPasskeyName.trim() || undefined);
      setSecurityMessage('Passkey registered successfully.');
      setNewPasskeyName('');
      setPasskeys(await api.listPasskeys());
    } catch (err) {
      setSecurityError(extractApiError(err));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  const handleDeletePasskey = async (credentialId: string) => {
    setIsSecuritySubmitting(true);
    setSecurityError(null);
    setSecurityMessage(null);
    try {
      await api.deletePasskey(credentialId);
      setPasskeys((prev) => prev.filter((pk) => pk.id !== credentialId));
      setSecurityMessage('Passkey removed.');
    } catch (err) {
      setSecurityError(extractApiError(err));
    } finally {
      setIsSecuritySubmitting(false);
    }
  };

  return (
    <div className="theme-scope theme-dashboard-shell min-h-screen bg-[linear-gradient(145deg,#f0f8ff_0%,#fffbf2_45%,#eef7ff_100%)] text-slate-900">
      <header className="sticky top-0 z-20 border-b border-sky-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-700">Server Commands</p>
            <h1 className="text-xl font-black sm:text-2xl">Ad-hoc Command Center</h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right text-sm text-slate-600 sm:block">
              <p className="font-semibold text-slate-800">{user?.email}</p>
              <p>{user?.role}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSecurityModalOpen(true)}
              className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-indigo-700 transition hover:bg-indigo-100"
            >
              Security
            </button>
            <button
              type="button"
              onClick={() => {
                setManagementTab('directories');
                setIsDefinitionsModalOpen(true);
              }}
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-violet-700 transition hover:bg-violet-100"
            >
              Manage Definitions
            </button>
            <button
              type="button"
              onClick={() => void loadEverything()}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-sky-700 transition hover:bg-sky-100"
            >
              Refresh All
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:border-slate-400"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="space-y-4">
          {message && <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">{message}</p>}
          {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,53,84,0.12)]">
            <h2 className="text-lg font-black">Queue Ad-hoc Command Run</h2>

            <form className="mt-3 space-y-3" onSubmit={handleQueueAdHocRun}>
              <input
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                placeholder="Run name (optional)"
                value={runName}
                onChange={(event) => setRunName(event.target.value)}
              />
              <select
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                value={runDirectoryId}
                onChange={(event) => setRunDirectoryId(event.target.value)}
                required
              >
                {directories.map((directory) => (
                  <option key={directory._id} value={directory._id}>
                    {directory.label}
                  </option>
                ))}
              </select>

              <StepBuilder
                title="Run Steps"
                commands={commands}
                steps={runSteps}
                setSteps={setRunSteps}
              />

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleClearRunForm}
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-400 disabled:opacity-60"
                >
                  Clear Form
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  Queue Ad-hoc Run
                </button>
              </div>
            </form>
          </article>
        </section>

        <section className="space-y-3">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,53,84,0.12)]">
            <h2 className="text-lg font-black">Command Run History</h2>

            {isLoading && <p className="mt-3 text-sm text-slate-600">Loading...</p>}

            {!isLoading && runs.length === 0 && (
              <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
                No command runs yet.
              </p>
            )}

            <div className="mt-3 space-y-3">
              {runs.map((run, index) => (
                <article
                  key={run._id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 animate-[fadeIn_0.35s_ease]"
                  style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{run.name || run.templateName || 'Command run'}</h3>
                      <p className="text-xs text-slate-600">
                        {run.directoryLabel} | Added {formatDate(run.addDate)}
                      </p>
                    </div>
                    <StatusBadge run={run} />
                  </div>

                  <p className="mt-2 break-all rounded border border-dashed border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600">
                    {run.directoryPath}
                  </p>

                  <div className="mt-3 space-y-2">
                    {run.steps
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((step) => (
                        <div key={`${run._id}-${step.order}`} className="rounded-lg border border-slate-200 bg-white p-2">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-slate-800">
                              {step.order}. {step.label}
                            </p>
                            <p className="text-[11px] text-slate-500">{step.completed ? formatDate(step.completedAt) : 'Pending'}</p>
                          </div>
                          <p className="mt-1 break-all font-mono text-[11px] text-slate-600">{step.command}</p>
                          {step.log && (
                            <details className="mt-1 rounded border border-slate-200 bg-slate-50 p-1.5">
                              <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-600">
                                {step.error ? 'Error log' : 'Output'}
                              </summary>
                              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-2 text-[11px] text-slate-100">
                                {step.log}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => handleReuseRun(run)}
                      disabled={isSubmitting}
                      className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700 disabled:opacity-60"
                    >
                      REUSE
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRetryRun(run._id)}
                      disabled={isSubmitting}
                      className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700"
                    >
                      RERUN
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRun(run._id)}
                      className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>

            {!isLoading && runsHasMore && (
              <button
                type="button"
                onClick={() => void loadRuns(false).catch((err) => setError(extractApiError(err)))}
                className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Load more
              </button>
            )}
          </article>
        </section>
      </main>

      {isSecurityModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Security settings"
          onClick={() => setIsSecurityModalOpen(false)}
        >
          <section
            className="w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_25px_60px_rgba(15,23,42,0.35)] max-h-[90vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">Account Security</p>
                <h2 className="text-xl font-black text-slate-900">Security Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSecurityModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:border-slate-400"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Authenticator App (TOTP)</p>
              <p className="mt-0.5 text-sm text-slate-700">
                Status:{' '}
                {user?.totpEnabled ? (
                  <span className="font-bold text-emerald-700">Enabled</span>
                ) : (
                  <span className="font-bold text-amber-700">Disabled</span>
                )}
              </p>
            </div>

            {securityMessage && (
              <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{securityMessage}</p>
            )}
            {securityError && (
              <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{securityError}</p>
            )}

            {!user?.totpEnabled && (
              <div className="mt-4">
                {setupStep === 'idle' && (
                  <button
                    type="button"
                    onClick={() => void handleSetup2FA()}
                    disabled={isSecuritySubmitting}
                    className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-500 disabled:opacity-60"
                  >
                    {isSecuritySubmitting ? 'Generating...' : 'Set Up 2FA'}
                  </button>
                )}

                {setupStep === 'scanning' && (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">
                      Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the
                      6-digit code to confirm.
                    </p>
                    <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-3">
                      <img src={totpQrCode} alt="2FA QR code" className="h-44 w-44" />
                    </div>
                    <details className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Show manual key
                      </summary>
                      <p className="mt-2 break-all font-mono text-xs text-slate-700">{totpSecret}</p>
                    </details>
                    <form className="space-y-3" onSubmit={(e) => void handleConfirm2FA(e)}>
                      <label className="block text-sm font-semibold text-slate-700">
                        Confirm code
                        <input
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xl font-mono tracking-[0.4em] outline-none ring-0 transition focus:border-indigo-500"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          value={totpSetupCode}
                          onChange={(event) => setTotpSetupCode(event.target.value.replace(/\D/g, ''))}
                          autoFocus
                          required
                        />
                      </label>
                      <button
                        type="submit"
                        disabled={isSecuritySubmitting || totpSetupCode.length < 6}
                        className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-500 disabled:opacity-60"
                      >
                        {isSecuritySubmitting ? 'Enabling...' : 'Enable 2FA'}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {user?.totpEnabled && (
              <form className="mt-4 space-y-3" onSubmit={(e) => void handleDisable2FA(e)}>
                <p className="text-sm text-slate-600">
                  To disable 2FA, enter your current authenticator code.
                </p>
                <label className="block text-sm font-semibold text-slate-700">
                  Authenticator Code
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xl font-mono tracking-[0.4em] outline-none ring-0 transition focus:border-rose-500"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpDisableCode}
                    onChange={(event) => setTotpDisableCode(event.target.value.replace(/\D/g, ''))}
                    required
                  />
                </label>
                <button
                  type="submit"
                  disabled={isSecuritySubmitting || totpDisableCode.length < 6}
                  className="w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-500 disabled:opacity-60"
                >
                  {isSecuritySubmitting ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </form>
            )}

            {/* ── Passkeys section ────────────────────────────────── */}
            <div className="mt-6">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Passkeys</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Sign in instantly with Touch ID, Face ID, or your device's iCloud Keychain — no authenticator app needed.
              </p>

              {isLoadingPasskeys ? (
                <p className="mt-3 text-xs text-slate-400">Loading passkeys…</p>
              ) : passkeys.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {passkeys.map((pk) => (
                    <li
                      key={pk.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{pk.name}</p>
                        <p className="text-xs text-slate-500">
                          {pk.deviceType === 'multiDevice' ? 'Synced (iCloud / cross-device)' : 'This device only'}
                          {pk.backedUp ? ' · backed up' : ''}
                          {' · added '}
                          {new Date(pk.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={isSecuritySubmitting}
                        onClick={() => void handleDeletePasskey(pk.id)}
                        className="shrink-0 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                  No passkeys registered yet.
                </p>
              )}

              <div className="mt-3 flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-violet-400"
                  type="text"
                  placeholder="Passkey name (optional)"
                  value={newPasskeyName}
                  onChange={(e) => setNewPasskeyName(e.target.value)}
                  maxLength={64}
                />
                <button
                  type="button"
                  disabled={isSecuritySubmitting}
                  onClick={() => void handleRegisterPasskey()}
                  className="shrink-0 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSecuritySubmitting ? 'Registering…' : 'Add Passkey'}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {isDefinitionsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8"
          role="dialog"
          aria-modal="true"
          aria-label="Definition manager"
          onClick={() => setIsDefinitionsModalOpen(false)}
        >
          <section
            className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_25px_60px_rgba(15,23,42,0.35)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-700">Definition Manager</p>
                <h2 className="text-xl font-black text-slate-900">Manage Saved Definitions</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsDefinitionsModalOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-700 transition hover:border-slate-400"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setManagementTab('directories');
                  setIsAddingCommand(false);
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  managementTab === 'directories'
                    ? 'border-sky-300 bg-sky-100 text-sky-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Directories
              </button>
              <button
                type="button"
                onClick={() => {
                  setManagementTab('commands');
                  setIsAddingDirectory(false);
                }}
                className={`rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
                  managementTab === 'commands'
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Commands
              </button>
            </div>

            <div className="mt-4 max-h-[70vh] overflow-y-auto pr-1">
              {managementTab === 'directories' && (
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Directories</h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingDirectory((value) => !value)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-sky-700 transition hover:bg-sky-100"
                    >
                      {isAddingDirectory ? 'Close Form' : 'Add New'}
                    </button>
                  </div>

                  {isAddingDirectory && (
                    <form className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={handleCreateDirectory}>
                      <input
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Directory label"
                        value={directoryLabel}
                        onChange={(event) => setDirectoryLabel(event.target.value)}
                        required
                      />
                      <input
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Path e.g. C:\\inetpub\\vhosts\\..."
                        value={directoryPath}
                        onChange={(event) => setDirectoryPath(event.target.value)}
                        required
                      />
                      <input
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Description (optional)"
                        value={directoryDescription}
                        onChange={(event) => setDirectoryDescription(event.target.value)}
                      />
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-60"
                      >
                        Save Directory
                      </button>
                    </form>
                  )}

                  <div className="mt-3 space-y-2">
                    {directories.length === 0 && (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                        No directories saved yet.
                      </p>
                    )}
                    {directories.map((directory) => (
                      <div key={directory._id} className="rounded-xl border border-slate-200 bg-white p-3">
                        {editingDirectoryId === directory._id ? (
                          <form className="grid gap-2" onSubmit={handleUpdateDirectory}>
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Directory label"
                              value={editDirectoryLabel}
                              onChange={(event) => setEditDirectoryLabel(event.target.value)}
                              required
                            />
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Path e.g. C:\\inetpub\\vhosts\\..."
                              value={editDirectoryPath}
                              onChange={(event) => setEditDirectoryPath(event.target.value)}
                              required
                            />
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Description (optional)"
                              value={editDirectoryDescription}
                              onChange={(event) => setEditDirectoryDescription(event.target.value)}
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-500 disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingDirectory}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900">{directory.label}</p>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditingDirectory(directory)}
                                  className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteDirectory(directory._id)}
                                  className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 break-all font-mono text-xs text-slate-600">{directory.path}</p>
                            {directory.description && <p className="mt-1 text-xs text-slate-500">{directory.description}</p>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}

              {managementTab === 'commands' && (
                <article className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-700">Commands</h3>
                    <button
                      type="button"
                      onClick={() => setIsAddingCommand((value) => !value)}
                      className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700 transition hover:bg-emerald-100"
                    >
                      {isAddingCommand ? 'Close Form' : 'Add New'}
                    </button>
                  </div>

                  {isAddingCommand && (
                    <form className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-white p-3" onSubmit={handleCreateCommand}>
                      <input
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Label e.g. Pull changes"
                        value={commandLabel}
                        onChange={(event) => setCommandLabel(event.target.value)}
                        required
                      />
                      <textarea
                        className="min-h-[64px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        placeholder="Command e.g. git pull"
                        value={commandText}
                        onChange={(event) => setCommandText(event.target.value)}
                        required
                      />
                      <div className="grid gap-2 sm:grid-cols-2">
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          value={commandShell}
                          onChange={(event) => setCommandShell(event.target.value as CommandShell)}
                        >
                          {SHELL_OPTIONS.map((shell) => (
                            <option key={shell.value} value={shell.value}>
                              {shell.label}
                            </option>
                          ))}
                        </select>
                        <input
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="Timeout ms (optional)"
                          value={commandTimeout}
                          onChange={(event) => setCommandTimeout(event.target.value)}
                        />
                      </div>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={commandRunAsSystem}
                          onChange={(event) => setCommandRunAsSystem(event.target.checked)}
                        />
                        Run as NT AUTHORITY\\SYSTEM
                      </label>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-60"
                      >
                        Save Command
                      </button>
                    </form>
                  )}

                  <div className="mt-3 space-y-2">
                    {commands.length === 0 && (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                        No commands saved yet.
                      </p>
                    )}
                    {commands.map((command) => (
                      <div key={command._id} className="rounded-xl border border-slate-200 bg-white p-3">
                        {editingCommandId === command._id ? (
                          <form className="grid gap-2" onSubmit={handleUpdateCommand}>
                            <input
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Label e.g. Pull changes"
                              value={editCommandLabel}
                              onChange={(event) => setEditCommandLabel(event.target.value)}
                              required
                            />
                            <textarea
                              className="min-h-[64px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                              placeholder="Command e.g. git pull"
                              value={editCommandText}
                              onChange={(event) => setEditCommandText(event.target.value)}
                              required
                            />
                            <div className="grid gap-2 sm:grid-cols-2">
                              <select
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={editCommandShell}
                                onChange={(event) => setEditCommandShell(event.target.value as CommandShell)}
                              >
                                {SHELL_OPTIONS.map((shell) => (
                                  <option key={shell.value} value={shell.value}>
                                    {shell.label}
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                                placeholder="Timeout ms (optional)"
                                value={editCommandTimeout}
                                onChange={(event) => setEditCommandTimeout(event.target.value)}
                              />
                            </div>
                            <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                              <input
                                type="checkbox"
                                checked={editCommandRunAsSystem}
                                onChange={(event) => setEditCommandRunAsSystem(event.target.checked)}
                              />
                              Run as NT AUTHORITY\SYSTEM
                            </label>
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-500 disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingCommand}
                                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm font-bold text-slate-900">{command.label}</p>
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => startEditingCommand(command)}
                                  className="rounded border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-sky-700"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteCommand(command._id)}
                                  className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-rose-700"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                            <p className="mt-1 break-all font-mono text-xs text-slate-600">{command.command}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              shell: {command.shell} | runAsSystem: {String(command.runAsSystem)}
                            </p>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const { isReady, user } = useAuth();

  if (!isReady) {
    return (
      <div className="theme-scope theme-loading-shell flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-xl bg-white px-5 py-4 text-sm font-semibold text-slate-600 shadow">
          Loading authentication state...
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <DashboardScreen />;
};

export default App;
