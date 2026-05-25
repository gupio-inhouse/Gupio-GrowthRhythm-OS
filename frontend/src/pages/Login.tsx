import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';
import { getRoleRedirect } from '@/lib/roleRedirect';
import api from '@/api/client';

const schema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password required'),
});

type FormData = z.infer<typeof schema>;

export default function Login() {
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const setAuth = useAuthStore((s) => s.setAuth);

  const handleForgot = async () => {
    if (!forgotEmail) return;
    setForgotLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: forgotEmail });
      setForgotSent(true);
    } finally {
      setForgotLoading(false);
    }
  };

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      const res = await api.post('/auth/login', data);
      setAuth(res.data.token, res.data.user, res.data.org);
      const destination = returnTo && returnTo !== '/login' && returnTo !== '/'
        ? returnTo
        : getRoleRedirect(res.data.user.role, res.data.user.departmentSlug);
      navigate(destination, { replace: true });
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Login failed');
    }
  };

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

        <Card className="border-white/10 bg-white/5 backdrop-blur text-white">
          <CardHeader className="text-center">
            <CardTitle className="text-white text-2xl">Welcome back</CardTitle>
            <CardDescription className="text-blue-200">Sign in to your workspace</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-blue-100 mb-1.5">Email</label>
                <Input
                  id="email"
                  {...register('email')}
                  type="email"
                  placeholder="you@company.com"
                  className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400"
                />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-blue-100 mb-1.5">Password</label>
                <div className="relative">
                  <Input
                    id="password"
                    {...register('password')}
                    type={showPw ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus-visible:ring-blue-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80"
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              {error && (
                <div className="rounded-md bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in...</> : 'Sign in'}
              </Button>

              <p className="text-center">
                <button type="button" onClick={() => { setForgotOpen(true); setForgotSent(false); setForgotEmail(''); }}
                  className="text-sm text-blue-300/70 hover:text-blue-300 transition-colors">
                  Forgot password?
                </button>
              </p>
            </form>

            <p className="text-center text-sm text-blue-200/70 mt-6">
              New to GrowthRhythm?{' '}
              <Link to="/register" className="text-blue-300 hover:text-white font-medium">
                Create workspace
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Forgot password dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
          </DialogHeader>
          {forgotSent ? (
            <div className="py-6 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
              <p className="font-medium">Check your inbox</p>
              <p className="text-sm text-muted-foreground">
                If <strong>{forgotEmail}</strong> has an account, a reset link has been sent. It expires in 1 hour.
              </p>
              <Button variant="outline" className="mt-2" onClick={() => setForgotOpen(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <p className="text-sm text-muted-foreground">Enter your email and we'll send you a reset link.</p>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" placeholder="you@company.com" value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleForgot()} />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                <Button onClick={handleForgot} disabled={!forgotEmail || forgotLoading}>
                  {forgotLoading ? 'Sending…' : 'Send reset link'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
