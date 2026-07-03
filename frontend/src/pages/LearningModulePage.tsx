import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Video, FileText,
  Link2, CheckSquare, HelpCircle, ChevronRight, ChevronLeft, Award, Loader2,
  Clock, Play, ChevronDown, ChevronUp, ListVideo, X, Download, Trophy,
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
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b px-4 lg:px-6 py-3 flex items-center gap-3">
          <button
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => navigate('/learning')}
          >
            <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Back</span>
          </button>
          <div className="h-4 w-px bg-border shrink-0" />
          <h2 className="font-semibold text-sm truncate flex-1">{module.title}</h2>
          {myEnrollment && (
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <div className="w-28 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
            </div>
          )}
          <Button variant="outline" size="sm" className="lg:hidden shrink-0" onClick={() => setContentOpen(true)}>
            <ListVideo className="h-4 w-4 mr-1.5" /> Content
          </Button>
        </div>

        {!myEnrollment ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5 text-center p-8">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 flex items-center justify-center">
              <BookOpen className="h-10 w-10 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{module.title}</h2>
              <p className="text-muted-foreground max-w-md mt-2">{module.description}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>{module.phases.length} phases</span>·<span>{lessons.length} lessons</span>
              {module.durationDays && <>·<span>{module.durationDays}-day program</span></>}
            </div>
            <Button size="lg" onClick={() => selfEnrollMutation.mutate()} disabled={selfEnrollMutation.isPending}>
              {selfEnrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enroll now — it's free
            </Button>
          </div>
        ) : !activeLesson ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="px-4 lg:px-8 py-6 max-w-4xl mx-auto space-y-6">
            {/* Media */}
            {activeLesson.contentType === 'VIDEO' && (
              activeLesson.contentUrl ? (
                <VideoPlayer url={activeLesson.contentUrl} />
              ) : (
                <div className="aspect-video rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-black flex flex-col items-center justify-center gap-3 text-white/70">
                  <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
                    <Play className="h-7 w-7 ml-0.5" />
                  </div>
                  <p className="text-sm">Video coming soon — check the overview and quiz below</p>
                </div>
              )
            )}
            {activeLesson.contentType === 'EMBED' && activeLesson.contentUrl && (
              <div className="aspect-video rounded-2xl overflow-hidden border">
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}
            {activeLesson.contentType === 'PDF' && activeLesson.contentUrl && (
              <div className="border rounded-2xl overflow-hidden" style={{ height: '620px' }}>
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}

            {/* Lesson header */}
            <div>
              <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground mb-2">
                {activeLesson.dayStart && activeLesson.dayEnd && (
                  <Badge variant="outline" className="font-normal">
                    Day {activeLesson.dayStart}{activeLesson.dayEnd !== activeLesson.dayStart && `–${activeLesson.dayEnd}`}
                  </Badge>
                )}
                {activeLesson.durationMins && (
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{activeLesson.durationMins} min</span>
                )}
                {activeCompleted && (
                  <span className="flex items-center gap-1 text-emerald-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Completed
                    {activeProgress?.quizScore != null && ` · ${activeProgress.quizScore.toFixed(0)}%`}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{activeLesson.title}</h1>
              {activeLesson.description && (
                <p className="text-muted-foreground mt-1.5">{activeLesson.description}</p>
              )}
            </div>

            {/* Tabs */}
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {hasNotes && <TabsTrigger value="notes">Notes</TabsTrigger>}
                {hasQuiz && (
                  <TabsTrigger value="quiz" className="gap-1.5">
                    Quiz
                    <span className="rounded-full bg-primary/15 text-primary text-[10px] font-semibold px-1.5 py-0.5">
                      {activeLesson.quizzes!.length}
                    </span>
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="overview" className="mt-5 space-y-5">
                {activeLesson.contentBody && activeLesson.contentType !== 'CHECKPOINT' && (
                  <div className="prose prose-sm max-w-none bg-muted/20 rounded-2xl p-6">
                    {activeLesson.contentBody.split('\n').map((line, i) => (
                      <p key={i}>{line}</p>
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
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">
                      What you'll learn
                    </h3>
                    <div className="grid sm:grid-cols-2 gap-1.5">
                      {activeLesson.topics.map((t) => (
                        <div key={t} className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                          <span>{t}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {hasNotes && (
                <TabsContent value="notes" className="mt-5">
                  <div className="border rounded-2xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4" /> Study notes
                      </span>
                      <a
                        href={activeLesson.notesUrl!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                    <iframe src={activeLesson.notesUrl!} className="w-full" style={{ height: '560px' }} />
                  </div>
                </TabsContent>
              )}

              {hasQuiz && (
                <TabsContent value="quiz" className="mt-5">
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
            <div className="flex items-center justify-between gap-3 pt-5 border-t">
              <Button variant="outline" disabled={!prevLesson} onClick={() => prevLesson && goTo(prevLesson)}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Previous
              </Button>
              <div className="flex items-center gap-3">
                {!activeCompleted && !hasQuiz && (
                  <Button onClick={markComplete} disabled={progressMutation.isPending}>
                    {progressMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Mark Complete
                  </Button>
                )}
                {!activeCompleted && hasQuiz && tab !== 'quiz' && (
                  <Button onClick={() => setTab('quiz')}>
                    <HelpCircle className="h-4 w-4 mr-2" /> Take quiz to complete
                  </Button>
                )}
                <Button variant={nextLesson ? 'default' : 'outline'} disabled={!nextLesson} onClick={() => nextLesson && goTo(nextLesson)}>
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile backdrop */}
      {contentOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setContentOpen(false)} />
      )}

      {/* Course content sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-40 w-[320px] bg-background border-l shadow-2xl flex flex-col transition-transform',
          'lg:static lg:w-[340px] lg:shadow-none lg:shrink-0 lg:translate-x-0',
          contentOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        )}
      >
        <div className="p-4 border-b flex items-center gap-3">
          {myEnrollment ? (
            <ProgressRing pct={pct} size={48} stroke={4} />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <ListVideo className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Course content</p>
            <p className="text-xs text-muted-foreground">
              {myEnrollment ? `${completedCount} of ${requiredLessons.length} lessons done` : `${lessons.length} lessons`}
            </p>
          </div>
          <button className="lg:hidden text-muted-foreground" onClick={() => setContentOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {module.phases.map((phase) => {
            const pLessons = lessonsByPhase[phase.id] ?? [];
            const phaseDone = pLessons.filter((l) => progressMap[l.id]?.status === 'COMPLETED').length;
            const open = expandedPhases.has(phase.id);
            return (
              <div key={phase.id} className="rounded-xl overflow-hidden border bg-card/50">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40 transition-colors"
                  style={{ borderLeft: `3px solid ${phase.color ?? '#6366f1'}` }}
                  onClick={() =>
                    setExpandedPhases((prev) => {
                      const next = new Set(prev);
                      next.has(phase.id) ? next.delete(phase.id) : next.add(phase.id);
                      return next;
                    })
                  }
                >
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Phase {phase.phaseNumber}
                      {phase.dayStart && phase.dayEnd && ` · Day ${phase.dayStart}–${phase.dayEnd}`}
                    </p>
                    <p className="text-sm font-semibold truncate">{phase.title}</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">{phaseDone}/{pLessons.length}</span>
                  {open ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                </button>
                {open && (
                  <div className="pb-1.5 px-1.5 space-y-0.5">
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
            <div className="space-y-0.5 pt-1">
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
          <div className="p-3 border-t">
            <div className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white p-3.5 flex items-center gap-3">
              <Trophy className="h-7 w-7 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Certificate earned!</p>
                <p className="text-xs text-white/85">Final score: {enrollment.score?.toFixed(0)}%</p>
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
