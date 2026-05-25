import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Clock, Video, FileText, HelpCircle, Send, Play, Trophy, XCircle, Sparkles, ChevronUp, ChevronDown, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import api from '@/api/client';

const typeIcon: Record<string, React.ElementType> = {
  VIDEO: Video, PDF: FileText, SOP: FileText, QUIZ: HelpCircle,
  ASSIGNMENT: CheckCircle2, ROLE_PLAY: BookOpen, EXTERNAL_LINK: BookOpen, COACHING_NOTE: BookOpen,
};

type QuizQuestion = {
  id: string; text: string; options: string[]; correct: number; explanation?: string;
};
type QuizJson = { questions: QuizQuestion[]; passMark?: number };

type LearningItemFull = {
  id: string; title: string; type: string; estimatedMinutes?: number;
  contentUrl?: string; quizJson?: QuizJson; learningPathId: string;
  learningPath: { id: string; title: string };
};

type Assignment = {
  id: string; status: string; dueDate?: string;
  learningItem: LearningItemFull;
};

type LearningPath = {
  id: string; title: string; description?: string;
  _count: { items: number };
  department?: { id: string; name: string; slug: string };
};

type LearningItem = {
  id: string; title: string; type: string; estimatedMinutes?: number;
  learningPathId: string;
};

type User = { id: string; name: string; role: string };

// ── Assign dialog ─────────────────────────────────────────────────────────────

function AssignDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [selectedPath, setSelectedPath] = useState('');
  const [selectedItem, setSelectedItem] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: paths = [] } = useQuery<LearningPath[]>({
    queryKey: ['learning-paths'],
    queryFn: () => api.get('/learning/paths').then((r) => r.data),
    enabled: open,
  });

  const { data: items = [] } = useQuery<LearningItem[]>({
    queryKey: ['learning-items', selectedPath],
    queryFn: () => api.get(`/learning/paths/${selectedPath}/items`).then((r) => r.data),
    enabled: !!selectedPath,
  });

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: () => api.post('/learning/assignments', {
      learningItemId: selectedItem,
      userId: selectedUser,
      dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning-assignments'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setSelectedPath('');
    setSelectedItem('');
    setSelectedUser('');
    setDueDate('');
    onClose();
  };

  const handleSubmit = async () => {
    if (!selectedItem || !selectedUser) return;
    setSaving(true);
    await assignMutation.mutateAsync();
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-indigo-500" />
            Assign Learning Item
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Learning Path</Label>
            <Select onValueChange={(v) => { setSelectedPath(v); setSelectedItem(''); }}>
              <SelectTrigger>
                <SelectValue placeholder="Select path" />
              </SelectTrigger>
              <SelectContent>
                {paths.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Learning Item *</Label>
            <Select value={selectedItem} onValueChange={setSelectedItem} disabled={!selectedPath}>
              <SelectTrigger>
                <SelectValue placeholder={selectedPath ? 'Select item' : 'Choose a path first'} />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title} {item.estimatedMinutes ? `(${item.estimatedMinutes}m)` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Assign To *</Label>
            <Select onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select person" />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Due Date (optional)</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedItem || !selectedUser || saving}
            className="gap-2"
          >
            <Send className="h-4 w-4" />
            {saving ? 'Assigning...' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── AI Recommendations panel ──────────────────────────────────────────────────

type Recommendation = { title: string; reason: string; priority: 'high' | 'medium' | 'low' };

function AiRecommendPanel() {
  const [open, setOpen] = useState(false);
  const { data, isFetching, refetch } = useQuery<{ recommendations: Recommendation[] }>({
    queryKey: ['learning-ai-recommend'],
    queryFn: () => api.get('/learning/ai-recommend').then((r) => r.data),
    enabled: false,
    staleTime: 1800_000,
  });

  const priorityColor: Record<string, string> = {
    high: 'bg-red-50 text-red-700 border-red-200',
    medium: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    low: 'bg-gray-50 text-gray-600 border-gray-200',
  };

  const handleOpen = () => {
    if (!open) refetch();
    setOpen((v) => !v);
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader className="pb-3 cursor-pointer" onClick={handleOpen}>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2 text-indigo-700">
            <Sparkles className="h-4 w-4" />
            AI Learning Recommendations
          </CardTitle>
          <div className="flex items-center gap-2">
            {open && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-indigo-600" onClick={(e) => { e.stopPropagation(); refetch(); }}>
                Refresh
              </Button>
            )}
            {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {isFetching ? (
            <p className="text-xs text-muted-foreground animate-pulse">Generating personalised recommendations…</p>
          ) : data?.recommendations?.length ? (
            <div className="space-y-2">
              {data.recommendations.map((r, i) => (
                <div key={i} className="rounded-md border bg-white p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <Badge className={`text-xs border shrink-0 ${priorityColor[r.priority] || priorityColor.low}`}>
                      {r.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.reason}</p>
                </div>
              ))}
            </div>
          ) : data ? (
            <p className="text-xs text-muted-foreground">All pending items look good — no specific recommendations right now.</p>
          ) : null}
        </CardContent>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Learning() {
  const { user } = useAuthStore();
  const { deptSlug } = useParams<{ deptSlug?: string }>();
  const qc = useQueryClient();
  const [assignOpen, setAssignOpen] = useState(false);
  const [createPathOpen, setCreatePathOpen] = useState(false);
  const [deletePathId, setDeletePathId] = useState<string | null>(null);
  const [quizTarget, setQuizTarget] = useState<{ assignmentId: string; item: LearningItemFull } | null>(null);
  const canAssign = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');
  const canManagePaths = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');

  const deletePathMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/learning/paths/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning-paths'] });
      setDeletePathId(null);
    },
  });

  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['learning-assignments'],
    queryFn: () => api.get('/learning/assignments').then((r) => r.data),
  });

  const { data: allPaths = [] } = useQuery<LearningPath[]>({
    queryKey: ['learning-paths'],
    queryFn: () => api.get('/learning/paths').then((r) => r.data),
  });

  const paths = useMemo(
    () => deptSlug ? allPaths.filter((p) => p.department?.slug === deptSlug) : allPaths,
    [allPaths, deptSlug]
  );

  const completeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/learning/assignments/${id}/complete`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['learning-assignments'] }),
  });

  const completed = assignments.filter((a) => a.status === 'COMPLETED').length;
  const overdue = assignments.filter((a) => a.status !== 'COMPLETED' && a.dueDate && new Date(a.dueDate) < new Date()).length;
  const completionRate = assignments.length > 0 ? Math.round((completed / assignments.length) * 100) : 0;

  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-500" />
            {deptSlug ? `Learning — ${deptSlug}` : 'Learning Hub'}
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {deptSlug ? `Showing paths for ${deptSlug} department` : 'Skill building connected to execution'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canManagePaths && (
            <Button variant="outline" className="gap-2" onClick={() => setCreatePathOpen(true)}>
              <Plus className="h-4 w-4" /> New Path
            </Button>
          )}
          {canAssign && (
            <Button variant="outline" className="gap-2" onClick={() => setAssignOpen(true)}>
              <Send className="h-4 w-4" /> Assign Item
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <Clock className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{overdue}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-2">Completion Rate</p>
            <Progress value={completionRate} className="h-2 mb-1" />
            <p className="text-xs text-right text-muted-foreground">{completionRate}%</p>
          </CardContent>
        </Card>
      </div>

      <AiRecommendPanel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Assignments */}
        <div>
          <h2 className="text-base font-semibold mb-3">My Assignments</h2>
          <div className="space-y-2">
            {assignments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No learning assignments yet</p>
              </div>
            ) : assignments.map((a) => {
              const Icon = typeIcon[a.learningItem.type] || BookOpen;
              const isOverdue = a.status !== 'COMPLETED' && a.dueDate && new Date(a.dueDate) < new Date();
              return (
                <Card key={a.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
                      a.status === 'COMPLETED' ? 'bg-green-100' : 'bg-indigo-100')}>
                      <Icon className={cn('h-4 w-4', a.status === 'COMPLETED' ? 'text-green-600' : 'text-indigo-600')} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.learningItem.title}</p>
                      <p className="text-xs text-muted-foreground">{a.learningItem.learningPath.title}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {a.learningItem.estimatedMinutes && (
                        <span className="text-xs text-muted-foreground">{a.learningItem.estimatedMinutes}m</span>
                      )}
                      {a.status !== 'COMPLETED' && a.learningItem.type === 'QUIZ' && a.learningItem.quizJson?.questions?.length ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7 px-2 gap-1"
                          onClick={() => setQuizTarget({ assignmentId: a.id, item: a.learningItem })}
                        >
                          <Play className="h-3 w-3" /> Take Quiz
                        </Button>
                      ) : a.status !== 'COMPLETED' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs h-7 px-2"
                          onClick={() => completeMutation.mutate(a.id)}
                          disabled={completeMutation.isPending}
                        >
                          Mark done
                        </Button>
                      ) : null}
                      <Badge className={cn('text-xs border', {
                        'bg-green-50 text-green-700 border-green-200': a.status === 'COMPLETED',
                        'bg-red-50 text-red-700 border-red-200': isOverdue,
                        'bg-blue-50 text-blue-700 border-blue-200': a.status === 'IN_PROGRESS',
                        'bg-gray-50 text-gray-600': a.status === 'ASSIGNED',
                      })}>
                        {isOverdue ? 'Overdue' : a.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Learning Paths */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Learning Paths</h2>
          </div>
          <div className="space-y-3">
            {paths.map((path) => (
              <Card key={path.id} className="hover:shadow-sm transition-shadow group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{path.title}</p>
                      {path.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{path.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        {path.department && <Badge variant="secondary" className="text-xs">{path.department.name}</Badge>}
                        <span className="text-xs text-muted-foreground">{path._count.items} items</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                        <BookOpen className="h-5 w-5 text-indigo-600" />
                      </div>
                      {canManagePaths && (
                        <button
                          onClick={() => setDeletePathId(path.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-opacity"
                          title="Delete path"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {paths.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                <p className="text-sm">No learning paths yet</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <AssignDialog open={assignOpen} onClose={() => setAssignOpen(false)} />

      {createPathOpen && (
        <CreatePathDialog
          open={createPathOpen}
          onClose={() => setCreatePathOpen(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['learning-paths'] });
            setCreatePathOpen(false);
          }}
        />
      )}

      <Dialog open={!!deletePathId} onOpenChange={(v) => !v && setDeletePathId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Learning Path</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the learning path and all its items. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePathId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deletePathId && deletePathMutation.mutate(deletePathId)}
              disabled={deletePathMutation.isPending}
            >
              {deletePathMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {quizTarget && (
        <QuizDialog
          assignmentId={quizTarget.assignmentId}
          item={quizTarget.item}
          onClose={() => setQuizTarget(null)}
          onPassed={() => {
            completeMutation.mutate(quizTarget.assignmentId);
            setQuizTarget(null);
          }}
        />
      )}
    </div>
  );
}

// ── Create Path dialog ────────────────────────────────────────────────────────

function CreatePathDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open,
  });
  const [departmentId, setDepartmentId] = useState('');

  const handleCreate = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/learning/paths', {
        title: title.trim(),
        description: description.trim() || undefined,
        departmentId: departmentId || undefined,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-indigo-500" />
            New Learning Path
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input placeholder="e.g. Sales Onboarding" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea placeholder="What will learners gain?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Department (optional)</Label>
            <Select value={departmentId || 'none'} onValueChange={(v) => setDepartmentId(v === 'none' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="All departments" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={!title.trim() || saving}>
            {saving ? 'Creating...' : 'Create Path'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Quiz engine ───────────────────────────────────────────────────────────────

function QuizDialog({ assignmentId, item, onClose, onPassed }: {
  assignmentId: string;
  item: LearningItemFull;
  onClose: () => void;
  onPassed: () => void;
}) {
  const quiz = item.quizJson as QuizJson;
  const questions = quiz?.questions ?? [];
  const passMark = quiz?.passMark ?? 70;

  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);

  const score = submitted
    ? Math.round((questions.filter((q) => answers[q.id] === q.correct).length / questions.length) * 100)
    : 0;
  const passed = submitted && score >= passMark;

  const handleSelect = (qId: string, idx: number) => {
    if (!submitted) setAnswers((prev) => ({ ...prev, [qId]: idx }));
  };

  const handleSubmit = () => {
    if (Object.keys(answers).length < questions.length) return;
    setSubmitted(true);
  };

  const question = questions[currentQ];
  const answered = Object.keys(answers).length;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-indigo-500" />
            {item.title}
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="py-6 text-center space-y-4">
            {passed ? (
              <>
                <Trophy className="h-12 w-12 text-yellow-500 mx-auto" />
                <p className="text-xl font-bold text-green-600">Passed! 🎉</p>
              </>
            ) : (
              <>
                <XCircle className="h-12 w-12 text-red-400 mx-auto" />
                <p className="text-xl font-bold text-red-600">Not passed</p>
              </>
            )}
            <p className="text-3xl font-bold">{score}%</p>
            <p className="text-sm text-muted-foreground">Pass mark: {passMark}% · {questions.filter((q) => answers[q.id] === q.correct).length}/{questions.length} correct</p>

            {/* Answer review */}
            <div className="text-left space-y-3 max-h-48 overflow-y-auto mt-2">
              {questions.map((q, i) => {
                const isCorrect = answers[q.id] === q.correct;
                return (
                  <div key={q.id} className={cn('rounded p-3 text-sm', isCorrect ? 'bg-green-50' : 'bg-red-50')}>
                    <p className="font-medium">{i + 1}. {q.text}</p>
                    <p className={cn('text-xs mt-1', isCorrect ? 'text-green-700' : 'text-red-700')}>
                      {isCorrect ? '✓ Correct' : `✗ You chose: ${q.options[answers[q.id]]} · Correct: ${q.options[q.correct]}`}
                    </p>
                    {q.explanation && <p className="text-xs text-muted-foreground mt-1">{q.explanation}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Question {currentQ + 1} of {questions.length}</span>
              <span>{answered}/{questions.length} answered</span>
            </div>
            <Progress value={((currentQ + 1) / questions.length) * 100} className="h-1" />

            {question && (
              <div className="space-y-3">
                <p className="font-medium">{question.text}</p>
                <div className="space-y-2">
                  {question.options.map((opt, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelect(question.id, idx)}
                      className={cn(
                        'w-full text-left text-sm rounded-md border px-3 py-2.5 transition-colors',
                        answers[question.id] === idx
                          ? 'border-primary bg-primary/5 text-primary font-medium'
                          : 'hover:border-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <span className="font-medium mr-2">{String.fromCharCode(65 + idx)}.</span>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setCurrentQ((q) => Math.max(0, q - 1))}
                disabled={currentQ === 0}
              >
                Previous
              </Button>
              {currentQ < questions.length - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setCurrentQ((q) => Math.min(questions.length - 1, q + 1))}
                  disabled={!answers[question?.id]}
                >
                  Next
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={answered < questions.length}
                >
                  Submit Quiz
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          {submitted && passed ? (
            <Button onClick={onPassed} className="gap-2">
              <CheckCircle2 className="h-4 w-4" /> Mark Complete
            </Button>
          ) : submitted ? (
            <Button variant="outline" onClick={onClose}>Close (Retry later)</Button>
          ) : (
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
