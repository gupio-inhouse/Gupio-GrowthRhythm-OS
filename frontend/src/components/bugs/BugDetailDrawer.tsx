import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, User, UserCog, Pencil, Trash2,
  ImagePlus, FileText, ExternalLink, Bug as BugIcon,
  CheckCircle2, Clock, RotateCcw, ChevronRight, Monitor, FolderKanban,
} from 'lucide-react';
import { Sheet, SheetHeader, SheetTitle, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NewBugDialog, type BugToEdit } from './NewBugDialog';
import { cn, formatRelative, getInitials } from '@/lib/utils';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';

type Comment = {
  id: string; content: string; createdAt: string;
  user: { id: string; name: string; avatarUrl?: string };
};
type BugAttachment = {
  id: string; name: string; url: string; type: string; size?: number | null; createdAt: string;
};
type BugStatusHistory = {
  id: string; fromStatus: string | null; toStatus: string; changedAt: string; note?: string | null;
  changedBy: { id: string; name: string; avatarUrl?: string };
};
type BugDetail = {
  id: string; title: string; description?: string;
  stepsToReproduce?: string; expectedBehavior?: string; actualBehavior?: string; environment?: string;
  status: string; severity: string; createdAt: string;
  reporter: { id: string; name: string; avatarUrl?: string };
  assignee?: { id: string; name: string; avatarUrl?: string } | null;
  team: { id: string; name: string };
  department?: { id: string; name: string };
  comments: Comment[]; attachments: BugAttachment[]; statusHistories: BugStatusHistory[];
};

interface Props {
  bugId: string | null;
  onClose: () => void;
}

const STATUSES = ['OPEN', 'IN_PROGRESS', 'IN_REVIEW', 'REOPENED', 'FIXED', 'CLOSED', 'WONT_FIX', 'DUPLICATE'];
const STATUS_LABELS: Record<string, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In Progress', IN_REVIEW: 'In Review', REOPENED: 'Reopened',
  FIXED: 'Fixed', CLOSED: 'Closed', WONT_FIX: "Won't Fix", DUPLICATE: 'Duplicate',
};

