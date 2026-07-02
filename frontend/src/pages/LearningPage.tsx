import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, BookOpen, CheckCircle2, Clock, Award,
  ChevronRight, Loader2, AlertCircle, Play,
} from 'lucide-react';
import { learningApi, LearningModule, LearningEnrollment } from '@/api/learning';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  ENROLLED: { label: 'Not Started', color: 'text-blue-600', bg: 'bg-blue-50', icon: BookOpen },
  IN_PROGRESS: { label: 'In Progress', color: 'text-amber-600', bg: 'bg-amber-50', icon: Play },
  COMPLETED: { label: 'Completed', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
  OVERDUE: { label: 'Overdue', color: 'text-red-600', bg: 'bg-red-50', icon: AlertCircle },
  DROPPED: { label: 'Dropped', color: 'text-gray-500', bg: 'bg-gray-50', icon: BookOpen },
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

  const selfEnrollMutation = useMutation({
    mutationFn: learningApi.selfEnroll,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:my'] });
      toast.success('Enrolled successfully');
    },
    onError: () => toast.error('Enrollment failed'),
  });

  const isLoading = loadingMine || loadingAll;

  const enrolledIds = new Set(myModules.map((e) => e.moduleId));
  const availableModules = allModules.filter((m) => !enrolledIds.has(m.id));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          My Learning
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">Track your progress across all training modules</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* My Enrolled Modules */}
          {myModules.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">My Modules</h2>
              <div className="grid gap-4">
                {myModules.map((enrollment) => {
                  const mod = enrollment.module;
                  const status = enrollment.status as keyof typeof STATUS_CONFIG;
                  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ENROLLED;
                  const Icon = cfg.icon;
                  const totalLessons = mod._count?.lessons ?? 0;
                  const completed = (enrollment as typeof enrollment & { _count: { progress: number } })._count?.progress ?? 0;
                  const pct = totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0;

                  return (
                    <div
                      key={enrollment.id}
                      className="bg-card border rounded-xl p-5 hover:border-primary/30 transition-colors cursor-pointer"
                      onClick={() => navigate(`/learning/modules/${mod.id}`)}
                    >
                      <div className="flex items-start gap-4">
                        <div className={cn('rounded-xl p-3 shrink-0', cfg.bg)}>
                          <Icon className={cn('h-6 w-6', cfg.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-semibold truncate">{mod.title}</h3>
                            {mod.isMandatory && (
                              <Badge variant="secondary" className="text-xs shrink-0">Mandatory</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-1">{mod.description}</p>
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>{completed} of {totalLessons} lessons</span>
                              <span className={cfg.color}>{cfg.label}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={cn(
                                  'h-full rounded-full transition-all',
                                  status === 'COMPLETED' ? 'bg-green-500' :
                                  status === 'OVERDUE' ? 'bg-red-400' : 'bg-primary'
                                )}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            {enrollment.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                Due {new Date(enrollment.dueDate).toLocaleDateString('en-IN')}
                              </span>
                            )}
                            {mod.durationDays && <span>{mod.durationDays}-day program</span>}
                            {enrollment.passed && (
                              <span className="flex items-center gap-1 text-green-600">
                                <Award className="h-3 w-3" />
                                {enrollment.score?.toFixed(0)}% score
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Available Modules */}
          {availableModules.length > 0 && (
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Available Modules</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {availableModules.map((mod) => (
                  <div key={mod.id} className="bg-card border rounded-xl p-5 flex flex-col gap-3">
                    <div>
                      <h3 className="font-semibold">{mod.title}</h3>
                      {mod.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{mod.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BookOpen className="h-3 w-3" />
                        {mod._count?.lessons ?? 0} lessons
                      </span>
                      {mod.durationDays && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {mod.durationDays} days
                        </span>
                      )}
                      {mod.isMandatory && (
                        <Badge variant="secondary" className="text-xs">Mandatory</Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full mt-auto"
                      onClick={() => selfEnrollMutation.mutate(mod.id)}
                      disabled={selfEnrollMutation.isPending}
                    >
                      {selfEnrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Start Learning
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {myModules.length === 0 && availableModules.length === 0 && (
            <div className="border-2 border-dashed rounded-xl p-12 text-center">
              <GraduationCap className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="text-lg font-medium text-muted-foreground">No modules yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Your department admin will publish modules for you to complete.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
