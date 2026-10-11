import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Monitor, Trash2, Save, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, tokenStore } from '../services/api.js';
import { PageHeader, Card, CardHeader, Button, Input, Field, Modal } from '../components/ui/index.jsx';
import { cn } from '../lib/utils.js';

export default function SettingsPage() {
  const { user, updateUser, logout } = useAuth();
  const { preference, setPreference } = useTheme();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(user?.name || '');
  const [currency, setCurrency] = useState(user?.preferences?.defaultCurrency || 'USD');
  const [saving, setSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePw, setDeletePw] = useState('');

  const saveProfile = async () => {
    if (!name.trim()) return toast.error('Name is required.');
    setSaving(true);
    try {
      const res = await api.updateProfile({ name: name.trim(), preferences: { defaultCurrency: currency.toUpperCase() } });
      updateUser(res.user);
      toast.success('Profile saved.');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pw.next.length < 8) return toast.error('New password must be at least 8 characters.');
    if (pw.next !== pw.confirm) return toast.error('New passwords do not match.');
    setPwSaving(true);
    try {
      await api.updateProfile({ currentPassword: pw.current, newPassword: pw.next });
      setPw({ current: '', next: '', confirm: '' });
      toast.success('Password changed.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setPwSaving(false);
    }
  };

  const deleteAccount = async () => {
    try {
      await api.deleteAccount(deletePw);
      tokenStore.clear();
      logout();
      navigate('/login');
    } catch (e) {
      toast.error(e.message);
    }
  };

  const themes = [
    ['light', 'Light', Sun],
    ['dark', 'Dark', Moon],
    ['system', 'System', Monitor],
  ];

  return (
    <>
      <PageHeader title="Settings" description="Manage your profile, appearance and account." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Profile" description="Shown in the navigation bar." />
          <div className="space-y-4 p-5">
            <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
            <Field label="Email"><Input value={user?.email || ''} disabled /></Field>
            <Field label="Default currency" hint="Used when formatting monetary KPIs (3-letter code)."><Input value={currency} onChange={(e) => setCurrency(e.target.value.slice(0, 3))} maxLength={3} /></Field>
            <Button onClick={saveProfile} loading={saving}><Save className="h-4 w-4" /> Save profile</Button>
          </div>
        </Card>

        <Card>
          <CardHeader title="Appearance" description="Light, dark or follow your system setting." />
          <div className="grid grid-cols-3 gap-3 p-5">
            {themes.map(([v, label, Icon]) => (
              <button key={v} onClick={() => setPreference(v)} className={cn('flex flex-col items-center gap-2 rounded-xl border p-4 text-sm transition-all', preference === v ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700')} aria-pressed={preference === v}>
                <Icon className="h-5 w-5" /> {label}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Change password" description="Use at least 8 characters with a letter and a number." />
          <form onSubmit={changePassword} className="space-y-4 p-5">
            <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
            <Button type="submit" loading={pwSaving} disabled={!pw.current || !pw.next}>Update password</Button>
          </form>
        </Card>

        <Card className="border-rose-200 dark:border-rose-900">
          <CardHeader title="Session & account" description="Sign out on this device, or permanently delete your account and all of your data." />
          <div className="flex flex-wrap gap-3 p-5">
            <Button variant="secondary" onClick={() => { logout(); navigate('/login'); }}><LogOut className="h-4 w-4" /> Log out</Button>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}><Trash2 className="h-4 w-4" /> Delete account</Button>
          </div>
        </Card>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
        footer={<><Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" onClick={deleteAccount} disabled={!deletePw}>Permanently delete</Button></>}
      >
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">This deletes all datasets, cleaning history, dashboards and reports. It cannot be undone.</p>
        <Field label="Confirm with your password"><Input type="password" value={deletePw} onChange={(e) => setDeletePw(e.target.value)} /></Field>
      </Modal>
    </>
  );
}
