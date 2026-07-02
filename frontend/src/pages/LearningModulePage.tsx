import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Circle, BookOpen, Video, FileText,
  Link2, CheckSquare, HelpCircle, ChevronRight, Award, Loader2,
  Clock, Play, ChevronDown, ChevronUp,
} from 'lucide-react';
import { learningApi, LearningLesson, LearningPhase, LessonProgress, LearningCertificate } from '@/api/learning';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

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

  const [activeLesson, setActiveLesson] = useState<LearningLesson | null>(null);
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, number>>({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const startTime = useRef<number>(Date.now());

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
    enabled: !!id,
  });

  const progressMutation = useMutation({
    mutationFn: ({
      lessonId,
      data,
    }: {
      lessonId: string;
      data: Parameters<typeof learningApi.updateProgress>[2];
    }) =>
      learningApi.updateProgress(lessonId, enrollment?.id ?? '', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:progress', id] });
      qc.invalidateQueries({ queryKey: ['learning:my'] });
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

  useEffect(() => {
    if (module?.lessons && module.lessons.length > 0 && !activeLesson) {
      setActiveLesson(module.lessons[0]);
      const firstPhaseId = module.lessons[0].phaseId;
      if (firstPhaseId) setExpandedPhase(firstPhaseId);
    }
  }, [module]);

  useEffect(() => {
    if (activeLesson) {
      startTime.current = Date.now();
      setQuizAnswers({});
      setQuizSubmitted(false);
    }
  }, [activeLesson?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!module) return null;

  const myEnrollment = module.myEnrollment;
  const progressMap: Record<string, LessonProgress> = {};
  if (myEnrollment?.progress) {
    for (const p of myEnrollment.progress) {
      progressMap[p.lessonId] = p;
    }
  }

  const lessonsByPhase: Record<string, LearningLesson[]> = {};
  const ungrouped: LearningLesson[] = [];
  for (const lesson of module.lessons) {
    if (lesson.phaseId) {
      if (!lessonsByPhase[lesson.phaseId]) lessonsByPhase[lesson.phaseId] = [];
      lessonsByPhase[lesson.phaseId].push(lesson);
    } else {
      ungrouped.push(lesson);
    }
  }

  const completedCount = Object.values(progressMap).filter((p) => p.status === 'COMPLETED').length;
  const totalRequired = module.lessons.filter((l) => l.isRequired).length;
  const pct = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 0;

  function markComplete() {
    if (!activeLesson || !myEnrollment) return;
    const timeSpent = Math.floor((Date.now() - startTime.current) / 1000);
    progressMutation.mutate({
      lessonId: activeLesson.id,
      data: { status: 'COMPLETED', timeSpentSec: timeSpent },
    });
    toast.success('Lesson marked complete');

    // Auto-advance to next lesson
    const idx = module!.lessons.findIndex((l) => l.id === activeLesson.id);
    if (idx < module!.lessons.length - 1) {
      const next = module!.lessons[idx + 1];
      setActiveLesson(next);
      if (next.phaseId) setExpandedPhase(next.phaseId);
    }
  }

  function submitQuiz() {
    if (!activeLesson || !activeLesson.quizzes || !myEnrollment) return;
    const quizzes = activeLesson.quizzes;
    let correct = 0;
    let total = 0;
    for (const q of quizzes) {
      total += q.points;
      if (quizAnswers[q.id] === q.correctAnswer) correct += q.points;
    }
    const score = total > 0 ? Math.round((correct / total) * 100) : 100;
    const answers = quizzes.map((q) => quizAnswers[q.id] ?? -1);
    const timeSpent = Math.floor((Date.now() - startTime.current) / 1000);

    progressMutation.mutate({
      lessonId: activeLesson.id,
      data: {
        status: 'COMPLETED',
        quizScore: score,
        quizAnswers: answers,
        timeSpentSec: timeSpent,
      },
    });
    setQuizSubmitted(true);
  }

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-72 border-r flex flex-col shrink-0 bg-muted/10 overflow-y-auto">
        <div className="p-4 border-b">
          <button
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3"
            onClick={() => navigate('/learning')}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h2 className="font-semibold leading-snug">{module.title}</h2>
          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{completedCount}/{totalRequired} lessons</span>
              <span>{pct}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Lesson list */}
        <nav className="flex-1 p-3 space-y-1">
          {module.phases.map((phase) => {
            const pLessons = lessonsByPhase[phase.id] ?? [];
            const phaseCompleted = pLessons.filter((l) => progressMap[l.id]?.status === 'COMPLETED').length;
            return (
              <div key={phase.id}>
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedPhase(expandedPhase === phase.id ? null : phase.id)}
                  style={{ borderLeft: `3px solid ${phase.color ?? '#6366f1'}` }}
                >
                  <span className="flex-1 text-left pl-1">{phase.title}</span>
                  <span className="text-xs normal-case font-normal">{phaseCompleted}/{pLessons.length}</span>
                  {expandedPhase === phase.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>
                {expandedPhase === phase.id && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {pLessons.map((lesson) => (
                      <LessonNavItem
                        key={lesson.id}
                        lesson={lesson}
                        progress={progressMap[lesson.id]}
                        active={activeLesson?.id === lesson.id}
                        onClick={() => setActiveLesson(lesson)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {ungrouped.map((lesson) => (
            <LessonNavItem
              key={lesson.id}
              lesson={lesson}
              progress={progressMap[lesson.id]}
              active={activeLesson?.id === lesson.id}
              onClick={() => setActiveLesson(lesson)}
            />
          ))}
        </nav>

        {/* Certificate */}
        {myEnrollment?.certificate && (
          <div className="p-4 border-t">
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3">
              <Award className="h-5 w-5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Certificate Earned</p>
                <p className="text-xs text-green-600">Score: {myEnrollment.score?.toFixed(0)}%</p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {!myEnrollment ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
            <BookOpen className="h-16 w-16 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold">Enroll to start learning</h2>
            <p className="text-muted-foreground max-w-sm">{module.description}</p>
            <Button onClick={() => selfEnrollMutation.mutate()} disabled={selfEnrollMutation.isPending}>
              {selfEnrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enroll Now
            </Button>
          </div>
        ) : !activeLesson ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-8 max-w-3xl mx-auto space-y-6">
            {/* Lesson header */}
            <div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                {activeLesson.dayStart && activeLesson.dayEnd && (
                  <span>Day {activeLesson.dayStart}–{activeLesson.dayEnd}</span>
                )}
                {activeLesson.durationMins && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />{activeLesson.durationMins} min
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{activeLesson.title}</h1>
              {activeLesson.description && (
                <p className="text-muted-foreground mt-2">{activeLesson.description}</p>
              )}
              {activeLesson.topics && activeLesson.topics.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {activeLesson.topics.map((t) => (
                    <span key={t} className="text-xs bg-muted px-2.5 py-1 rounded-full">{t}</span>
                  ))}
                </div>
              )}
            </div>

            {/* Content */}
            {activeLesson.contentType === 'VIDEO' && activeLesson.contentUrl && (
              <div className="aspect-video rounded-xl overflow-hidden bg-black">
                <iframe
                  src={activeLesson.contentUrl}
                  className="w-full h-full"
                  allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                />
              </div>
            )}

            {activeLesson.contentType === 'EMBED' && activeLesson.contentUrl && (
              <div className="aspect-video rounded-xl overflow-hidden border">
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}

            {activeLesson.contentType === 'PDF' && activeLesson.contentUrl && (
              <div className="border rounded-xl overflow-hidden" style={{ height: '600px' }}>
                <iframe src={activeLesson.contentUrl} className="w-full h-full" />
              </div>
            )}

            {activeLesson.contentBody && activeLesson.contentType !== 'CHECKPOINT' && (
              <div className="prose prose-sm max-w-none bg-muted/20 rounded-xl p-6">
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

            {activeLesson.contentType === 'QUIZ' && activeLesson.quizzes && activeLesson.quizzes.length > 0 && (
              <QuizContent
                quizzes={activeLesson.quizzes}
                answers={quizAnswers}
                submitted={quizSubmitted}
                progress={progressMap[activeLesson.id]}
                onAnswer={(qId, idx) => setQuizAnswers((a) => ({ ...a, [qId]: idx }))}
                onSubmit={submitQuiz}
              />
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <div>
                {progressMap[activeLesson.id]?.status === 'COMPLETED' && (
                  <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Completed
                    {progressMap[activeLesson.id]?.quizScore != null && (
                      <span>· Score: {progressMap[activeLesson.id].quizScore?.toFixed(0)}%</span>
                    )}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {activeLesson.contentType !== 'QUIZ' && progressMap[activeLesson.id]?.status !== 'COMPLETED' && (
                  <Button
                    onClick={markComplete}
                    disabled={progressMutation.isPending}
                  >
                    {progressMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Mark Complete
                  </Button>
                )}
                {/* Next lesson */}
                {(() => {
                  const idx = module.lessons.findIndex((l) => l.id === activeLesson.id);
                  const next = module.lessons[idx + 1];
                  if (!next) return null;
                  return (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setActiveLesson(next);
                        if (next.phaseId) setExpandedPhase(next.phaseId);
                      }}
                    >
                      Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </main>
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
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-left transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-foreground/70 hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={onClick}
    >
      {done ? (
        <CheckCircle2 className={cn('h-4 w-4 shrink-0', active ? 'text-primary-foreground' : 'text-green-600')} />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      <span className="flex-1 truncate">{lesson.title}</span>
      {lesson.durationMins && (
        <span className={cn('text-xs shrink-0', active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {lesson.durationMins}m
        </span>
      )}
    </button>
  );
}

function CheckpointContent({ items, contentBody }: { items: string[]; contentBody?: string | null }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  return (
    <div className="space-y-4">
      {contentBody && (
        <div className="bg-muted/20 rounded-xl p-5 text-sm text-muted-foreground">{contentBody}</div>
      )}
      {items.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Checkpoint Tasks</h3>
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/20"
              onClick={() => setChecked((c) => {
                const n = new Set(c);
                n.has(i) ? n.delete(i) : n.add(i);
                return n;
              })}
            >
              <div className={cn(
                'mt-0.5 h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
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
          'flex items-center gap-3 p-4 rounded-xl',
          score >= 70 ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
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
          <div key={q.id} className="border rounded-xl p-5 space-y-3">
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
                      'w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors',
                      !showResult && isSelected ? 'border-primary bg-primary/5' : '',
                      !showResult && !isSelected ? 'hover:border-muted-foreground/50' : '',
                      showResult && isCorrect ? 'border-green-500 bg-green-50 text-green-800' : '',
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
              <p className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">{q.explanation}</p>
            )}
          </div>
        );
      })}

      {!submitted && !alreadyDone && (
        <Button
          onClick={onSubmit}
          disabled={Object.keys(answers).length < quizzes.length}
          className="w-full"
        >
          Submit Quiz
        </Button>
      )}
    </div>
  );
}
