import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users2, Briefcase, ClipboardList, Plus, Sparkles, ChevronDown,
  Mail, Phone, Link2, Check, Star, FileText, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import api from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type HiringStage =
  | 'OPEN' | 'SOURCING' | 'SCREENING' | 'INTERVIEWING'
  | 'OFFER' | 'HIRED' | 'REJECTED' | 'ON_HOLD';

type CandidateStatus = 'ACTIVE' | 'ARCHIVED' | 'HIRED' | 'REJECTED';

interface Department { id: string; name: string }

interface JobDescription {
  id: string;
  title: string;
  description?: string;
  requirements?: string;
  niceToHave?: string;
  salaryMin?: number;
  salaryMax?: number;
  location?: string;
  isRemote: boolean;
  stage: HiringStage;
  departmentId?: string;
  department?: Department;
  createdAt: string;
  _count?: { candidates: number };
  candidates?: CandidateSummary[];
}

interface CandidateSummary {
  id: string;
  name: string;
  email: string;
  stage: HiringStage;
  status: CandidateStatus;
  consentGiven: boolean;
  createdAt: string;
}

interface Candidate extends CandidateSummary {
  phone?: string;
  resumeUrl?: string;
  linkedinUrl?: string;
  notes?: string;
  jobId: string;
  job: { id: string; title: string };
  scorecards: Scorecard[];
}

interface Scorecard {
  id: string;
  round: string;
  scores: Record<string, unknown>;
  overallRating?: number;
  recommendation?: string;
  notes?: string;
  conductedAt: string;
  interviewer: { id: string; name: string; avatarUrl?: string };
}

interface ChecklistItem { text: string; done: boolean }

interface OnboardingChecklist {
  id: string;
  title: string;
  items: ChecklistItem[];
  completedAt?: string;
  createdAt: string;
  userId: string;
  user: { id: string; name: string; avatarUrl?: string };
}

interface UserBasic { id: string; name: string; role: string }

// ─── Stage helpers ────────────────────────────────────────────────────────────

const HIRING_STAGES: HiringStage[] = [
  'OPEN', 'SOURCING', 'SCREENING', 'INTERVIEWING', 'OFFER', 'HIRED', 'REJECTED', 'ON_HOLD',
];

const stageBadge: Record<HiringStage, string> = {
  OPEN: 'bg-gray-100 text-gray-700 border-gray-200',
  SOURCING: 'bg-blue-50 text-blue-700 border-blue-200',
  SCREENING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  INTERVIEWING: 'bg-orange-50 text-orange-700 border-orange-200',
  OFFER: 'bg-purple-50 text-purple-700 border-purple-200',
  HIRED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  ON_HOLD: 'bg-slate-100 text-slate-600 border-slate-200',
};

function StageBadge({ stage }: { stage: HiringStage }) {
  return (
    <Badge className={cn('text-xs border', stageBadge[stage])}>
      {stage.replace('_', ' ')}
    </Badge>
  );
}

function fmtSalary(min?: number, max?: number) {
  if (!min && !max) return null;
  const fmt = (n: number) => `₹${(n / 100000).toFixed(1)}L`;
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `From ${fmt(min)}`;
  return `Up to ${fmt(max!)}`;
}

// ─── New Job Dialog ───────────────────────────────────────────────────────────

function NewJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: '', location: '', isRemote: false,
    salaryMin: '', salaryMax: '', departmentId: '',
  });
  const [saving, setSaving] = useState(false);

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments-list'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/hiring/jobs', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-jobs'] });
      handleClose();
    },
  });

  const handleClose = () => {
    setForm({ title: '', location: '', isRemote: false, salaryMin: '', salaryMax: '', departmentId: '' });
    onClose();
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await createMutation.mutateAsync({
      title: form.title,
      location: form.location || undefined,
      isRemote: form.isRemote,
      salaryMin: form.salaryMin ? parseInt(form.salaryMin) : undefined,
      salaryMax: form.salaryMax ? parseInt(form.salaryMax) : undefined,
      departmentId: form.departmentId || undefined,
    });
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-indigo-500" />
            New Job Opening
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Job Title *</Label>
            <Input
              placeholder="e.g. Senior Product Designer"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Location</Label>
              <Input
                placeholder="e.g. Mumbai"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={form.departmentId} onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Any" />
                </SelectTrigger>
                <SelectContent>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Min Salary (₹)</Label>
              <Input
                type="number"
                placeholder="e.g. 800000"
                value={form.salaryMin}
                onChange={(e) => setForm((f) => ({ ...f, salaryMin: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Max Salary (₹)</Label>
              <Input
                type="number"
                placeholder="e.g. 1200000"
                value={form.salaryMax}
                onChange={(e) => setForm((f) => ({ ...f, salaryMax: e.target.value }))}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.isRemote}
              onChange={(e) => setForm((f) => ({ ...f, isRemote: e.target.checked }))}
              className="rounded"
            />
            Remote-friendly
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.title.trim() || saving}>
            {saving ? 'Creating...' : 'Create Job'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Job Detail Dialog ────────────────────────────────────────────────────────

function JobDetailDialog({
  job,
  onClose,
  onAddCandidate,
}: {
  job: JobDescription;
  onClose: () => void;
  onAddCandidate: (jobId: string) => void;
}) {
  const qc = useQueryClient();
  const [generatingJD, setGeneratingJD] = useState(false);
  const [context, setContext] = useState('');
  const [updatingStage, setUpdatingStage] = useState(false);

  const { data: fullJob } = useQuery<JobDescription>({
    queryKey: ['hiring-job', job.id],
    queryFn: () => api.get(`/hiring/jobs/${job.id}`).then((r) => r.data),
  });

  const displayed = fullJob ?? job;

  const updateStageMutation = useMutation({
    mutationFn: (stage: HiringStage) => api.patch(`/hiring/jobs/${job.id}`, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-jobs'] });
      qc.invalidateQueries({ queryKey: ['hiring-job', job.id] });
    },
  });

  const generateJD = async () => {
    setGeneratingJD(true);
    try {
      const res = await api.post<{ description: string; requirements: string; niceToHave: string }>(
        `/hiring/jobs/${job.id}/ai-jd`,
        { context }
      );
      await api.patch(`/hiring/jobs/${job.id}`, {
        description: res.data.description,
        requirements: res.data.requirements,
        niceToHave: res.data.niceToHave,
      });
      qc.invalidateQueries({ queryKey: ['hiring-job', job.id] });
    } finally {
      setGeneratingJD(false);
    }
  };

  const handleStageChange = async (stage: string) => {
    setUpdatingStage(true);
    await updateStageMutation.mutateAsync(stage as HiringStage);
    setUpdatingStage(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-lg">{displayed.title}</DialogTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {displayed.department && (
                  <span className="text-xs text-muted-foreground">{displayed.department.name}</span>
                )}
                {displayed.location && (
                  <span className="text-xs text-muted-foreground">
                    {displayed.location}{displayed.isRemote ? ' (Remote OK)' : ''}
                  </span>
                )}
                {fmtSalary(displayed.salaryMin, displayed.salaryMax) && (
                  <span className="text-xs text-muted-foreground">
                    {fmtSalary(displayed.salaryMin, displayed.salaryMax)}
                  </span>
                )}
              </div>
            </div>
            <StageBadge stage={displayed.stage} />
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Stage updater */}
          <div className="flex items-center gap-3">
            <Label className="shrink-0 text-xs">Update Stage</Label>
            <Select
              value={displayed.stage}
              onValueChange={handleStageChange}
              disabled={updatingStage}
            >
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HIRING_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="ml-auto gap-1.5 text-xs"
              onClick={() => onAddCandidate(job.id)}
            >
              <Plus className="h-3.5 w-3.5" /> Add Candidate
            </Button>
          </div>

          {/* AI JD generation */}
          <div className="rounded-lg border p-3 bg-indigo-50/50 space-y-2">
            <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Generate Job Description (3 credits)
            </p>
            <Input
              className="text-xs h-8"
              placeholder="Optional context: team size, seniority level, key projects..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={generateJD}
              disabled={generatingJD}
            >
              <Sparkles className="h-3 w-3" />
              {generatingJD ? 'Generating...' : 'Generate JD'}
            </Button>
          </div>

          {/* Description */}
          {displayed.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Overview</p>
              <p className="text-sm whitespace-pre-wrap">{displayed.description}</p>
            </div>
          )}

          {displayed.requirements && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Requirements</p>
              <p className="text-sm whitespace-pre-wrap">{displayed.requirements}</p>
            </div>
          )}

          {displayed.niceToHave && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Nice to Have</p>
              <p className="text-sm whitespace-pre-wrap">{displayed.niceToHave}</p>
            </div>
          )}

          {/* Candidates list */}
          {(displayed.candidates ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Candidates ({displayed.candidates!.length})
              </p>
              <div className="space-y-1.5">
                {displayed.candidates!.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{c.email}</p>
                    </div>
                    <StageBadge stage={c.stage} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Candidate Dialog ─────────────────────────────────────────────────────

function AddCandidateDialog({
  jobId,
  onClose,
}: {
  jobId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', resumeUrl: '', linkedinUrl: '', consent: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: jobs = [] } = useQuery<JobDescription[]>({
    queryKey: ['hiring-jobs'],
    queryFn: () => api.get('/hiring/jobs').then((r) => r.data),
  });

  const [selectedJob, setSelectedJob] = useState(jobId);

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/hiring/candidates', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-candidates'] });
      qc.invalidateQueries({ queryKey: ['hiring-job', selectedJob] });
      onClose();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? 'Failed to add candidate');
    },
  });

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.consent) {
      setError('Name, email, and candidate consent are required');
      return;
    }
    setSaving(true);
    setError('');
    await createMutation.mutateAsync({
      jobId: selectedJob,
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      resumeUrl: form.resumeUrl || undefined,
      linkedinUrl: form.linkedinUrl || undefined,
      consentGiven: true,
    });
    setSaving(false);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-indigo-500" />
            Add Candidate
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Job *</Label>
            <Select value={selectedJob} onValueChange={setSelectedJob}>
              <SelectTrigger>
                <SelectValue placeholder="Select job" />
              </SelectTrigger>
              <SelectContent>
                {jobs.map((j) => (
                  <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Full Name *</Label>
              <Input
                placeholder="Priya Sharma"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="priya@example.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <Input
              placeholder="+91 98765 43210"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Resume URL</Label>
            <Input
              placeholder="https://drive.google.com/..."
              value={form.resumeUrl}
              onChange={(e) => setForm((f) => ({ ...f, resumeUrl: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>LinkedIn URL</Label>
            <Input
              placeholder="https://linkedin.com/in/..."
              value={form.linkedinUrl}
              onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
            />
          </div>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={form.consent}
              onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
              className="rounded mt-0.5"
            />
            <span>
              Candidate has given consent to store and process their personal data for this hiring process *
            </span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.consent}>
            {saving ? 'Adding...' : 'Add Candidate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Candidate Detail Dialog ──────────────────────────────────────────────────

function CandidateDetailDialog({ candidateId, onClose }: { candidateId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [showScorecardForm, setShowScorecardForm] = useState(false);
  const [scoreForm, setScoreForm] = useState({
    round: '', overallRating: '', recommendation: '', notes: '',
    scores: '{"communication": 8, "technical": 7, "culture_fit": 9}',
  });
  const [savingScore, setSavingScore] = useState(false);
  const [updatingStage, setUpdatingStage] = useState(false);

  const { data: candidate } = useQuery<Candidate>({
    queryKey: ['hiring-candidate', candidateId],
    queryFn: () => api.get(`/hiring/candidates/${candidateId}`).then((r) => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/hiring/candidates/${candidateId}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-candidate', candidateId] });
      qc.invalidateQueries({ queryKey: ['hiring-candidates'] });
    },
  });

  const addScorecardMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.post(`/hiring/candidates/${candidateId}/scorecards`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-candidate', candidateId] });
      setShowScorecardForm(false);
      setScoreForm({ round: '', overallRating: '', recommendation: '', notes: '', scores: '{"communication": 8, "technical": 7, "culture_fit": 9}' });
    },
  });

  const handleStageChange = async (stage: string) => {
    setUpdatingStage(true);
    await updateMutation.mutateAsync({ stage });
    setUpdatingStage(false);
  };

  const handleAddScorecard = async () => {
    if (!scoreForm.round) return;
    setSavingScore(true);
    let parsedScores: Record<string, unknown> = {};
    try { parsedScores = JSON.parse(scoreForm.scores) as Record<string, unknown>; } catch { /* use empty */ }
    await addScorecardMutation.mutateAsync({
      round: scoreForm.round,
      scores: parsedScores,
      overallRating: scoreForm.overallRating ? parseInt(scoreForm.overallRating) : undefined,
      recommendation: scoreForm.recommendation || undefined,
      notes: scoreForm.notes || undefined,
    });
    setSavingScore(false);
  };

  const canInterview = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role ?? '');

  if (!candidate) {
    return (
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-xl">
          <div className="py-10 text-center text-muted-foreground text-sm">Loading...</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-4 w-4 text-indigo-500" />
            {candidate.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Info */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />{candidate.email}
            </span>
            {candidate.phone && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />{candidate.phone}
              </span>
            )}
            {candidate.resumeUrl && (
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-indigo-600 hover:underline"
              >
                <FileText className="h-3.5 w-3.5" /> Resume
              </a>
            )}
            {candidate.linkedinUrl && (
              <a
                href={candidate.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-indigo-600 hover:underline"
              >
                <Link2 className="h-3.5 w-3.5" /> LinkedIn
              </a>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Role:</span>
            <span className="text-sm font-medium">{candidate.job.title}</span>
            <span className="text-xs text-muted-foreground ml-2">Stage:</span>
            <StageBadge stage={candidate.stage} />
          </div>

          {/* Stage update */}
          <div className="flex items-center gap-2">
            <Label className="text-xs shrink-0">Move to:</Label>
            <Select value={candidate.stage} onValueChange={handleStageChange} disabled={updatingStage}>
              <SelectTrigger className="h-8 text-xs w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HIRING_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Consent */}
          <div className="flex items-center gap-2 text-xs">
            <span className={cn('inline-flex items-center gap-1', candidate.consentGiven ? 'text-green-600' : 'text-red-600')}>
              {candidate.consentGiven ? <Check className="h-3.5 w-3.5" /> : null}
              {candidate.consentGiven ? 'Consent given' : 'No consent recorded'}
            </span>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea
              className="text-sm resize-none min-h-[60px]"
              placeholder="Add notes about this candidate..."
              defaultValue={candidate.notes ?? ''}
              onBlur={(e) => {
                if (e.target.value !== candidate.notes) {
                  updateMutation.mutate({ notes: e.target.value });
                }
              }}
            />
          </div>

          {/* Scorecards */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Interview Scorecards ({candidate.scorecards.length})
              </p>
              {canInterview && (
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs h-7 gap-1"
                  onClick={() => setShowScorecardForm((v) => !v)}
                >
                  <Plus className="h-3 w-3" />
                  {showScorecardForm ? 'Cancel' : 'Add Scorecard'}
                </Button>
              )}
            </div>

            {showScorecardForm && (
              <div className="border rounded-lg p-3 space-y-3 mb-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Round *</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Technical Round 1"
                      value={scoreForm.round}
                      onChange={(e) => setScoreForm((f) => ({ ...f, round: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Overall Rating (1-10)</Label>
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      min="1"
                      max="10"
                      placeholder="8"
                      value={scoreForm.overallRating}
                      onChange={(e) => setScoreForm((f) => ({ ...f, overallRating: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Scores JSON</Label>
                  <Textarea
                    className="text-xs resize-none min-h-[60px] font-mono"
                    value={scoreForm.scores}
                    onChange={(e) => setScoreForm((f) => ({ ...f, scores: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Recommendation</Label>
                  <Select
                    value={scoreForm.recommendation}
                    onValueChange={(v) => setScoreForm((f) => ({ ...f, recommendation: v }))}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STRONG_YES">Strong Yes</SelectItem>
                      <SelectItem value="YES">Yes</SelectItem>
                      <SelectItem value="MAYBE">Maybe</SelectItem>
                      <SelectItem value="NO">No</SelectItem>
                      <SelectItem value="STRONG_NO">Strong No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    className="text-xs resize-none min-h-[60px]"
                    placeholder="Detailed feedback..."
                    value={scoreForm.notes}
                    onChange={(e) => setScoreForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  className="text-xs gap-1"
                  onClick={handleAddScorecard}
                  disabled={!scoreForm.round || savingScore}
                >
                  {savingScore ? 'Saving...' : 'Submit Scorecard'}
                </Button>
              </div>
            )}

            {candidate.scorecards.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                No scorecards yet
              </p>
            ) : (
              <div className="space-y-2">
                {candidate.scorecards.map((sc) => (
                  <div key={sc.id} className="border rounded-lg p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">{sc.round}</p>
                      <div className="flex items-center gap-2">
                        {sc.overallRating && (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            {sc.overallRating}/10
                          </span>
                        )}
                        {sc.recommendation && (
                          <Badge className="text-xs" variant="secondary">
                            {sc.recommendation.replace('_', ' ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      By {sc.interviewer.name} · {new Date(sc.conductedAt).toLocaleDateString()}
                    </p>
                    {sc.notes && <p className="text-xs text-muted-foreground">{sc.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Onboarding Tab ───────────────────────────────────────────────────────────

function OnboardingTab() {
  const qc = useQueryClient();
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newForm, setNewForm] = useState({ userId: '', title: '', jobId: '' });
  const [manualItems, setManualItems] = useState<ChecklistItem[]>([{ text: '', done: false }]);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: checklists = [] } = useQuery<OnboardingChecklist[]>({
    queryKey: ['hiring-onboarding'],
    queryFn: () => api.get('/hiring/onboarding').then((r) => r.data),
  });

  const { data: users = [] } = useQuery<UserBasic[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: showNewDialog,
  });

  const { data: jobs = [] } = useQuery<JobDescription[]>({
    queryKey: ['hiring-jobs'],
    queryFn: () => api.get('/hiring/jobs').then((r) => r.data),
    enabled: showNewDialog,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.patch(`/hiring/onboarding/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hiring-onboarding'] }),
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post('/hiring/onboarding', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-onboarding'] });
      handleCloseDialog();
    },
  });

  const handleCloseDialog = () => {
    setShowNewDialog(false);
    setNewForm({ userId: '', title: '', jobId: '' });
    setManualItems([{ text: '', done: false }]);
  };

  const generateAIItems = async () => {
    if (!newForm.jobId) return;
    setGeneratingAI(true);
    try {
      const res = await api.post<{ items: ChecklistItem[] }>(`/hiring/jobs/${newForm.jobId}/ai-onboarding`, {});
      setManualItems(res.data.items);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleCreate = async () => {
    if (!newForm.userId || !newForm.title) return;
    const validItems = manualItems.filter((i) => i.text.trim());
    setSaving(true);
    await createMutation.mutateAsync({
      userId: newForm.userId,
      title: newForm.title,
      items: validItems,
    });
    setSaving(false);
  };

  const toggleItem = (checklistId: string, items: ChecklistItem[], idx: number) => {
    const updated = items.map((item, i) => i === idx ? { ...item, done: !item.done } : item);
    const allDone = updated.every((i) => i.done);
    updateMutation.mutate({
      id: checklistId,
      data: { items: updated, completedAt: allDone ? new Date().toISOString() : null },
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{checklists.length} checklists</p>
        <Button size="sm" className="gap-2" onClick={() => setShowNewDialog(true)}>
          <Plus className="h-4 w-4" /> New Checklist
        </Button>
      </div>

      {checklists.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No onboarding checklists yet</p>
          <p className="text-xs mt-1">Create one to track new hire onboarding</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {checklists.map((cl) => {
            const items = cl.items as ChecklistItem[];
            const done = items.filter((i) => i.done).length;
            const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;
            return (
              <Card key={cl.id} className="hover:shadow-sm transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{cl.title}</CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">For {cl.user.name}</p>
                    </div>
                    {cl.completedAt && (
                      <Badge className="text-xs bg-green-50 text-green-700 border-green-200 border">
                        <Check className="h-3 w-3 mr-1" /> Complete
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                      <span>{done}/{items.length} done</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {items.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => toggleItem(cl.id, items, idx)}
                        className={cn(
                          'w-full flex items-start gap-2.5 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50',
                          item.done && 'opacity-60'
                        )}
                      >
                        <div className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border mt-0.5 transition-colors',
                          item.done ? 'bg-indigo-500 border-indigo-500' : 'border-muted-foreground/40'
                        )}>
                          {item.done && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <span className={cn(item.done && 'line-through text-muted-foreground')}>
                          {item.text}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Checklist Dialog */}
      <Dialog open={showNewDialog} onOpenChange={(v) => !v && handleCloseDialog()}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-indigo-500" />
              New Onboarding Checklist
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>New Hire *</Label>
              <Select value={newForm.userId} onValueChange={(v) => setNewForm((f) => ({ ...f, userId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select person being onboarded" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Checklist Title *</Label>
              <Input
                placeholder="e.g. Onboarding — Senior Designer"
                value={newForm.title}
                onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>

            {/* AI generation */}
            <div className="rounded-lg border p-3 bg-indigo-50/50 space-y-2">
              <p className="text-xs font-medium text-indigo-700 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                AI-Generate Items from Job (2 credits)
              </p>
              <Select value={newForm.jobId} onValueChange={(v) => setNewForm((f) => ({ ...f, jobId: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select a job description..." />
                </SelectTrigger>
                <SelectContent>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="text-xs gap-1.5 border-indigo-300 text-indigo-700"
                onClick={generateAIItems}
                disabled={!newForm.jobId || generatingAI}
              >
                <Sparkles className="h-3 w-3" />
                {generatingAI ? 'Generating...' : 'Generate Items'}
              </Button>
            </div>

            {/* Manual items */}
            <div className="space-y-2">
              <Label className="text-xs">Checklist Items</Label>
              {manualItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    className="text-sm h-8 flex-1"
                    placeholder={`Item ${idx + 1}`}
                    value={item.text}
                    onChange={(e) => {
                      const updated = [...manualItems];
                      updated[idx] = { ...updated[idx], text: e.target.value };
                      setManualItems(updated);
                    }}
                  />
                  <button
                    className="text-muted-foreground hover:text-red-500 text-xs px-1"
                    onClick={() => setManualItems((items) => items.filter((_, i) => i !== idx))}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1 h-7"
                onClick={() => setManualItems((items) => [...items, { text: '', done: false }])}
              >
                <Plus className="h-3 w-3" /> Add Item
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={!newForm.userId || !newForm.title || saving}
            >
              {saving ? 'Creating...' : 'Create Checklist'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Jobs Tab ─────────────────────────────────────────────────────────────────

function JobsTab({ onAddCandidate }: { onAddCandidate: (jobId: string) => void }) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobDescription | null>(null);
  const [filterStage, setFilterStage] = useState<string>('');
  const [deleteJobId, setDeleteJobId] = useState<string | null>(null);
  const [deleteJobError, setDeleteJobError] = useState('');

  const canManageJobs = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role ?? '');

  const deleteJobMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hiring/jobs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-jobs'] });
      setDeleteJobId(null);
      setDeleteJobError('');
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setDeleteJobError(e.response?.data?.error ?? 'Failed to delete job');
    },
  });

  const { data: jobs = [] } = useQuery<JobDescription[]>({
    queryKey: ['hiring-jobs', filterStage],
    queryFn: () =>
      api.get('/hiring/jobs', { params: filterStage ? { stage: filterStage } : {} }).then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All stages</SelectItem>
            {HIRING_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{jobs.length} jobs</span>
        {canManageJobs && (
          <Button size="sm" className="gap-2 ml-auto" onClick={() => setShowNewJob(true)}>
            <Plus className="h-4 w-4" /> New Job
          </Button>
        )}
      </div>

      {jobs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No job openings yet</p>
          {canManageJobs && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setShowNewJob(true)}
            >
              Create first job
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {jobs.map((job) => (
            <Card
              key={job.id}
              className="hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => setSelectedJob(job)}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">{job.title}</p>
                    {job.department && (
                      <p className="text-xs text-muted-foreground">{job.department.name}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <StageBadge stage={job.stage} />
                    {canManageJobs && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteJobError(''); setDeleteJobId(job.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-opacity"
                        title="Delete job"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {job.location && (
                    <span>{job.location}{job.isRemote ? ' · Remote' : ''}</span>
                  )}
                  {!job.location && job.isRemote && <span>Remote</span>}
                  {fmtSalary(job.salaryMin, job.salaryMax) && (
                    <span>{fmtSalary(job.salaryMin, job.salaryMax)}</span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {job._count?.candidates ?? 0} candidates
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddCandidate(job.id);
                    }}
                  >
                    <Plus className="h-3 w-3" /> Add Candidate
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNewJob && <NewJobDialog open={showNewJob} onClose={() => setShowNewJob(false)} />}
      {selectedJob && (
        <JobDetailDialog
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onAddCandidate={(jobId) => {
            setSelectedJob(null);
            onAddCandidate(jobId);
          }}
        />
      )}

      <Dialog open={!!deleteJobId} onOpenChange={(v) => { if (!v) { setDeleteJobId(null); setDeleteJobError(''); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Job Opening</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the job opening. Jobs with candidates cannot be deleted — archive the candidates first.
          </p>
          {deleteJobError && <p className="text-sm text-destructive">{deleteJobError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteJobId(null); setDeleteJobError(''); }}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteJobId && deleteJobMutation.mutate(deleteJobId)}
              disabled={deleteJobMutation.isPending}
            >
              {deleteJobMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Candidates Tab ───────────────────────────────────────────────────────────

function CandidatesTab({ addCandidateJobId, onAddCandidateClosed }: {
  addCandidateJobId: string | null;
  onAddCandidateClosed: () => void;
}) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
  const [filterStage, setFilterStage] = useState('');
  const [filterJobId, setFilterJobId] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);

  const canManage = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role ?? '');

  const deleteCandidateMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hiring/candidates/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiring-candidates'] });
      setDeleteCandidateId(null);
    },
  });

  const { data: candidates = [] } = useQuery<(CandidateSummary & { job: { id: string; title: string } })[]>({
    queryKey: ['hiring-candidates', filterStage, filterJobId],
    queryFn: () =>
      api.get('/hiring/candidates', {
        params: {
          ...(filterStage ? { stage: filterStage } : {}),
          ...(filterJobId ? { jobId: filterJobId } : {}),
        },
      }).then((r) => r.data),
  });

  const { data: jobs = [] } = useQuery<JobDescription[]>({
    queryKey: ['hiring-jobs'],
    queryFn: () => api.get('/hiring/jobs').then((r) => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={filterJobId} onValueChange={setFilterJobId}>
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder="All jobs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All jobs</SelectItem>
            {jobs.map((j) => (
              <SelectItem key={j.id} value={j.id}>{j.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder="All stages" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All stages</SelectItem>
            {HIRING_STAGES.map((s) => (
              <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-xs text-muted-foreground">{candidates.length} candidates</span>
      </div>

      {candidates.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Users2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>No candidates yet</p>
          <p className="text-xs mt-1">Add candidates to your job openings</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Name</th>
                <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Job</th>
                <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Stage</th>
                <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Email</th>
                <th className="text-left px-4 py-3 font-medium text-xs text-muted-foreground">Consent</th>
                {canManage && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {candidates.map((c) => (
                <tr
                  key={c.id}
                  className="hover:bg-muted/30 cursor-pointer transition-colors group"
                  onClick={() => setSelectedCandidate(c.id)}
                >
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.job.title}</td>
                  <td className="px-4 py-3">
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{c.email}</td>
                  <td className="px-4 py-3">
                    {c.consentGiven ? (
                      <span className="flex items-center gap-1 text-green-600 text-xs">
                        <Check className="h-3.5 w-3.5" /> Yes
                      </span>
                    ) : (
                      <span className="text-red-500 text-xs">No</span>
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteCandidateId(c.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-opacity"
                        title="Delete candidate"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addCandidateJobId && (
        <AddCandidateDialog jobId={addCandidateJobId} onClose={onAddCandidateClosed} />
      )}

      {selectedCandidate && (
        <CandidateDetailDialog
          candidateId={selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}

      <Dialog open={!!deleteCandidateId} onOpenChange={(v) => !v && setDeleteCandidateId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Candidate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the candidate and all their scorecards. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCandidateId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteCandidateId && deleteCandidateMutation.mutate(deleteCandidateId)}
              disabled={deleteCandidateMutation.isPending}
            >
              {deleteCandidateMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Hiring() {
  const [activeTab, setActiveTab] = useState('jobs');
  const [addCandidateJobId, setAddCandidateJobId] = useState<string | null>(null);

  const handleAddCandidate = (jobId: string) => {
    setAddCandidateJobId(jobId);
    setActiveTab('candidates');
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users2 className="h-6 w-6 text-indigo-500" />
            Hiring & Capability Planner
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage job openings, candidates, and new hire onboarding
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="jobs" className="gap-2">
            <Briefcase className="h-4 w-4" />
            Jobs
          </TabsTrigger>
          <TabsTrigger value="candidates" className="gap-2">
            <Users2 className="h-4 w-4" />
            Candidates
          </TabsTrigger>
          <TabsTrigger value="onboarding" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Onboarding
          </TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-6">
          <JobsTab onAddCandidate={handleAddCandidate} />
        </TabsContent>

        <TabsContent value="candidates" className="mt-6">
          <CandidatesTab
            addCandidateJobId={addCandidateJobId}
            onAddCandidateClosed={() => setAddCandidateJobId(null)}
          />
        </TabsContent>

        <TabsContent value="onboarding" className="mt-6">
          <OnboardingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
