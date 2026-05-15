import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, Zap, CheckCircle, XCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { getRoleRedirect } from '@/lib/roleRedirect';
import api from '@/api/client';

type Status = 'verifying' | 'success' | 'error';

export default function MagicLinkVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [status, setStatus] = useState<Status>('verifying');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');

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

        const { token: jwtToken, user, org } = res.data as {
          token: string;
          user: { id: string; name: string; email: string; role: string; departmentId?: string; departmentSlug?: string };
          org: { id: string; name: string; plan: string; industry?: string };
        };

        setAuth(jwtToken, user, org);
        setStatus('success');

        // Redirect after a brief success flash
        setTimeout(() => {
          const redirect = getRoleRedirect(user.role, user.departmentSlug);
          navigate(redirect, { replace: true });
        }, 1200);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600">
            <Zap className="h-6 w-6 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-white">GrowthRhythm</p>
            <p className="text-xs text-blue-300">Business Operating System</p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm px-8 py-10 text-center">
          {status === 'verifying' && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 text-blue-400 animate-spin" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">Verifying your link&hellip;</h1>
              <p className="text-sm text-blue-200/70">Please wait while we sign you in.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <CheckCircle className="h-12 w-12 text-emerald-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">You&apos;re in!</h1>
              <p className="text-sm text-blue-200/70">Redirecting you to your workspace&hellip;</p>
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
