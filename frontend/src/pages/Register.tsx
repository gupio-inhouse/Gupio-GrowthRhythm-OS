import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

const schema = z.object({
  name: z.string().min(2, 'Name too short'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be 8+ characters'),
  companyName: z.string().min(2, 'Company name required'),
  industry: z.string().min(2, 'Industry required'),
  phone: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

const industries = [
  'Digital Marketing Agency', 'IT Services', 'Consulting / Coaching',
  'Event Management', 'Healthcare Clinic', 'Education Business',
  'Light Manufacturing', 'Retail Chain', 'Other',
];

export default function Register() {
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      const res = await api.post('/auth/register', data);
      setAuth(res.data.token, res.data.user, res.data.org);
      navigate('/dashboard');
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Registration failed');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-4">
      <div className="w-full max-w-lg">
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
            <CardTitle className="text-white text-2xl">Create your workspace</CardTitle>
            <CardDescription className="text-blue-200">Set up GrowthRhythm OS for your company</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-blue-100 mb-1.5">Your name</label>
                  <Input {...register('name')} placeholder="Rahul Sharma" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-blue-100 mb-1.5">Phone</label>
                  <Input {...register('phone')} placeholder="+91 98765 43210" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-100 mb-1.5">Work email</label>
                <Input {...register('email')} type="email" placeholder="rahul@company.com" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-blue-100 mb-1.5">Password</label>
                <Input {...register('password')} type="password" placeholder="Min 8 characters" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password.message}</p>}
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-sm font-medium text-blue-200 mb-3">Company details</p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-blue-100 mb-1.5">Company name</label>
                    <Input {...register('companyName')} placeholder="Acme Digital Pvt Ltd" className="bg-white/10 border-white/20 text-white placeholder:text-white/40" />
                    {errors.companyName && <p className="text-red-400 text-xs mt-1">{errors.companyName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-blue-100 mb-1.5">Industry</label>
                    <select
                      {...register('industry')}
                      className="flex h-10 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option value="" className="bg-slate-800">Select industry</option>
                      {industries.map((i) => (
                        <option key={i} value={i} className="bg-slate-800">{i}</option>
                      ))}
                    </select>
                    {errors.industry && <p className="text-red-400 text-xs mt-1">{errors.industry.message}</p>}
                  </div>
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-500" disabled={isSubmitting}>
                {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating workspace...</> : 'Create workspace'}
              </Button>
            </form>

            <p className="text-center text-sm text-blue-200/70 mt-6">
              Already have a workspace?{' '}
              <Link to="/login" className="text-blue-300 hover:text-white font-medium">Sign in</Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
