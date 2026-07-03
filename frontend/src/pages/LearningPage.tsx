import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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

export default function LearningPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const qc = useQueryClient();

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
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 text-white p-8">
        <div className="absolute -top-24 -right-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-white/70 text-sm font-medium flex items-center gap-1.5">
              <GraduationCap className="h-4 w-4" /> Gupio Learning
            </p>
            <h1 className="text-3xl font-bold mt-1">Welcome back, {firstName} 👋</h1>
            <p className="text-white/80 mt-1.5 max-w-md">
              {inProgress.length > 0
                ? 'Pick up where you left off — consistency beats intensity.'
                : 'Explore a course below and start building your streak.'}
            </p>
          </div>
          {(stats?.streakDays ?? 0) > 0 && (
            <div className="flex items-center gap-3 bg-white/15 backdrop-blur rounded-2xl px-5 py-4">
              <Flame className="h-9 w-9 text-amber-300" />
              <div>
                <p className="text-2xl font-bold leading-none">{stats!.streakDays}</p>
                <p className="text-xs text-white/80 mt-1">day streak — keep it alive!</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Clock} tint="text-sky-600 bg-sky-500/10" value={formatWatchTime(stats?.totalWatchSec ?? 0)} label="Watch time" />
        <StatCard icon={Flame} tint="text-orange-600 bg-orange-500/10" value={`${stats?.streakDays ?? 0} ${(stats?.streakDays ?? 0) === 1 ? 'day' : 'days'}`} label="Learning streak" />
        <StatCard icon={CheckCircle2} tint="text-emerald-600 bg-emerald-500/10" value={String(stats?.lessonsCompleted ?? 0)} label="Lessons completed" />
        <StatCard icon={Award} tint="text-violet-600 bg-violet-500/10" value={String(stats?.certificateCount ?? 0)} label="Certificates" />
      </div>

      {/* Continue learning */}
      {inProgress.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg flex items-center gap-2">
              <Play className="h-5 w-5 text-primary" /> Continue learning
            </h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
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
                  className="group text-left bg-card border rounded-2xl overflow-hidden hover:shadow-lg hover:border-primary/40 transition-all"
                >
                  <div className={cn('h-2 bg-gradient-to-r', coverGradient(mod.title))} />
                  <div className="p-5 flex items-center gap-4">
                    <ProgressRing pct={pct} size={56} stroke={5} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate">{mod.title}</h3>
                        {overdue && (
                          <Badge variant="secondary" className="bg-red-50 text-red-600 border-red-200 shrink-0">
                            <AlertCircle className="h-3 w-3 mr-1" /> Overdue
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {done} of {totalLessons} lessons
                        {enrollment.dueDate && (
                          <span> · due {new Date(enrollment.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                        )}
                      </p>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-primary mt-2 group-hover:gap-2 transition-all">
                        Resume <ArrowRight className="h-4 w-4" />
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
        <section className="space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" /> Explore courses
          </h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
        <section className="space-y-4">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <Award className="h-5 w-5 text-emerald-600" /> Completed
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {completed.map((enrollment) => {
              const mod = enrollment.module;
              return (
                <button
                  key={enrollment.id}
                  onClick={() => navigate(`/learning/modules/${mod.id}`)}
                  className="text-left bg-card border rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl p-2.5 bg-emerald-500/10">
                      <Award className="h-5 w-5 text-emerald-600" />
                    </div>
                    {enrollment.passed && (
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        {enrollment.score?.toFixed(0)}% · Passed
                      </Badge>
                    )}
                  </div>
                  <h3 className="font-semibold mt-3 line-clamp-1">{mod.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Completed {enrollment.completedAt ? new Date(enrollment.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {myModules.length === 0 && availableModules.length === 0 && (
        <div className="border-2 border-dashed rounded-2xl p-16 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <GraduationCap className="h-8 w-8 text-primary" />
          </div>
          <p className="text-lg font-semibold">No courses yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Your department admin will publish courses for you. Check back soon.
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
    <div className="bg-card border rounded-2xl p-4 flex items-center gap-3.5">
      <div className={cn('rounded-xl p-2.5 shrink-0', tint)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold leading-tight truncate">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
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
    <div className="group bg-card border rounded-2xl overflow-hidden flex flex-col hover:shadow-lg hover:border-primary/30 transition-all">
      <div className={cn('relative h-28 bg-gradient-to-br', coverGradient(mod.title))}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.25),transparent_50%)]" />
        <BookOpen className="absolute bottom-4 right-4 h-8 w-8 text-white/40" />
        <div className="absolute top-3 left-3 flex gap-1.5">
          <Badge className="bg-white/20 text-white border-0 backdrop-blur hover:bg-white/20">
            {TYPE_LABELS[mod.type] ?? 'Course'}
          </Badge>
          {mod.isMandatory && (
            <Badge className="bg-black/30 text-white border-0 backdrop-blur hover:bg-black/30">Mandatory</Badge>
          )}
        </div>
      </div>
      <div className="p-5 flex flex-col flex-1 gap-3">
        <div className="flex-1">
          <h3 className="font-semibold leading-snug">{mod.title}</h3>
          {mod.description && (
            <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{mod.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3.5 text-xs text-muted-foreground">
          {(mod._count?.phases ?? 0) > 0 && (
            <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{mod._count!.phases} phases</span>
          )}
          <span className="flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" />{mod._count?.lessons ?? 0} lessons</span>
          {mod.durationDays && (
            <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{mod.durationDays} days</span>
          )}
        </div>
        <Button className="w-full" onClick={onEnroll} disabled={enrolling}>
          {enrolling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Start Learning
        </Button>
      </div>
    </div>
  );
}
