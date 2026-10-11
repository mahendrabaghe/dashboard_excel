import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BarChart3, Lock, Mail, User, Eye, EyeOff, ShieldCheck, Zap, LineChart } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { Button, Input, Field } from '../components/ui/index.jsx';

export default function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const { login, register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email.trim() || !form.password) return setError('Email and password are required.');
    if (!isLogin && !form.name.trim()) return setError('Please enter your name.');
    if (!isLogin && form.password.length < 8) return setError('Password must be at least 8 characters.');
    setLoading(true);
    try {
      if (isLogin) await login(form.email, form.password);
      else await register(form.name, form.email, form.password);
      toast.success(isLogin ? 'Welcome back!' : 'Account created. Let\u2019s import your first dataset.');
      navigate(isLogin ? '/app' : '/app/upload', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-indigo-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <BarChart3 className="h-6 w-6" /> DataPulse
        </div>
        <div className="space-y-6">
          <h2 className="text-4xl font-semibold leading-tight">From raw spreadsheet to decision-ready dashboard in seconds.</h2>
          <ul className="space-y-4 text-brand-50">
            <li className="flex gap-3"><Zap className="mt-0.5 h-5 w-5 shrink-0" /> Import CSV and Excel files, then clean them without code.</li>
            <li className="flex gap-3"><LineChart className="mt-0.5 h-5 w-5 shrink-0" /> Charts and KPIs generated automatically from your columns.</li>
            <li className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /> Your data is private to your account.</li>
          </ul>
        </div>
        <p className="text-sm text-brand-100/80">Limits: files up to 10 MB and 200,000 rows.</p>
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <BarChart3 className="h-6 w-6 text-brand-600" />
            <span className="text-lg font-semibold">DataPulse</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{isLogin ? 'Sign in to your account' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isLogin ? 'Enter your credentials to continue.' : 'Start turning spreadsheets into dashboards.'}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            {!isLogin && (
              <Field label="Full name">
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input className="pl-9" autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Lovelace" />
                </div>
              </Field>
            )}
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@company.com" />
              </div>
            </Field>
            <Field label="Password" hint={!isLogin ? 'At least 8 characters with a letter and a number.' : undefined}>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9 pr-10" type={show ? 'text' : 'password'} autoComplete={isLogin ? 'current-password' : 'new-password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600" aria-label={show ? 'Hide password' : 'Show password'}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {isLogin ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            {isLogin ? 'New to DataPulse? ' : 'Already have an account? '}
            <Link to={isLogin ? '/register' : '/login'} className="font-medium text-brand-600 hover:underline">
              {isLogin ? 'Create an account' : 'Sign in'}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
