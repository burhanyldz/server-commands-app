import { useEffect, useState, type FormEvent } from 'react';
import { api, extractApiError } from './lib/api';
import type { UserRecord } from './types';

export const UsersPanel = ({ onClose }: { onClose: () => void }) => {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void api.listUsers()
      .then((data) => { if (active) setUsers(data); })
      .catch((err) => { if (active) setError(extractApiError(err)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, submitting]);

  const createUser = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await api.createUser(email.trim(), password);
      setUsers((current) => [...current, response.user]);
      setMessage(`${response.user.email} hesabı oluşturuldu. Kullanıcı kendi hesabından Security → Set Up 2FA ile iki faktörlü doğrulamayı etkinleştirebilir.`);
      setEmail('');
      setPassword('');
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="users-title" onClick={() => { if (!submitting) onClose(); }}>
      <section className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <h2 id="users-title" className="text-xl font-black text-slate-900">Kullanıcılar</h2>
          <button type="button" disabled={submitting} onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold disabled:opacity-60">Kapat</button>
        </div>
        <p className="mt-3 text-sm text-slate-600">Yeni hesaplar admin yetkisiyle oluşturulur. Tüm kullanıcılar aynı dizinleri, komutları ve çalışma geçmişini görür; komut çalıştırabilir ve kullanıcı ekleyebilir.</p>
        {loading ? <p className="mt-4 text-sm">Kullanıcılar yükleniyor…</p> : (
          <ul className="mt-4 space-y-2">
            {users.map((user) => (
              <li key={user.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="break-all text-sm font-semibold">{user.email}</p>
                <p className="mt-1 text-xs text-slate-600">{user.role} · İki faktörlü doğrulama: {user.totpEnabled ? 'Etkin' : 'Kapalı'}</p>
              </li>
            ))}
          </ul>
        )}
        <form className="mt-6 space-y-4" onSubmit={(event) => void createUser(event)}>
          <h3 className="font-bold">Yeni kullanıcı ekle</h3>
          <label className="block text-sm font-semibold">E-posta
            <input type="email" autoComplete="off" required autoFocus disabled={submitting} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="username@mail.com" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <label className="block text-sm font-semibold">Şifre
            <input type="password" autoComplete="new-password" required minLength={12} disabled={submitting} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
          </label>
          <p className="text-xs text-slate-600">En az 12 karakter kullanın. İki faktörlü doğrulama isteğe bağlıdır; kullanıcı QR kodu kendi telefonuyla tarayıp onaylayarak etkinleştirir.</p>
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
          <button type="submit" disabled={submitting || loading} className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{submitting ? 'Oluşturuluyor…' : 'Kullanıcı oluştur'}</button>
        </form>
      </section>
    </div>
  );
};
