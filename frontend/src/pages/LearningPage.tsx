import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  GraduationCap, BookOpen, CheckCircle2, Clock, Award,
  Loader2, AlertCircle, Play, Flame, Layers, CalendarDays,
  Sparkles, ArrowRight,
} from 'lucide-react';
import { learningApi, LearningModule } from '@/api/learning';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProgressRing, formatWatchTime } from '@/components/learning/ProgressRing';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const COVER_GRADIENTS = [
  'from-indigo-500 via-purple-500 to-pink-500',
  'from-sky-500 via-blue-600 to-indigo-600',
  'from-emerald-500 via-teal-500 to-cyan-600',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-fuchsia-500 via-purple-600 to-indigo-600',
  'from-rose-500 via-pink-600 to-purple-600',
];

function coverGradient(title: string): string {
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  return COVER_GRADIENTS[hash % COVER_GRADIENTS.length];
}

const TYPE_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  COMPLIANCE: 'Compliance',
  SKILLS: 'Skills',
  PRODUCT: 'Product',
  PROCESS: 'Process',
  CERTIFICATION: 'Certification',
  OTHER: 'Course',
};

export default function LearningPage({ isEmbedded = false }: { isEmbedded?: boolean }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const isAdmin = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  if (isAdmin && !isEmbedded) {
    return <Navigate to="/learning/admin" replace />;
  }

  const { data: myModules = [], isLoading: loadingMine } = useQuery({
    queryKey: ['learning:my'],
    queryFn: learningApi.getMyModules,
  });

  const { data: allModules = [], isLoading: loadingAll } = useQuery({
    queryKey: ['learning:all'],
    queryFn: learningApi.getModules,
  });

  const { data: stats } = useQuery({
    queryKey: ['learning:stats'],
    queryFn: learningApi.getMyStats,
  });

  const selfEnrollMutation = useMutation({
    mutationFn: learningApi.selfEnroll,
    onSuccess: (enrollment) => {
      qc.invalidateQueries({ queryKey: ['learning:my'] });
      toast.success("Enrolled — let's start learning!");
      navigate(`/learning/modules/${enrollment.moduleId}`);
    },
    onError: () => toast.error('Enrollment failed'),
  });

  const isLoading = loadingMine || loadingAll;

  const enrolledIds = new Set(myModules.map((e) => e.moduleId));
  const availableModules = allModules.filter((m) => !enrolledIds.has(m.id));

  const inProgress = myModules.filter((e) => e.status === 'IN_PROGRESS' || e.status === 'ENROLLED' || e.status === 'OVERDUE');
  const completed = myModules.filter((e) => e.status === 'COMPLETED');

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] || 'there';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn(isEmbedded ? 'space-y-10' : 'p-8 max-w-full mx-auto space-y-10')}>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 text-white p-10 shadow-2xl shadow-indigo-900/20 border border-white/10 group">
        {/* Animated glowing mesh backdrops */}
        <div className="absolute -top-24 -right-16 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl transition-transform duration-1000 group-hover:scale-110" />
        <div className="absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-sky-400/20 blur-3xl transition-transform duration-1000 group-hover:scale-125" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:24px_24px]" />
        
        <div className="relative flex flex-wrap items-center justify-between gap-8">
          <div className="space-y-2">
            <p className="text-indigo-200 text-xs font-semibold uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-fuchsia-400 animate-pulse" /> Gupio Learning Experience
            </p>
            <h1 className="text-4xl font-extrabold tracking-tight mt-1 bg-gradient-to-r from-white via-white to-indigo-200 bg-clip-text text-transparent">
              Welcome back, {firstName} 👋
            </h1>
            <p className="text-indigo-100/80 text-base max-w-lg font-medium leading-relaxed">
              {inProgress.length > 0
                ? 'Your knowledge stream is active. Continue your momentum today.'
                : 'Discover curated learning paths and elevate your workflow.'}
            </p>
          </div>
          {(stats?.streakDays ?? 0) > 0 && (
            <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-6 py-5 shadow-lg hover:bg-white/15 transition-all duration-300">
              <div className="relative">
                <Flame className="h-10 w-10 text-amber-400 animate-bounce" style={{ animationDuration: '2s' }} />
                <span className="absolute inset-0 rounded-full bg-amber-400/30 blur-md animate-ping" />
              </div>
              <div>
                <p className="text-3xl font-black tracking-tight leading-none text-amber-300">{stats!.streakDays}</p>
                <p className="text-xs text-indigo-100 font-semibold mt-1.5 uppercase tracking-wider">day streak</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard icon={Clock} tint="text-sky-500 bg-sky-500/10 border-sky-500/20" value={formatWatchTime(stats?.totalWatchSec ?? 0)} label="Time Invested" />
        <StatCard icon={Flame} tint="text-amber-500 bg-amber-500/10 border-amber-500/20" value={`${stats?.streakDays ?? 0} ${(stats?.streakDays ?? 0) === 1 ? 'day' : 'days'}`} label="Streak Goal" />
        <StatCard icon={CheckCircle2} tint="text-emerald-500 bg-emerald-500/10 border-emerald-500/20" value={String(stats?.lessonsCompleted ?? 0)} label="Lessons Completed" />
        <StatCard icon={Award} tint="text-violet-500 bg-violet-500/10 border-violet-500/20" value={String(stats?.certificateCount ?? 0)} label="Certificates Earned" />
      </div>

      {/* Continue learning */}
      {inProgress.length > 0 && (
        <section className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground/90">
              <Play className="h-5 w-5 text-indigo-500 fill-indigo-500/20 animate-pulse" /> Resume Progress
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {inProgress.map((enrollment) => {
              const mod = enrollment.module;
              const totalLessons = mod._count?.lessons ?? 0;
              const done = enrollment._count?.progress ?? 0;
              const pct = totalLessons > 0 ? Math.round((done / totalLessons) * 100) : 0;
              const overdue = enrollment.status === 'OVERDUE';

              return (
                <button
                  key={enrollment.id}
                  onClick={() => navigate(`/learning/modules/${mod.id}`)}
                  className="group text-left bg-card/65 backdrop-blur-md border border-muted/50 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className={cn('h-1.5 bg-gradient-to-r', coverGradient(mod.title))} />
                  <div className="p-6 flex items-center gap-5">
                    <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
                      <ProgressRing pct={pct} size={64} stroke={6} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xs font-bold text-foreground/80">{pct}%</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-lg text-foreground/90 group-hover:text-primary transition-colors truncate">{mod.title}</h3>
                        {overdue && (
                          <Badge variant="secondary" className="bg-red-500/10 text-red-500 border border-red-500/20 shadow-sm shrink-0">
                            <AlertCircle className="h-3 w-3 mr-1" /> Overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {done} of {totalLessons} modules completed
                        {enrollment.dueDate && (
                          <span className="text-xs ml-2 px-2 py-0.5 rounded-full bg-muted font-medium">due {new Date(enrollment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        )}
                      </p>
                      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary mt-3 group-hover:gap-2.5 transition-all">
                        Continue module <ArrowRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Explore */}
      {availableModules.length > 0 && (
        <section className="space-y-5">
          <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground/90">
            <Sparkles className="h-5 w-5 text-indigo-500" /> Explore paths
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {availableModules.map((mod) => (
              <CourseCard
                key={mod.id}
                mod={mod}
                enrolling={selfEnrollMutation.isPending && selfEnrollMutation.variables === mod.id}
                onEnroll={() => selfEnrollMutation.mutate(mod.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <section className="space-y-5">
          <h2 className="font-bold text-xl flex items-center gap-2.5 text-foreground/90">
            <Award className="h-5 w-5 text-emerald-500" /> Finished Courses
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((enrollment) => {
              const mod = enrollment.module;
              return (
                <button
                  key={enrollment.id}
                  onClick={() => navigate(`/learning/modules/${mod.id}`)}
                  className="group text-left bg-card/65 backdrop-blur-md border border-muted/50 rounded-2xl p-6 shadow-sm hover:shadow-xl hover:border-emerald-500/40 hover:-translate-y-0.5 transition-all duration-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-2xl p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 transition-transform duration-300 group-hover:scale-105">
                      <Award className="h-6 w-6" />
                    </div>
                    {enrollment.passed && (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-emerald-500/15">
                        {enrollment.score?.toFixed(0)}% Score
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-bold text-lg text-foreground/90 mt-4 group-hover:text-emerald-600 transition-colors line-clamp-1">{mod.title}</h3>
                  <p className="text-xs text-muted-foreground mt-2 font-medium flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed on {enrollment.completedAt ? new Date(enrollment.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {myModules.length === 0 && availableModules.length === 0 && (
        <div className="border-2 border-dashed border-muted rounded-3xl p-20 text-center bg-card/25 backdrop-blur-sm">
          <div className="mx-auto h-20 w-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-6 animate-pulse">
            <GraduationCap className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground/95">No active courses</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
            Your department administrator will assign and publish learning modules for you here.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: React.ElementType;
  tint: string;
  value: string;
  label: string;
}) {
  return (
    <div className="relative overflow-hidden bg-card/65 backdrop-blur-md border border-muted/50 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5">
      <div className={cn('rounded-xl p-3 border shrink-0 transition-transform duration-300 hover:scale-105', tint)}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-extrabold tracking-tight leading-tight truncate">{value}</p>
        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function CourseCard({
  mod,
  enrolling,
  onEnroll,
}: {
  mod: LearningModule;
  enrolling: boolean;
  onEnroll: () => void;
}) {
  return (
    <div className="group bg-card/60 backdrop-blur-sm border border-muted/60 rounded-3xl overflow-hidden flex flex-col hover:shadow-2xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300 hover:-translate-y-1">
      <div className="relative h-32 overflow-hidden">
        <div className={cn('absolute inset-0 bg-gradient-to-br transition-transform duration-500 group-hover:scale-105', coverGradient(mod.title))}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent_60%)]" />
        </div>
        <BookOpen className="absolute bottom-4 right-4 h-10 w-10 text-white/30" />
        <div className="absolute top-4 left-4 flex gap-2">
          <Badge className="bg-white/15 text-white border border-white/20 backdrop-blur-md hover:bg-white/25">
            {TYPE_LABELS[mod.type] ?? 'Course'}
          </Badge>
          {mod.isMandatory && (
            <Badge className="bg-red-500/20 text-white border border-red-500/30 backdrop-blur-md hover:bg-red-500/25">Mandatory</Badge>
          )}
        </div>
      </div>
      <div className="p-6 flex flex-col flex-1 gap-4">
        <div className="flex-1 space-y-1.5">
          <h3 className="font-bold text-lg text-foreground/90 group-hover:text-primary transition-colors line-clamp-1 leading-snug">{mod.title}</h3>
          {mod.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">{mod.description}</p>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground border-t border-muted/50 pt-4">
          {(mod._count?.phases ?? 0) > 0 && (
            <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-indigo-500/70" />{mod._count!.phases} phases</span>
          )}
          <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-indigo-500/70" />{mod._count?.lessons ?? 0} lessons</span>
          {mod.durationDays && (
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-indigo-500/70" />{mod.durationDays} days</span>
          )}
        </div>
        <Button className="w-full font-bold shadow-md hover:shadow-lg transition-all" onClick={onEnroll} disabled={enrolling}>
          {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Start Course
        </Button>
      </div>
    </div>
  );
}
