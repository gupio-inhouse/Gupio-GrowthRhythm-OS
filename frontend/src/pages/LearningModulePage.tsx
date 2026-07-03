import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Video, FileText,
  Link2, CheckSquare, HelpCircle, ChevronRight, ChevronLeft, Award, Loader2,
  Clock, Play, ChevronDown, ChevronUp, ListVideo, X, Download, Trophy, Layers,
} from 'lucide-react';
import { learningApi, LearningLesson, LessonProgress, LearningCertificate } from '@/api/learning';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProgressRing } from '@/components/learning/ProgressRing';
import { useWatchHeartbeat } from '@/hooks/useWatchHeartbeat';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getEmbeddableVideo } from '@/lib/videoEmbed';

const CONTENT_ICONS: Record<string, React.ElementType> = {
  VIDEO: Video,
  PDF: FileText,
  ARTICLE: BookOpen,
  QUIZ: HelpCircle,
  EMBED: Link2,
  CHECKPOINT: CheckSquare,
};

export default function LearningModulePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [contentOpen, setContentOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const { data: module, isLoading } = useQuery({
    queryKey: ['learning:module', id],
    queryFn: () => learningApi.getModule(id!),
    enabled: !!id,
  });

  const { data: enrollment } = useQuery<{
    id: string;
    status: string;
    score: number | null;
    passed: boolean | null;
    progress: LessonProgress[];
    certificate: LearningCertificate | null;
  }>({
    queryKey: ['learning:progress', id],
    queryFn: () => learningApi.getMyProgress(id!),
    enabled: !!id && !!module?.myEnrollment,
  });

  const progressMutation = useMutation({
    mutationFn: ({
      lessonId,
      data,
    }: {
      lessonId: string;
      data: Parameters<typeof learningApi.updateProgress>[2];
    }) => learningApi.updateProgress(lessonId, enrollment?.id ?? module?.myEnrollment?.id ?? '', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:progress', id] });
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      qc.invalidateQueries({ queryKey: ['learning:my'] });
      qc.invalidateQueries({ queryKey: ['learning:stats'] });
    },
  });

  const selfEnrollMutation = useMutation({
    mutationFn: () => learningApi.selfEnroll(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      qc.invalidateQueries({ queryKey: ['learning:my'] });
      toast.success("Enrolled — let's start learning!");
    },
  });

  const lessons = useMemo(() => module?.lessons ?? [], [module]);
  const activeLesson = lessons.find((l) => l.id === activeLessonId) ?? null;

  const progressMap = useMemo(() => {
    const map: Record<string, LessonProgress> = {};
    for (const p of enrollment?.progress ?? module?.myEnrollment?.progress ?? []) {
      map[p.lessonId] = p;
    }
    return map;
  }, [enrollment, module]);

  const enrollmentId = enrollment?.id ?? module?.myEnrollment?.id;

  // Watch-time heartbeat for the open lesson (visibility-aware, server-capped)
  useWatchHeartbeat(activeLesson?.id, enrollmentId);

  // Resume: open the first lesson the learner hasn't completed yet
  useEffect(() => {
    if (!module || lessons.length === 0 || activeLessonId) return;
    if (!module.myEnrollment) {
      setActiveLessonId(lessons[0].id);
      return;
    }
    const progressed = new Set(
      (enrollment?.progress ?? module.myEnrollment.progress ?? [])
        .filter((p) => p.status === 'COMPLETED')
        .map((p) => p.lessonId)
    );
    const next = lessons.find((l) => !progressed.has(l.id)) ?? lessons[0];
    setActiveLessonId(next.id);
  }, [module, enrollment, lessons, activeLessonId]);

  // Per-lesson UI resets + keep the active lesson's phase expanded
  useEffect(() => {
    if (!activeLesson) return;
    setQuizAnswers({});
    setQuizSubmitted(false);
    setTab(activeLesson.contentType === 'QUIZ' && (activeLesson.quizzes?.length ?? 0) > 0 ? 'quiz' : 'overview');
    if (activeLesson.phaseId) {
      setExpandedPhases((prev) => (prev.has(activeLesson.phaseId!) ? prev : new Set(prev).add(activeLesson.phaseId!)));
    }
  }, [activeLessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!module) return null;

  const myEnrollment = module.myEnrollment;

  const requiredLessons = lessons.filter((l) => l.isRequired);
  const completedCount = requiredLessons.filter((l) => progressMap[l.id]?.status === 'COMPLETED').length;
  const pct = requiredLessons.length > 0 ? Math.round((completedCount / requiredLessons.length) * 100) : 0;

  const activeIdx = activeLesson ? lessons.findIndex((l) => l.id === activeLesson.id) : -1;
  const prevLesson = activeIdx > 0 ? lessons[activeIdx - 1] : null;
  const nextLesson = activeIdx >= 0 && activeIdx < lessons.length - 1 ? lessons[activeIdx + 1] : null;

  const lessonsByPhase: Record<string, LearningLesson[]> = {};
  const ungrouped: LearningLesson[] = [];
  for (const lesson of lessons) {
    if (lesson.phaseId) {
      (lessonsByPhase[lesson.phaseId] ??= []).push(lesson);
    } else {
      ungrouped.push(lesson);
    }
  }

  function goTo(lesson: LearningLesson) {
    setActiveLessonId(lesson.id);
    setContentOpen(false);
  }

  function markComplete() {
    if (!activeLesson || !enrollmentId) return;
    progressMutation.mutate({
      lessonId: activeLesson.id,
      data: { status: 'COMPLETED' },
    });
    toast.success('Lesson completed 🎉');
    if (nextLesson) goTo(nextLesson);
  }

  function submitQuiz() {
    if (!activeLesson?.quizzes || !enrollmentId) return;
    const quizzes = activeLesson.quizzes;
    let correct = 0;
    let total = 0;
    for (const q of quizzes) {
      total += q.points;
      if (quizAnswers[q.id] === q.correctAnswer) correct += q.points;
    }
    const score = total > 0 ? Math.round((correct / total) * 100) : 100;
    progressMutation.mutate({
      lessonId: activeLesson.id,
      data: {
        status: 'COMPLETED',
        quizScore: score,
        quizAnswers: quizzes.map((q) => quizAnswers[q.id] ?? -1),
      },
    });
    setQuizSubmitted(true);
  }

  const activeProgress = activeLesson ? progressMap[activeLesson.id] : undefined;
  const activeCompleted = activeProgress?.status === 'COMPLETED';
  const hasQuiz = (activeLesson?.quizzes?.length ?? 0) > 0;
  const hasNotes = !!activeLesson?.notesUrl;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-background/70 backdrop-blur-md border-b border-muted/60 px-6 py-4 flex items-center gap-4 shadow-sm">
          <button
            className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground shrink-0 transition-colors"
            onClick={() => navigate('/learning')}
          >
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Dashboard</span>
          </button>
          <div className="h-5 w-px bg-muted-foreground/20 shrink-0" />
          <h2 className="font-bold text-base text-foreground/90 truncate flex-1">{module.title}</h2>
          {myEnrollment && (
            <div className="hidden sm:flex items-center gap-3 shrink-0 bg-muted/40 border border-muted/60 px-4 py-1.5 rounded-full">
              <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-bold text-muted-foreground">{pct}%</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="lg:hidden shrink-0 font-semibold" onClick={() => setContentOpen(true)}>
            <ListVideo className="h-4 w-4 mr-1.5" /> Content
          </Button>
          {myEnrollment && (
            <div className="absolute bottom-0 left-0 h-0.5 bg-primary/75 transition-all duration-500" style={{ width: `${pct}%` }} />
          )}
        </div>

        {!myEnrollment ? (
          <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6 text-center p-8 max-w-2xl mx-auto">
            <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-xl shadow-indigo-500/20 animate-pulse">
              <BookOpen className="h-12 w-12 text-white" />
            </div>
            <div className="space-y-2.5">
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground/90">{module.title}</h2>
              <p className="text-muted-foreground text-base leading-relaxed">{module.description}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-semibold text-muted-foreground bg-muted/40 border border-muted/60 px-5 py-2.5 rounded-full shadow-inner">
              <span className="flex items-center gap-1.5"><Layers className="h-4 w-4 text-indigo-500" />{module.phases.length} phases</span>
              <span className="h-4 w-px bg-muted-foreground/20" />
              <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4 text-indigo-500" />{lessons.length} lessons</span>
              {module.durationDays && (
                <>
                  <span className="h-4 w-px bg-muted-foreground/20" />
                  <span className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-indigo-500" />{module.durationDays}-day program</span>
                </>
              )}
            </div>
            <Button size="lg" className="font-bold px-8 shadow-lg hover:shadow-xl transition-all" onClick={() => selfEnrollMutation.mutate()} disabled={selfEnrollMutation.isPending}>
              {selfEnrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enroll & Start Learning
            </Button>
          </div>
        ) : !activeLesson ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-6 lg:px-10 py-8 max-w-5xl mx-auto space-y-8">
            {/* Media */}
            {activeLesson.contentType === 'VIDEO' && (
              activeLesson.contentUrl ? (
                <VideoPlayer url={activeLesson.contentUrl} />
              ) : (
                <div className="aspect-video rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-black border border-white/5 flex flex-col items-center justify-center gap-4 text-white/60 shadow-xl shadow-slate-950/20">
                  <div className="h-16 w-16 rounded-full bg-white/10 flex items-center justify-center shadow-md animate-bounce" style={{ animationDuration: '3s' }}>
                    <Play className="h-8 w-8 text-indigo-400 ml-1 fill-indigo-400/20" />
                  </div>
                  <p className="text-base font-semibold">Video lecture coming soon — check the materials below</p>
                </div>
              )
            )}
            {activeLesson.contentType === 'EMBED' && activeLesson.contentUrl && (
              <div className="aspect-video rounded-3xl overflow-hidden border border-muted bg-card shadow-lg">
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}
            {activeLesson.contentType === 'PDF' && activeLesson.contentUrl && (
              <div className="border border-muted rounded-3xl overflow-hidden shadow-lg" style={{ height: '640px' }}>
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}

            {/* Lesson header */}
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap text-xs font-semibold text-muted-foreground">
                {activeLesson.dayStart && activeLesson.dayEnd && (
                  <Badge variant="outline" className="font-bold border-indigo-500/20 text-indigo-500 bg-indigo-500/5 px-2.5 py-0.5">
                    Day {activeLesson.dayStart}{activeLesson.dayEnd !== activeLesson.dayStart && `–${activeLesson.dayEnd}`}
                  </Badge>
                )}
                {activeLesson.durationMins && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted/65 border border-muted/80"><Clock className="h-3.5 w-3.5 text-indigo-500" />{activeLesson.durationMins} min</span>
                )}
                {activeCompleted && (
                  <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 font-bold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Completed
                    {activeProgress?.quizScore != null && ` · Score ${activeProgress.quizScore.toFixed(0)}%`}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground/90">{activeLesson.title}</h1>
              {activeLesson.description && (
                <p className="text-muted-foreground text-base leading-relaxed mt-2">{activeLesson.description}</p>
              )}
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab} className="w-full space-y-6">
              <TabsList className="bg-muted/80 p-1 rounded-xl border border-muted/60 shadow-inner">
                <TabsTrigger value="overview" className="px-4 py-2 font-semibold">Overview</TabsTrigger>
                {hasNotes && <TabsTrigger value="notes" className="px-4 py-2 font-semibold">Notes</TabsTrigger>}
                {hasQuiz && (
                  <TabsTrigger value="quiz" className="gap-1.5 px-4 py-2 font-semibold">
                    Quiz
                    <span className="rounded-full bg-primary/10 border border-primary/25 text-primary text-[10px] font-bold px-2 py-0.5 shadow-sm">
                      {activeLesson.quizzes!.length}
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="mt-0 space-y-6">
                {activeLesson.contentBody && activeLesson.contentType !== 'CHECKPOINT' && (
                  <div className="prose prose-sm max-w-none bg-muted/20 border border-muted/50 rounded-2xl p-6 leading-relaxed text-muted-foreground">
                    {activeLesson.contentBody.split('\n').map((line, i) => (
                      <p key={i} className="mb-3 last:mb-0">{line}</p>
                    ))}
                  </div>
                )}
                {activeLesson.contentType === 'CHECKPOINT' && (
                  <CheckpointContent
                    items={activeLesson.checkpointItems ?? []}
                    contentBody={activeLesson.contentBody}
                  />
                )}
                {activeLesson.topics && activeLesson.topics.length > 0 && (
                  <div className="bg-card/40 border border-muted/60 p-6 rounded-2xl space-y-3 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      What you'll learn
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {activeLesson.topics.map((t) => (
                        <div key={t} className="flex items-center gap-2.5 text-sm font-medium text-foreground/80">
                          <CheckCircle2 className="h-4 w-4 text-primary/75 shrink-0" />
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {hasNotes && (
                <TabsContent value="notes" className="mt-0">
                  <div className="border border-muted rounded-2xl overflow-hidden shadow-lg bg-card">
                    <div className="flex items-center justify-between px-5 py-3 bg-muted/30 border-b border-muted">
                      <span className="flex items-center gap-2.5 text-sm font-bold text-foreground/80">
                        <FileText className="h-4 w-4 text-primary" /> Study Notes Attachment
                      </span>
                      <a
                        href={activeLesson.notesUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                      >
                        <Download className="h-4 w-4" /> Download
                      </a>
                    </div>
                    <iframe src={activeLesson.notesUrl!} className="w-full" style={{ height: '560px' }} />
                  </div>
                </TabsContent>
              )}

              {hasQuiz && (
                <TabsContent value="quiz" className="mt-0">
                  <QuizContent
                    quizzes={activeLesson.quizzes!}
                    answers={quizAnswers}
                    submitted={quizSubmitted}
                    progress={activeProgress}
                    onAnswer={(qId, idx) => setQuizAnswers((a) => ({ ...a, [qId]: idx }))}
                    onSubmit={submitQuiz}
                  />
                </TabsContent>
              )}
            </Tabs>

            {/* Bottom nav */}
            <div className="flex items-center justify-between gap-4 pt-6 border-t border-muted/80">
              <Button variant="outline" className="font-semibold shadow-sm" disabled={!prevLesson} onClick={() => prevLesson && goTo(prevLesson)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <div className="flex items-center gap-3">
                {!activeCompleted && !hasQuiz && (
                  <Button className="font-bold shadow-md" onClick={markComplete} disabled={progressMutation.isPending}>
                    {progressMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Mark Complete
                  </Button>
                )}
                {!activeCompleted && hasQuiz && tab !== 'quiz' && (
                  <Button className="font-bold shadow-md" onClick={() => setTab('quiz')}>
                    <HelpCircle className="h-4 w-4 mr-2" /> Start Quiz
                  </Button>
                )}
                <Button variant={nextLesson ? 'default' : 'outline'} className="font-semibold shadow-sm" disabled={!nextLesson} onClick={() => nextLesson && goTo(nextLesson)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile backdrop */}
      {contentOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={() => setContentOpen(false)} />
      )}

      {/* Course content sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 w-[320px] bg-background border-l border-muted flex flex-col shadow-2xl transition-transform duration-300',
          'lg:static lg:w-[340px] lg:shadow-none lg:shrink-0 lg:translate-x-0',
          contentOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-5 border-b border-muted flex items-center gap-3.5 bg-muted/20">
          {myEnrollment ? (
            <ProgressRing pct={pct} size={52} stroke={5} />
          ) : (
            <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-primary">
              <ListVideo className="h-5 w-5" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground/90">Course Content</p>
            <p className="text-xs font-semibold text-muted-foreground mt-0.5">
              {myEnrollment ? `${completedCount} of ${requiredLessons.length} completed` : `${lessons.length} lessons`}
            </p>
          </div>
          <button className="lg:hidden text-muted-foreground hover:text-foreground transition-colors" onClick={() => setContentOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-muted/10">
          {module.phases.map((phase, pi) => {
            const pLessons = lessonsByPhase[phase.id] ?? [];
            const phaseDone = pLessons.filter((l) => progressMap[l.id]?.status === 'COMPLETED').length;
            const open = expandedPhases.has(phase.id);
            return (
              <div key={phase.id} className="rounded-2xl overflow-hidden border border-muted bg-card/60 shadow-sm transition-all duration-300 hover:shadow-md">
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors"
                  style={{ borderLeft: `4px solid ${phase.color ?? '#6366f1'}` }}
                  onClick={() =>
                    setExpandedPhases((prev) => {
                      const next = new Set(prev);
                      next.has(phase.id) ? next.delete(phase.id) : next.add(phase.id);
                      return next;
                    })
                  }
                >
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Phase {phase.phaseNumber}
                      {phase.dayStart && phase.dayEnd && ` · Day ${phase.dayStart}–${phase.dayEnd}`}
                    </p>
                    <p className="text-sm font-bold text-foreground/80 truncate mt-0.5">{phase.title}</p>
                  </div>
                  <span className="text-xs font-bold text-muted-foreground shrink-0">{phaseDone}/{pLessons.length}</span>
                  {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>
                {open && (
                  <div className="pb-2 px-2 space-y-1 border-t border-muted/30 pt-1.5">
                    {pLessons.map((lesson) => (
                      <LessonNavItem
                        key={lesson.id}
                        lesson={lesson}
                        progress={progressMap[lesson.id]}
                        active={activeLessonId === lesson.id}
                        onClick={() => goTo(lesson)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {ungrouped.length > 0 && (
            <div className="space-y-1.5 pt-1.5">
              {ungrouped.map((lesson) => (
                <LessonNavItem
                  key={lesson.id}
                  lesson={lesson}
                  progress={progressMap[lesson.id]}
                  active={activeLessonId === lesson.id}
                  onClick={() => goTo(lesson)}
                />
              ))}
            </div>
          )}
        </nav>

        {enrollment?.certificate && (
          <div className="p-4 border-t border-muted bg-muted/20">
            <div className="rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white p-4 flex items-center gap-3.5 shadow-md shadow-emerald-500/10 transition-transform duration-300 hover:scale-[1.02]">
              <Trophy className="h-8 w-8 shrink-0 text-amber-200 animate-pulse" />
              <div>
                <p className="text-sm font-extrabold tracking-tight">Certificate Earned!</p>
                <p className="text-xs text-white/90 font-medium">Final grade score: {enrollment.score?.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function LessonNavItem({
  lesson,
  progress,
  active,
  onClick,
}: {
  lesson: LearningLesson;
  progress?: LessonProgress;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = CONTENT_ICONS[lesson.contentType] ?? BookOpen;
  const done = progress?.status === 'COMPLETED';
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-foreground/75 hover:bg-muted/60 hover:text-foreground'
      )}
      onClick={onClick}
    >
      {done ? (
        <CheckCircle2 className={cn('h-4 w-4 shrink-0', active ? 'text-primary-foreground' : 'text-emerald-500')} />
      ) : active ? (
        <Play className="h-4 w-4 shrink-0" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
      )}
      <span className="flex-1 truncate">{lesson.title}</span>
      <span className={cn('flex items-center gap-1 text-[11px] shrink-0', active ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
        <Icon className="h-3 w-3" />
        {lesson.durationMins ? `${lesson.durationMins}m` : ''}
      </span>
    </button>
  );
}

function VideoPlayer({ url }: { url: string }) {
  const embed = getEmbeddableVideo(url);

  if (!embed) {
    return (
      <div className="aspect-video rounded-2xl border border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/10">
        <Play className="h-8 w-8" />
        <p className="text-sm">Couldn't load this video link</p>
      </div>
    );
  }

  if (embed.kind === 'file') {
    return (
      <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
        <video src={embed.src} controls className="w-full h-full" />
      </div>
    );
  }

  return (
    <div className="aspect-video rounded-2xl overflow-hidden bg-black shadow-lg">
      <iframe
        src={embed.src}
        className="w-full h-full"
        allowFullScreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    </div>
  );
}

function CheckpointContent({ items, contentBody }: { items: string[]; contentBody?: string | null }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-4">
      {contentBody && (
        <div className="bg-muted/20 rounded-2xl p-5 text-sm text-muted-foreground">{contentBody}</div>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Checkpoint Tasks</h3>
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3.5 border rounded-xl cursor-pointer hover:bg-muted/20 transition-colors"
              onClick={() => setChecked((c) => {
                const n = new Set(c);
                n.has(i) ? n.delete(i) : n.add(i);
                return n;
              })}
            >
              <div className={cn(
                'mt-0.5 h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors',
                checked.has(i) ? 'bg-primary border-primary' : 'border-muted-foreground/30'
              )}>
                {checked.has(i) && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
              </div>
              <span className={cn('text-sm', checked.has(i) && 'line-through text-muted-foreground')}>{item}</span>
            </div>
          ))}
          <div className="text-xs text-muted-foreground">{checked.size}/{items.length} completed</div>
        </div>
      )}
    </div>
  );
}

function QuizContent({
  quizzes,
  answers,
  submitted,
  progress,
  onAnswer,
  onSubmit,
}: {
  quizzes: NonNullable<LearningLesson['quizzes']>;
  answers: Record<string, number>;
  submitted: boolean;
  progress?: LessonProgress;
  onAnswer: (qId: string, idx: number) => void;
  onSubmit: () => void;
}) {
  const alreadyDone = progress?.status === 'COMPLETED';
  const score = alreadyDone ? progress?.quizScore : null;

  return (
    <div className="space-y-6">
      {(alreadyDone && score != null) && (
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-2xl',
          score >= 70 ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
        )}>
          {score >= 70 ? <Award className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
          <div>
            <p className="font-semibold">{score >= 70 ? 'Passed!' : 'Not passed'}</p>
            <p className="text-sm">Your score: {score.toFixed(0)}%</p>
          </div>
        </div>
      )}

      {quizzes.map((q, qi) => {
        const userAnswer = alreadyDone ? (progress?.quizAnswers?.[qi] ?? -1) : answers[q.id] ?? -1;
        const correct = q.correctAnswer;
        return (
          <div key={q.id} className="border rounded-2xl p-5 space-y-3">
            <p className="font-medium">
              <span className="text-muted-foreground text-sm mr-2">Q{qi + 1}.</span>
              {q.question}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const isSelected = userAnswer === oi;
                const isCorrect = oi === correct;
                const showResult = submitted || alreadyDone;
                return (
                  <button
                    key={oi}
                    disabled={submitted || alreadyDone}
                    onClick={() => onAnswer(q.id, oi)}
                    className={cn(
                      'w-full text-left px-4 py-3 rounded-xl border text-sm transition-colors',
                      !showResult && isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : '',
                      !showResult && !isSelected ? 'hover:border-muted-foreground/50' : '',
                      showResult && isCorrect ? 'border-emerald-500 bg-emerald-50 text-emerald-800' : '',
                      showResult && isSelected && !isCorrect ? 'border-red-400 bg-red-50 text-red-800' : '',
                      !showResult && !isSelected ? 'border-muted' : ''
                    )}
                  >
                    <span className="font-medium mr-2">{String.fromCharCode(65 + oi)}.</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {(submitted || alreadyDone) && q.explanation && (
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-3">{q.explanation}</p>
            )}
          </div>
        );
      })}

      {!submitted && !alreadyDone && (
        <Button
          onClick={onSubmit}
          disabled={Object.keys(answers).length < quizzes.length}
          className="w-full"
          size="lg"
        >
          Submit Quiz ({Object.keys(answers).length}/{quizzes.length} answered)
        </Button>
      )}
    </div>
  );
}
