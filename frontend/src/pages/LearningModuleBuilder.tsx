import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Trash2, Edit2, GripVertical, BookOpen,
  Video, FileText, Link2, CheckSquare, HelpCircle, Eye, EyeOff,
  Loader2, ChevronDown, ChevronUp, Users, Save, Upload, X,
} from 'lucide-react';
import { learningApi, LearningLesson, LearningPhase, LearningModule } from '@/api/learning';
import api from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import EnrollUsersDialog from '@/components/learning/EnrollUsersDialog';

const CONTENT_TYPE_ICONS: Record<string, React.ElementType> = {
  VIDEO: Video,
  PDF: FileText,
  ARTICLE: BookOpen,
  QUIZ: HelpCircle,
  EMBED: Link2,
  CHECKPOINT: CheckSquare,
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  VIDEO: 'Video',
  PDF: 'PDF',
  ARTICLE: 'Article',
  QUIZ: 'Quiz',
  EMBED: 'Embed',
  CHECKPOINT: 'Checkpoint',
};

const PHASE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#0ea5e9'];

interface LessonForm {
  title: string;
  description: string;
  contentType: string;
  contentUrl: string;
  contentBody: string;
  notesUrl: string;
  topics: string;
  dayStart: string;
  dayEnd: string;
  durationMins: string;
  isRequired: boolean;
  checkpointItems: string;
  phaseId: string;
}

const EMPTY_LESSON: LessonForm = {
  title: '',
  description: '',
  contentType: 'ARTICLE',
  contentUrl: '',
  contentBody: '',
  notesUrl: '',
  topics: '',
  dayStart: '',
  dayEnd: '',
  durationMins: '',
  isRequired: true,
  checkpointItems: '',
  phaseId: '',
};