const S: Record<string, { dot: string; badge: string; icon: typeof CheckCircle2; grad: string }> = {
  OPEN:        { dot: 'bg-slate-400',   badge: 'bg-slate-50 text-slate-600 border-slate-200',   icon: BugIcon,       grad: 'from-slate-400 to-gray-500' },
  IN_PROGRESS: { dot: 'bg-blue-500',    badge: 'bg-blue-50 text-blue-700 border-blue-200',      icon: Clock,         grad: 'from-blue-500 to-indigo-600' },
  IN_REVIEW:   { dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200',   icon: Clock,         grad: 'from-amber-500 to-orange-600' },
  REOPENED:    { dot: 'bg-orange-500',  badge: 'bg-orange-50 text-orange-700 border-orange-200', icon: RotateCcw,    grad: 'from-orange-500 to-red-500' },
  FIXED:       { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2, grad: 'from-emerald-500 to-green-600' },
  CLOSED:      { dot: 'bg-gray-400',    badge: 'bg-gray-50 text-gray-600 border-gray-200',       icon: CheckCircle2, grad: 'from-gray-400 to-gray-500' },
  WONT_FIX:    { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',       icon: CheckCircle2, grad: 'from-gray-400 to-gray-500' },
  DUPLICATE:   { dot: 'bg-gray-300',    badge: 'bg-gray-50 text-gray-500 border-gray-200',       icon: CheckCircle2, grad: 'from-gray-400 to-gray-500' },
};

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-50 text-red-700 border-red-200',
  HIGH:     'bg-orange-50 text-orange-700 border-orange-200',
  MEDIUM:   'bg-blue-50 text-blue-700 border-blue-200',
  LOW:      'bg-gray-50 text-gray-500 border-gray-200',
};

function formatBugError(error: unknown) {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const r = (error as Record<string, unknown>).response;
    if (typeof r === 'object' && r !== null && 'data' in r) {
      const d = (r as Record<string, unknown>).data;
      if (typeof d === 'object' && d !== null && 'error' in d && typeof (d as Record<string, unknown>).error === 'string')
        return (d as Record<string, string>).error;
    }
  }
  if (error instanceof Error) return error.message;
  return 'Something went wrong. Please try again.';
}
function resolveAttachmentUrl(url: string) {
  if (/^https?:\/\//i.test(url)) return url;
  const base = api.defaults.baseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return new URL(url, base).toString();
  return url;
}

export function BugDetailDrawer({ bugId, onClose }: Props) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [comment, setComment] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const screenshotInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);

  // Matches backend/src/routes/bugs.ts ALLOWED_ROLES + canMutateBug: no COMPANY_ADMIN,
  // and a TEAM_MEMBER can only edit a bug they're the current assignee of (not just reporter).
  const canManage = ['OWNER', 'DEPARTMENT_HEAD', 'MANAGER'].includes(user?.role || '');

  const { data: bug, isLoading } = useQuery<BugDetail>({
    queryKey: ['bug', bugId],
    queryFn: () => api.get(`/bugs/${bugId}`).then((r) => r.data),
    enabled: !!bugId,
  });

  const isAssignee = !!bug && !!user?.id && bug.assignee?.id === user.id;
  const canEdit = canManage || isAssignee;
  const canDelete = canManage;

  const STATUS_TOAST: Record<string, string> = {
    IN_PROGRESS: 'Bug moved to In Progress',
    IN_REVIEW: 'Submitted for review',
    FIXED: 'Bug marked as Fixed',
    REOPENED: 'Bug reopened',
    CLOSED: 'Bug closed',
  };
  const updateMutation = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.patch(`/bugs/${bugId}`, patch),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['bugs'] });
      qc.invalidateQueries({ queryKey: ['bug', bugId] });
      const newStatus = variables.status as string | undefined;
      if (newStatus) toast.success(STATUS_TOAST[newStatus] ?? 'Status updated');
    },
    onError: (e) => toast.error(formatBugError(e)),
  });
  const commentMutation = useMutation({
    mutationFn: (content: string) => api.post(`/bugs/${bugId}/comments`, { content }),
    onSuccess: () => { setComment(''); qc.invalidateQueries({ queryKey: ['bug', bugId] }); },
    onError: (e) => toast.error(formatBugError(e)),
  });
  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/bugs/${bugId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bugs'] }); onClose(); },
    onError: (e) => toast.error(formatBugError(e)),
  });
  const attachmentMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: 'SCREENSHOT' | 'DOCUMENT' }) => {
      const form = new FormData(); form.append('file', file);
      const up = await api.post('/upload/content', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      return api.post(`/bugs/${bugId}/attachments`, { name: up.data.originalName, url: up.data.url, type, size: up.data.size });
    },
    onSuccess: (_r, v) => {
      toast.success(v.type === 'SCREENSHOT' ? 'Screenshot added.' : 'Document added.');
      qc.invalidateQueries({ queryKey: ['bugs'] }); qc.invalidateQueries({ queryKey: ['bug', bugId] });
    },
    onError: (e) => toast.error(formatBugError(e)),
  });
  const removeAttachmentMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/bugs/${bugId}/attachments/${id}`),
    onSuccess: () => {
      toast.success('Item removed.');
      qc.invalidateQueries({ queryKey: ['bugs'] }); qc.invalidateQueries({ queryKey: ['bug', bugId] });
    },
    onError: (e) => toast.error(formatBugError(e)),
  });

  const handleStatusChange = (newStatus: string) => updateMutation.mutate({ status: newStatus });
  const handleCommentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) return;
    commentMutation.mutate(comment.trim());
  };
  const handleAttachmentSelect = async (event: React.ChangeEvent<HTMLInputElement>, type: 'SCREENSHOT' | 'DOCUMENT') => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    await attachmentMutation.mutateAsync({ file, type });
  };

  const bugToEdit: BugToEdit | null = bug ? {
    id: bug.id, title: bug.title, description: bug.description,
    stepsToReproduce: bug.stepsToReproduce, expectedBehavior: bug.expectedBehavior,
    actualBehavior: bug.actualBehavior, environment: bug.environment,
    severity: bug.severity, team: bug.team, assignee: bug.assignee,
  } : null;

  const screenshots = (bug?.attachments ?? []).filter((a) => a.type === 'SCREENSHOT');
  const documents = (bug?.attachments ?? []).filter((a) => a.type !== 'SCREENSHOT');
  const statusTokens = bug ? (S[bug.status] ?? S.OPEN) : S.OPEN;

  return (
    <>
      <Sheet open={!!bugId} onClose={onClose}>
        {(isLoading || !bug) ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="h-12 w-12 rounded-2xl bg-red-50 flex items-center justify-center animate-pulse">
                <BugIcon className="h-6 w-6 text-red-300" />
              </div>
              {isLoading && <p className="text-sm font-medium">Loading bug…</p>}
            </div>
          </div>
        ) : (
          <>
            <SheetHeader>
              <div className={cn('h-1 w-full -mt-5 mb-4 rounded-full bg-gradient-to-r', statusTokens.grad)} />

              <div className="flex items-start gap-3 pr-8">
                <div className={cn('h-10 w-10 rounded-2xl flex items-center justify-center shrink-0 bg-gradient-to-br shadow-sm', statusTokens.grad)}>
                  {(() => { const Icon = statusTokens.icon; return <Icon className="h-5 w-5 text-white" />; })()}
                </div>

                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base sm:text-lg font-bold leading-snug">{bug.title}</SheetTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border', statusTokens.badge)}>
                      <span className={cn('h-1.5 w-1.5 rounded-full', statusTokens.dot)} />
                      {STATUS_LABELS[bug.status] ?? bug.status}
                    </span>
                    <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold border', SEVERITY_STYLE[bug.severity] ?? 'bg-muted text-muted-foreground border-border')}>
                      {bug.severity}
                    </span>
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditOpen(true)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-xl border border-border/60 bg-white text-xs font-semibold text-foreground hover:border-red-300 hover:text-red-700 hover:bg-red-50 transition-all shadow-sm"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                    {canDelete && (
                      confirmDelete ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                            className="h-8 px-3 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {deleteMutation.isPending ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(false)}
                            className="h-8 px-2 rounded-xl border border-border/60 text-xs text-muted-foreground hover:bg-muted transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(true)}
                          className="h-8 w-8 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 hover:border-red-300 transition-all flex items-center justify-center shadow-sm"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            </SheetHeader>

            <SheetContent>
              <div className="space-y-5 pb-8">

                <div className="rounded-2xl border border-border/60 bg-white p-4 shadow-sm">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Update Status</p>
                  <Select value={bug.status} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-full rounded-xl border-border/60 h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {STATUSES.map((s) => {
                        const tok = S[s] ?? S.OPEN;
                        return (
                          <SelectItem key={s} value={s} className="rounded-lg">
                            <div className="flex items-center gap-2">
                              <span className={cn('h-2 w-2 rounded-full', tok.dot)} />
                              {STATUS_LABELS[s]}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                {/* Meta info card */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm divide-y divide-border/40 overflow-hidden">
                  {[
                    {
                      icon: User, label: 'Reported by',
                      content: (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 ring-2 ring-white shadow-sm">
                            <AvatarImage src={bug.reporter.avatarUrl} />
                            <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-red-100 to-rose-100 text-red-700">
                              {getInitials(bug.reporter.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{bug.reporter.name}</span>
                        </div>
                      ),
                    },
                    {
                      icon: UserCog, label: 'Assignee',
                      content: bug.assignee ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6 ring-2 ring-white shadow-sm">
                            <AvatarImage src={bug.assignee.avatarUrl} />
                            <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-indigo-100 to-violet-100 text-indigo-700">
                              {getInitials(bug.assignee.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium">{bug.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">Unassigned</span>
                      ),
                    },
                    {
                      icon: FolderKanban, label: 'Project',
                      content: (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200 font-semibold">
                          {bug.team.name}
                        </span>
                      ),
                    },
                    bug.environment && {
                      icon: Monitor, label: 'Environment',
                      content: <span className="text-sm">{bug.environment}</span>,
                    },
                  ].filter(Boolean).map((row, idx) => {
                    if (!row) return null;
                    const { icon: Icon, label, content } = row as { icon: React.ElementType; label: string; content: React.ReactNode };
                    return (
                      <div key={idx} className="flex items-center gap-3 px-4 py-3">
                        <div className="h-6 w-6 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground font-medium w-24 shrink-0">{label}</span>
                        <div className="flex-1 min-w-0">{content}</div>
                      </div>
                    );
                  })}
                </div>

                {/* Description sections */}
                {(bug.description || bug.stepsToReproduce || bug.expectedBehavior || bug.actualBehavior) && (
                  <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                    {[
                      { label: 'Description', value: bug.description },
                      { label: 'Steps to Reproduce', value: bug.stepsToReproduce },
                      { label: 'Expected Behavior', value: bug.expectedBehavior },
                      { label: 'Actual Behavior', value: bug.actualBehavior },
                    ].filter((s) => s.value).map((section, idx) => (
                      <div key={idx} className="px-4 py-4 border-b border-border/40 last:border-0">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">{section.label}</p>
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{section.value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Attachments */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Evidence</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Screenshots · Documents</p>
                    </div>
                    {canEdit && (
                      <div className="flex flex-wrap gap-1.5">
                        <input ref={screenshotInputRef} type="file" accept="image/*" className="hidden"
                          onChange={(e) => handleAttachmentSelect(e, 'SCREENSHOT')} />
                        <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden"
                          onChange={(e) => handleAttachmentSelect(e, 'DOCUMENT')} />
                        {[
                          { key: 'SCREENSHOT', label: 'Screenshot', icon: ImagePlus, onClick: () => screenshotInputRef.current?.click() },
                          { key: 'DOCUMENT', label: 'Document', icon: FileText, onClick: () => documentInputRef.current?.click() },
                        ].map(({ key, label, icon: Icon, onClick }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={onClick}
                            disabled={attachmentMutation.isPending}
                            className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-xl border text-[10px] font-bold transition-all shadow-sm border-border/60 bg-white text-muted-foreground hover:border-red-300 hover:text-red-700 hover:bg-red-50"
                          >
                            <Icon className="h-3 w-3" />
                            {attachmentMutation.isPending ? 'Uploading…' : label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <AttachmentGroup title="Screenshots" icon={<ImagePlus className="h-3.5 w-3.5" />} iconBg="bg-sky-100 text-sky-600" items={screenshots} emptyLabel="No screenshots yet" canRemove={canEdit} onRemove={(id) => removeAttachmentMutation.mutate(id)} removingId={removeAttachmentMutation.variables} />
                    <AttachmentGroup title="Documents" icon={<FileText className="h-3.5 w-3.5" />} iconBg="bg-violet-100 text-violet-600" items={documents} emptyLabel="No documents yet" canRemove={canEdit} onRemove={(id) => removeAttachmentMutation.mutate(id)} removingId={removeAttachmentMutation.variables} />
                  </div>
                </div>

                {/* Status History */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Activity & History</p>
                  </div>
                  <div className="p-4">
                    {(!bug.statusHistories || bug.statusHistories.length === 0) ? (
                      <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                        <Clock className="h-8 w-8 opacity-20" />
                        <p className="text-sm">No status changes yet.</p>
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="absolute left-3.5 top-4 bottom-4 w-px bg-gradient-to-b from-border/80 to-transparent" />
                        <div className="space-y-5">
                          {bug.statusHistories.map((h) => {
                            const tok = S[h.toStatus] ?? S.OPEN;
                            return (
                              <div key={h.id} className="relative flex gap-4">
                                <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0 z-10 bg-gradient-to-br shadow-sm', tok.grad)}>
                                  {(() => { const Icon = tok.icon; return <Icon className="h-3.5 w-3.5 text-white" />; })()}
                                </div>
                                <div className="flex-1 min-w-0 pb-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {h.fromStatus && (
                                      <>
                                        <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', S[h.fromStatus]?.badge ?? 'bg-muted text-muted-foreground border-border')}>
                                          {STATUS_LABELS[h.fromStatus] || h.fromStatus}
                                        </span>
                                        <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                                      </>
                                    )}
                                    <span className={cn('flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', tok.badge)}>
                                      {STATUS_LABELS[h.toStatus] || h.toStatus}
                                    </span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    <span className="font-semibold text-foreground/70">{h.changedBy.name}</span>
                                    {' · '}{formatRelative(h.changedAt)}
                                  </p>
                                  {h.note && (
                                    <p className="mt-1.5 text-xs text-foreground/70 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">{h.note}</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Comments */}
                <div className="rounded-2xl border border-border/60 bg-white shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-border/40 bg-muted/20 flex items-center justify-between">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Comments</p>
                    <span className="text-[10px] font-bold bg-red-100 text-red-700 rounded-full px-2 py-0.5">{bug.comments.length}</span>
                  </div>
                  <div className="p-4">
                    {bug.comments.length === 0 ? (
                      <div className="flex flex-col items-center py-6 gap-2 text-muted-foreground">
                        <Send className="h-7 w-7 opacity-20" />
                        <p className="text-sm">No comments yet. Start the discussion.</p>
                      </div>
                    ) : (
                      <div className="space-y-4 mb-5">
                        {bug.comments.map((c) => (
                          <div key={c.id} className="flex gap-3">
                            <Avatar className="h-8 w-8 shrink-0 ring-2 ring-white shadow-sm">
                              <AvatarImage src={c.user.avatarUrl} />
                              <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-red-100 to-rose-100 text-red-700">
                                {getInitials(c.user.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="rounded-2xl rounded-tl-sm border border-border/60 bg-muted/20 px-3.5 py-2.5">
                                <div className="flex items-baseline gap-2 mb-1">
                                  <span className="text-xs font-bold text-foreground">{c.user.name}</span>
                                  <span className="text-[10px] text-muted-foreground">{formatRelative(c.createdAt)}</span>
                                </div>
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed text-foreground/80">{c.content}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <form onSubmit={handleCommentSubmit} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Textarea
                          placeholder="Write a comment… (Enter to send, Shift+Enter for newline)"
                          rows={2}
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleCommentSubmit(e as unknown as React.FormEvent); }
                          }}
                          className="text-sm resize-none rounded-2xl border-border/60 focus-visible:ring-red-300 focus-visible:border-red-300"
                        />
                      </div>
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!comment.trim() || commentMutation.isPending}
                        className="h-10 w-10 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 border-0 shadow-sm shadow-red-200 shrink-0"
                      >
                        <Send className="h-4 w-4" />
                      </Button>
                    </form>
                  </div>
                </div>

              </div>
            </SheetContent>
          </>
        )}
      </Sheet>

      {canEdit && bugToEdit && (
        <NewBugDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['bugs'] }); qc.invalidateQueries({ queryKey: ['bug', bugId] }); }}
          bugToEdit={bugToEdit}
        />
      )}
    </>
  );
}

function AttachmentGroup({
  title, icon, iconBg, items, emptyLabel, canRemove, onRemove, removingId,
}: {
  title: string; icon: React.ReactNode; iconBg: string;
  items: BugAttachment[]; emptyLabel: string; canRemove: boolean;
  onRemove: (id: string) => void; removingId?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2.5 bg-muted/20 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className={cn('h-6 w-6 rounded-lg flex items-center justify-center', iconBg)}>{icon}</div>
          <p className="text-xs font-bold">{title}</p>
        </div>
        <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full px-2 py-0.5">{items.length}</span>
      </div>
      <div className="p-2 space-y-1.5">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">{emptyLabel}</p>
        ) : (
          items.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-white px-3 py-2.5 hover:border-red-200 hover:bg-red-50/30 transition-colors group">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate group-hover:text-red-700 transition-colors">{a.name}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{formatRelative(a.createdAt)}</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <a
                  href={resolveAttachmentUrl(a.url)}
                  target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 hover:text-red-800 px-2 py-1 rounded-lg bg-red-50 hover:bg-red-100 border border-red-100 transition-colors"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open
                </a>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(a.id)}
                    disabled={removingId === a.id}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-all disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
