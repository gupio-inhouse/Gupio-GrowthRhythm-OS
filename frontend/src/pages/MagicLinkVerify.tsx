import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Zap, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getRoleRedirect } from '@/lib/roleRedirect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import api from '@/api/client';

type Status = 'verifying' | 'setup' | 'success' | 'error';

type AuthPayload = {
  token: string;
  user: { id: string; name: string; email: string; role: string; departmentId?: string; departmentSlug?: string | null };
  org: { id: string; name: string; plan: string; industry?: string };
};

type VerifyResponse =
  | ({ setupRequired: true } & Pick<AuthPayload, 'user' | 'org'>)
  | ({ setupRequired?: false } & AuthPayload);

export default function MagicLinkVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingUserName, setPendingUserName] = useState('');

  const token = searchParams.get('token');

  const finishLogin = (payload: AuthPayload) => {
    setAuth(payload.token, {
      ...payload.user,
      departmentSlug: payload.user.departmentSlug ?? undefined,
    }, payload.org);
    setStatus('success');
    setTimeout(() => {
      const redirect = getRoleRedirect(payload.user.role, payload.user.departmentSlug);
      navigate(redirect, { replace: true });
    }, 1200);
  };

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No magic link token found. Please check your invite email and try again.');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const res = await api.post('/magic/verify', { token });
        if (cancelled) return;

        const data = res.data as VerifyResponse;
        if (data.setupRequired) {
          setPendingUserName(data.user.name);
          setStatus('setup');
          return;
        }

        finishLogin(data);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
          'Something went wrong. Please request a new invite link.';
        setErrorMsg(msg);
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSetPassword = async () => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No magic link token found. Please request a new invite.');
      return;
    }
    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await api.post('/magic/accept-invite', { token, password });
      finishLogin(res.data as AuthPayload);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } }).response?.data?.error ??
        'Unable to complete account setup. Please request a new invite link.';
      setErrorMsg(msg);
      setStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-white">GrowthRhythm</p>
            <p className="text-xs text-blue-300">Business Operating System</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-8 py-10 text-center">
          {status === 'verifying' && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">Verifying your link...</h1>
              <p className="text-sm text-blue-200/70">Please wait while we check your invite.</p>
            </>
          )}

          {status === 'setup' && (
            <div className="space-y-5 text-left">
              <div className="text-center">
                <h1 className="text-xl font-semibold text-white mb-2">Set your password</h1>
                <p className="text-sm text-blue-200/70">
                  {pendingUserName ? `${pendingUserName}, ` : ''}finish setting up your account so you can log in normally next time.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-blue-100">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-blue-100">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
                />
              </div>

              {errorMsg && <p className="text-sm text-red-300">{errorMsg}</p>}

              <Button
                type="button"
                className="w-full bg-blue-600 hover:bg-blue-500"
                onClick={handleSetPassword}
                disabled={submitting}
              >
                {submitting ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </div>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">You're in!</h1>
              <p className="text-sm text-blue-200/70">Redirecting you to your workspace...</p>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="flex justify-center mb-4">
                <XCircle className="h-12 w-12 text-red-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-3">Link invalid or expired</h1>
              <p className="text-sm text-red-300/90 mb-6 leading-relaxed">{errorMsg}</p>
              <button
                onClick={() => navigate('/login', { replace: true })}
                className="inline-flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-500 px-6 py-2.5 text-sm font-medium text-white transition-colors"
              >
                Go to Login
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