export default function LearningModuleBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expandedPhase, setExpandedPhase] = useState<string | null>(null);
  const [showLessonForm, setShowLessonForm] = useState(false);
  const [editLesson, setEditLesson] = useState<LearningLesson | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonForm>(EMPTY_LESSON);
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [phaseTitle, setPhaseTitle] = useState('');
  const [phaseColor, setPhaseColor] = useState(PHASE_COLORS[0]);
  const [showEnroll, setShowEnroll] = useState(false);
  const [deleteLesson, setDeleteLesson] = useState<string | null>(null);

  const { data: module, isLoading } = useQuery({
    queryKey: ['learning:module', id],
    queryFn: () => learningApi.getModule(id!),
    enabled: !!id,
  });

  const createLessonMutation = useMutation({
    mutationFn: (data: Partial<LearningLesson>) => learningApi.createLesson(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      setShowLessonForm(false);
      setLessonForm(EMPTY_LESSON);
      toast.success('Lesson added');
    },
    onError: () => toast.error('Failed to add lesson'),
  });

  const updateLessonMutation = useMutation({
    mutationFn: ({ lessonId, data }: { lessonId: string; data: Partial<LearningLesson> }) =>
      learningApi.updateLesson(id!, lessonId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      setEditLesson(null);
      setShowLessonForm(false);
      toast.success('Lesson updated');
    },
    onError: () => toast.error('Failed to update lesson'),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: (lessonId: string) => learningApi.deleteLesson(id!, lessonId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      setDeleteLesson(null);
      toast.success('Lesson deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  const createPhaseMutation = useMutation({
    mutationFn: (data: Partial<LearningPhase>) => learningApi.createPhase(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      setShowPhaseForm(false);
      setPhaseTitle('');
      toast.success('Phase added');
    },
    onError: () => toast.error('Failed to add phase'),
  });

  const notesFileInputRef = useRef<HTMLInputElement>(null);
  const uploadNotesMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post<{ url: string }>('/upload/content', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: (data) => {
      setLessonForm((f) => ({ ...f, notesUrl: data.url }));
      toast.success('Notes PDF uploaded');
    },
    onError: () => toast.error('Failed to upload notes PDF'),
  });

  const deletePhaseMutation = useMutation({
    mutationFn: (phaseId: string) => learningApi.deletePhase(id!, phaseId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      toast.success('Phase deleted');
    },
    onError: () => toast.error('Failed to delete phase'),
  });

  const publishMutation = useMutation({
    mutationFn: () => learningApi.publishModule(id!),
    onSuccess: (mod: LearningModule) => {
      qc.invalidateQueries({ queryKey: ['learning:module', id] });
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      toast.success(mod.isPublished ? 'Module published' : 'Module unpublished');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  function openCreateLesson(phaseId?: string) {
    setEditLesson(null);
    setLessonForm({ ...EMPTY_LESSON, phaseId: phaseId ?? '' });
    setShowLessonForm(true);
  }

  function openEditLesson(lesson: LearningLesson) {
    setEditLesson(lesson);
    setLessonForm({
      title: lesson.title,
      description: lesson.description ?? '',
      contentType: lesson.contentType,
      contentUrl: lesson.contentUrl ?? '',
      contentBody: lesson.contentBody ?? '',
      notesUrl: lesson.notesUrl ?? '',
      topics: (lesson.topics ?? []).join(', '),
      dayStart: lesson.dayStart?.toString() ?? '',
      dayEnd: lesson.dayEnd?.toString() ?? '',
      durationMins: lesson.durationMins?.toString() ?? '',
      isRequired: lesson.isRequired,
      checkpointItems: (lesson.checkpointItems ?? []).join('\n'),
      phaseId: lesson.phaseId ?? '',
    });
    setShowLessonForm(true);
  }

  function submitLesson() {
    const data: Partial<LearningLesson> = {
      title: lessonForm.title,
      description: lessonForm.description || undefined,
      contentType: lessonForm.contentType as LearningLesson['contentType'],
      contentUrl: lessonForm.contentUrl || null,
      contentBody: lessonForm.contentBody || null,
      notesUrl: lessonForm.notesUrl || null,
      topics: lessonForm.topics ? lessonForm.topics.split(',').map((t) => t.trim()).filter(Boolean) : [],
      dayStart: lessonForm.dayStart ? parseInt(lessonForm.dayStart) : null,
      dayEnd: lessonForm.dayEnd ? parseInt(lessonForm.dayEnd) : null,
      durationMins: lessonForm.durationMins ? parseInt(lessonForm.durationMins) : null,
      isRequired: lessonForm.isRequired,
      checkpointItems: lessonForm.checkpointItems
        ? lessonForm.checkpointItems.split('\n').map((s) => s.trim()).filter(Boolean)
        : null,
      phaseId: lessonForm.phaseId || null,
    };

    if (editLesson) {
      updateLessonMutation.mutate({ lessonId: editLesson.id, data });
    } else {
      createLessonMutation.mutate(data);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!module) return null;

  const phaseLessons = (phaseId: string | null) =>
    module.lessons.filter((l) => l.phaseId === phaseId);
  const ungroupedLessons = module.lessons.filter((l) => !l.phaseId);

  return (
    <div className="p-8 max-w-full mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap border-b border-muted pb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/learning/admin')} className="shrink-0 rounded-xl hover:bg-muted transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold text-foreground/90 tracking-tight truncate">{module.title}</h1>
            {module.isPublished ? (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                Published
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-bold bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full">
                Draft
              </span>
            )}
          </div>
          {module.description && (
            <p className="text-sm text-muted-foreground mt-1 font-medium leading-relaxed">{module.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Button variant="outline" className="font-semibold shadow-sm border-muted/80" onClick={() => setShowEnroll(true)}>
            <Users className="h-4 w-4 mr-2 text-indigo-500" />
            Enroll Users
          </Button>
          <Button
            className="font-bold shadow-md hover:shadow-lg transition-all"
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending}
            variant={module.isPublished ? 'outline' : 'default'}
          >
            {publishMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : module.isPublished ? (
              <EyeOff className="h-4 w-4 mr-2" />
            ) : (
              <Eye className="h-4 w-4 mr-2" />
            )}
            {module.isPublished ? 'Unpublish' : 'Publish'}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 bg-muted/20 border border-muted/60 p-5 rounded-2xl shadow-sm text-center">
        {[
          { label: 'Phases Count', value: module.phases.length },
          { label: 'Total Lessons', value: module.lessons.length },
          { label: 'Users Enrolled', value: module._count?.enrollments ?? 0 },
          { label: 'Course Duration', value: module.durationDays ? `${module.durationDays} days` : 'Flexible' },
          { label: 'Pass Score Limit', value: `${module.passScore}%` },
        ].map((stat) => (
          <div key={stat.label} className="space-y-1">
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">{stat.label}</p>
            <p className="text-lg font-extrabold text-foreground/90">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Phases */}
      <div className="space-y-5">
        {module.phases.map((phase, pi) => (
          <div key={phase.id} className="border border-muted rounded-2xl overflow-hidden shadow-sm bg-card/60 backdrop-blur-sm transition-all duration-300 hover:shadow-md hover:border-muted-foreground/20">
            <div
              className="flex items-center gap-4 p-5 cursor-pointer hover:bg-muted/40 transition-colors"
              style={{ borderLeft: `5px solid ${phase.color ?? PHASE_COLORS[pi % PHASE_COLORS.length]}` }}
              onClick={() => setExpandedPhase(expandedPhase === phase.id ? null : phase.id)}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Phase {phase.phaseNumber}
                  </span>
                  {phase.dayStart && phase.dayEnd && (
                    <span className="text-[10px] font-semibold text-indigo-500 bg-indigo-500/5 px-2 py-0.5 rounded-full">Day {phase.dayStart}–{phase.dayEnd}</span>
                  )}
                </div>
                <h3 className="font-bold text-base text-foreground/80 mt-0.5">{phase.title}</h3>
              </div>
              <span className="text-xs font-bold text-muted-foreground shrink-0">{phaseLessons(phase.id).length} lessons</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-500/10 rounded-lg transition-colors"
                onClick={(e) => { e.stopPropagation(); deletePhaseMutation.mutate(phase.id); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {expandedPhase === phase.id ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>

            {expandedPhase === phase.id && (
              <div className="border-t border-muted/50 p-5 space-y-3.5 bg-muted/10">
                {phaseLessons(phase.id).map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    onEdit={() => openEditLesson(lesson)}
                    onDelete={() => setDeleteLesson(lesson.id)}
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-dashed font-semibold hover:border-primary hover:text-primary transition-all rounded-xl"
                  onClick={() => openCreateLesson(phase.id)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Lesson
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ungrouped lessons */}
      {ungroupedLessons.length > 0 && (
        <div className="border border-muted rounded-2xl overflow-hidden shadow-sm bg-card/60 backdrop-blur-sm">
          <div className="p-4 border-b border-muted bg-muted/20">
            <h3 className="font-bold text-sm text-muted-foreground uppercase tracking-wider">Ungrouped Lessons</h3>
          </div>
          <div className="p-5 space-y-3.5">
            {ungroupedLessons.map((lesson) => (
              <LessonRow
                key={lesson.id}
                lesson={lesson}
                onEdit={() => openEditLesson(lesson)}
                onDelete={() => setDeleteLesson(lesson.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Phase / Add Lesson buttons */}
      <div className="flex items-center gap-3 pt-2">
        <Button variant="outline" className="font-semibold shadow-sm rounded-xl" onClick={() => setShowPhaseForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Phase
        </Button>
        <Button variant="outline" className="font-semibold shadow-sm rounded-xl" onClick={() => openCreateLesson()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Lesson
        </Button>
      </div>

      {/* Add Phase Dialog */}
      <Dialog open={showPhaseForm} onOpenChange={(o) => { if (!o) setShowPhaseForm(false); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Add Phase</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Phase Title *</label>
              <Input
                placeholder="e.g. Foundation"
                value={phaseTitle}
                onChange={(e) => setPhaseTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Color</label>
              <div className="flex gap-2">
                {PHASE_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      'h-7 w-7 rounded-full border-2 transition-transform',
                      phaseColor === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ background: c }}
                    onClick={() => setPhaseColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPhaseForm(false)}>Cancel</Button>
            <Button
              disabled={!phaseTitle || createPhaseMutation.isPending}
              onClick={() => createPhaseMutation.mutate({
                title: phaseTitle,
                phaseNumber: module.phases.length + 1,
                color: phaseColor,
                order: module.phases.length,
              })}
            >
              {createPhaseMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add Phase
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lesson Form Dialog */}
      <Dialog open={showLessonForm} onOpenChange={(o) => { if (!o) { setShowLessonForm(false); setEditLesson(null); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editLesson ? 'Edit Lesson' : 'Add Lesson'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input
                placeholder="Lesson title"
                value={lessonForm.title}
                onChange={(e) => setLessonForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder="Brief description"
                rows={2}
                value={lessonForm.description}
                onChange={(e) => setLessonForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Content Type *</label>
                <Select
                  value={lessonForm.contentType}
                  onValueChange={(v) => setLessonForm((f) => ({ ...f, contentType: v }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTENT_TYPE_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Phase</label>
                <Select
                  value={lessonForm.phaseId || '__none'}
                  onValueChange={(v) => setLessonForm((f) => ({ ...f, phaseId: v === '__none' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="No phase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">No phase</SelectItem>
                    {module.phases.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {['VIDEO', 'PDF', 'EMBED'].includes(lessonForm.contentType) && (
              <div>
                <label className="text-sm font-medium mb-1 block">Content URL</label>
                <Input
                  placeholder="https://..."
                  value={lessonForm.contentUrl}
                  onChange={(e) => setLessonForm((f) => ({ ...f, contentUrl: e.target.value }))}
                />
                {lessonForm.contentType === 'VIDEO' && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste a YouTube, Vimeo, or direct video link — it plays inline for learners, no redirect.
                  </p>
                )}
              </div>
            )}
            {['ARTICLE', 'CHECKPOINT'].includes(lessonForm.contentType) && (
              <div>
                <label className="text-sm font-medium mb-1 block">Content Body</label>
                <Textarea
                  placeholder="Lesson content or description"
                  rows={4}
                  value={lessonForm.contentBody}
                  onChange={(e) => setLessonForm((f) => ({ ...f, contentBody: e.target.value }))}
                />
              </div>
            )}
            {lessonForm.contentType === 'CHECKPOINT' && (
              <div>
                <label className="text-sm font-medium mb-1 block">Checkpoint Items (one per line)</label>
                <Textarea
                  placeholder="Complete product demo&#10;Shadow 3 sales calls&#10;Submit first deal report"
                  rows={4}
                  value={lessonForm.checkpointItems}
                  onChange={(e) => setLessonForm((f) => ({ ...f, checkpointItems: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium mb-1 block">Notes (PDF)</label>
              {lessonForm.notesUrl ? (
                <div className="flex items-center justify-between gap-2 border rounded-md px-3 py-2 bg-muted/20">
                  <a
                    href={lessonForm.notesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm truncate flex items-center gap-2 text-primary hover:underline"
                  >
                    <FileText className="h-4 w-4 shrink-0" /> Notes attached
                  </a>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setLessonForm((f) => ({ ...f, notesUrl: '' }))}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <input
                    ref={notesFileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadNotesMutation.mutate(file);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadNotesMutation.isPending}
                    onClick={() => notesFileInputRef.current?.click()}
                  >
                    {uploadNotesMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload PDF
                  </Button>
                </>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Topics (comma separated)</label>
              <Input
                placeholder="e.g. Onboarding, Product Tour, CRM"
                value={lessonForm.topics}
                onChange={(e) => setLessonForm((f) => ({ ...f, topics: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Day Start</label>
                <Input
                  type="number"
                  placeholder="1"
                  value={lessonForm.dayStart}
                  onChange={(e) => setLessonForm((f) => ({ ...f, dayStart: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Day End</label>
                <Input
                  type="number"
                  placeholder="5"
                  value={lessonForm.dayEnd}
                  onChange={(e) => setLessonForm((f) => ({ ...f, dayEnd: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Duration (mins)</label>
                <Input
                  type="number"
                  placeholder="30"
                  value={lessonForm.durationMins}
                  onChange={(e) => setLessonForm((f) => ({ ...f, durationMins: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="isRequired"
                type="checkbox"
                checked={lessonForm.isRequired}
                onChange={(e) => setLessonForm((f) => ({ ...f, isRequired: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="isRequired" className="text-sm font-medium cursor-pointer">
                Required lesson (counts toward completion)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLessonForm(false); setEditLesson(null); }}>
              Cancel
            </Button>
            <Button
              onClick={submitLesson}
              disabled={!lessonForm.title || createLessonMutation.isPending || updateLessonMutation.isPending}
            >
              {(createLessonMutation.isPending || updateLessonMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              <Save className="h-4 w-4 mr-2" />
              {editLesson ? 'Save Changes' : 'Add Lesson'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Lesson Confirm */}
      <Dialog open={!!deleteLesson} onOpenChange={(o) => { if (!o) setDeleteLesson(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete Lesson?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This will permanently delete the lesson and all progress data.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteLesson(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteLesson && deleteLessonMutation.mutate(deleteLesson)}
              disabled={deleteLessonMutation.isPending}
            >
              {deleteLessonMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll Users Dialog */}
      {showEnroll && (
        <EnrollUsersDialog
          moduleId={id!}
          departmentId={module.departmentId}
          open={showEnroll}
          onClose={() => setShowEnroll(false)}
        />
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  onEdit,
  onDelete,
}: {
  lesson: LearningLesson;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const Icon = CONTENT_TYPE_ICONS[lesson.contentType] ?? BookOpen;
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl bg-card border border-muted hover:border-primary/30 shadow-sm transition-all duration-300">
      <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab hover:text-foreground transition-colors" />
      <div className="h-10 w-10 rounded-xl bg-muted/60 border border-muted flex items-center justify-center text-muted-foreground shrink-0">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-bold text-foreground/80 truncate block">{lesson.title}</span>
        <div className="flex items-center gap-2.5 mt-1 text-xs font-semibold text-muted-foreground">
          <Badge variant="outline" className="text-[10px] px-2 py-0 font-bold border-muted/80">{CONTENT_TYPE_LABELS[lesson.contentType]}</Badge>
          {lesson.dayStart && lesson.dayEnd && (
            <span>Day {lesson.dayStart}–{lesson.dayEnd}</span>
          )}
          {lesson.durationMins && <span>· {lesson.durationMins} min</span>}
          {!lesson.isRequired && <span className="text-muted-foreground/60 italic font-normal">Optional</span>}
        </div>
      </div>
      {lesson.topics && lesson.topics.length > 0 && (
        <div className="hidden sm:flex gap-1.5 flex-wrap">
          {lesson.topics.slice(0, 2).map((t) => (
            <span key={t} className="text-[11px] font-bold bg-muted px-2 py-0.5 rounded-md border border-muted-foreground/10 text-muted-foreground">{t}</span>
          ))}
          {lesson.topics.length > 2 && (
            <span className="text-[11px] font-bold bg-muted px-2 py-0.5 rounded-md border border-muted-foreground/10 text-muted-foreground">+{lesson.topics.length - 2}</span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-muted rounded-lg transition-colors" onClick={onEdit}>
          <Edit2 className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
