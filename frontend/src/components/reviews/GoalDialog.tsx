import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Target, FileText, Paperclip, X } from 'lucide-react';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

type Department = { id: string; name: string };
type StrategicGoal = {
  id: string; title: string; startDate?: string | null; targetDate: string;
  subGoals?: { cycle: string; targetDate: string }[];
};
type PendingFile = { key: string; file: File };

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysISO(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// The Nth Tactical (15-day) checkpoint under a Strategic goal lands N*15 days after
// the Strategic goal's own start date — so the 3 checkpoints fall at +15/+30/+45.
function suggestNextTacticalDate(parent: StrategicGoal): string {
  const anchor = parent.startDate ? parent.startDate.slice(0, 10) : todayISO();
  const existingTacticalCount = (parent.subGoals || []).filter((g) => g.cycle === 'TACTICAL').length;
  return addDaysISO(anchor, 15 * (existingTacticalCount + 1));
}

interface Props {
  open: boolean;
  onClose: () => void;
  // Fixed when opened from a specific review/goal context; omitted for the standalone
  // "Set Goal" entry point, where the user picks these in the dialog itself.
  departmentId?: string;
  reviewId?: string;
  cycle?: 'STRATEGIC' | 'TACTICAL';
  parentGoalId?: string;
  lockCycle?: boolean;
  defaultTargetDate?: string;
}

export function GoalDialog({ open, onClose, departmentId: fixedDeptId, reviewId, cycle: fixedCycle, parentGoalId: fixedParentGoalId, lockCycle, defaultTargetDate }: Props) {
  const qc = useQueryClient();
  const [departmentId, setDepartmentId] = useState(fixedDeptId || '');
  const [cycle, setCycle] = useState<'STRATEGIC' | 'TACTICAL'>(fixedCycle || 'STRATEGIC');
  const [parentGoalId, setParentGoalId] = useState(fixedParentGoalId || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(todayISO());
  const [targetDate, setTargetDate] = useState(defaultTargetDate || addDaysISO(todayISO(), 45));
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      const initialCycle = fixedCycle || 'STRATEGIC';
      setDepartmentId(fixedDeptId || '');
      setCycle(initialCycle);
      setParentGoalId(fixedParentGoalId || '');
      setTitle('');
      setDescription('');
      setStartDate(todayISO());
      setTargetDate(defaultTargetDate || (initialCycle === 'STRATEGIC' ? addDaysISO(todayISO(), 45) : ''));
      setPendingFiles([]);
    }
  }, [open, fixedDeptId, fixedCycle, fixedParentGoalId, defaultTargetDate]);

  // Strategic: End Date auto-tracks Start Date + 45 days until the user picks a cycle/dept.
  const handleStartDateChange = (v: string) => {
    setStartDate(v);
    if (cycle === 'STRATEGIC') setTargetDate(addDaysISO(v, 45));
  };
  const handleCycleChange = (v: 'STRATEGIC' | 'TACTICAL') => {
    setCycle(v);
    setParentGoalId('');
    setTargetDate(v === 'STRATEGIC' ? addDaysISO(startDate, 45) : '');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    setPendingFiles((prev) => [...prev, ...files.map((file) => ({ key: `${Date.now()}-${file.name}`, file }))]);
  };
  const removePendingFile = (key: string) => setPendingFiles((prev) => prev.filter((f) => f.key !== key));

  const uploadDocuments = async (goalId: string) => {
    for (const pending of pendingFiles) {
      try {
        const form = new FormData();
        form.append('file', pending.file);
        const up = await api.post('/upload/content', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        await api.post(`/goals/${goalId}/attachments`, { name: up.data.originalName, url: up.data.url, size: up.data.size });
      } catch {
        toast.error(`Failed to upload "${pending.file.name}"`, 'You can add it later from the goal.');
      }
    }
  };

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: open && !fixedDeptId,
  });

  const { data: strategicGoals = [] } = useQuery<StrategicGoal[]>({
    queryKey: ['goals', departmentId, 'STRATEGIC'],
    queryFn: () => api.get('/goals', { params: { departmentId, cycle: 'STRATEGIC', parentGoalId: 'null' } }).then((r) => r.data),
    enabled: open && !fixedParentGoalId && cycle === 'TACTICAL' && !!departmentId,
  });

  // Picking a parent Strategic goal (standalone flow) auto-fills this checkpoint's
  // date — the Nth Tactical goal under it lands at +15/+30/+45 days from its start.
  const handleParentGoalChange = (v: string) => {
    setParentGoalId(v);
    const parent = strategicGoals.find((g) => g.id === v);
    if (parent) setTargetDate(suggestNextTacticalDate(parent));
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/goals', {
        departmentId, reviewId, cycle, parentGoalId: cycle === 'TACTICAL' ? parentGoalId : undefined,
        title, description: description || undefined,
        startDate: cycle === 'STRATEGIC' ? startDate : undefined,
        targetDate,
      });
      if (pendingFiles.length > 0) {
        setUploading(true);
        await uploadDocuments(res.data.id);
        setUploading(false);
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews'] });
      qc.invalidateQueries({ queryKey: ['review'] });
      qc.invalidateQueries({ queryKey: ['goals'] });
      toast.success(`${cycle === 'STRATEGIC' ? '45-day' : '15-day'} goal set`);
      onClose();
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to set goal';
      toast.error(msg);
    },
  });

  const canSubmit = !!departmentId && !!title.trim() && !!targetDate
    && (cycle === 'TACTICAL' || !!startDate)
    && (cycle === 'STRATEGIC' || !!parentGoalId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-indigo-50 to-violet-50/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
              <Target className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Set a department goal</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {cycle === 'TACTICAL' ? 'This 15-day checkpoint will sit under a 45-day Strategic goal.' : 'The top-level 45-day goal for the department.'}
              </p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!fixedDeptId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Department</Label>
              <Select value={departmentId} onValueChange={(v) => { setDepartmentId(v); setParentGoalId(''); }}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose a department" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!lockCycle && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cycle</Label>
              <div className="flex rounded-xl border border-border/60 overflow-hidden">
                {([['STRATEGIC', '45-day Strategic'], ['TACTICAL', '15-day Tactical']] as const).map(([v, label]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => handleCycleChange(v)}
                    className={cn(
                      'flex-1 px-3 py-2 text-xs font-semibold transition-all',
                      cycle === v ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-muted/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {cycle === 'TACTICAL' && !fixedParentGoalId && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Parent Strategic (45-day) goal</Label>
              <Select value={parentGoalId} onValueChange={handleParentGoalChange} disabled={!departmentId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder={departmentId ? 'Choose a Strategic goal' : 'Choose a department first'} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {strategicGoals.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No Strategic goal set for this department yet — set one first.</div>
                  ) : (
                    strategicGoals.map((g) => <SelectItem key={g.id} value={g.id}>{g.title}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Goal title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ship v2 API" className="rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="rounded-xl resize-none" />
          </div>

          {cycle === 'STRATEGIC' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  End date <span className="text-muted-foreground/60 font-normal normal-case">(auto, 45 days)</span>
                </Label>
                <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-xl" />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Checkpoint date <span className="text-muted-foreground/60 font-normal normal-case">(auto-suggested, 15-day interval)</span>
              </Label>
              <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="rounded-xl" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Supporting documents <span className="text-muted-foreground/60 font-normal normal-case">(optional, multiple allowed)</span>
            </Label>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border/60 bg-white text-xs font-semibold text-muted-foreground hover:border-indigo-300 hover:text-indigo-700 hover:bg-indigo-50 transition-all"
            >
              <Paperclip className="h-3.5 w-3.5" /> Add Documents
            </button>
            {pendingFiles.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {pendingFiles.map((pf) => (
                  <div key={pf.key} className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                      <span className="text-xs font-medium truncate">{pf.file.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePendingFile(pf.key)}
                      className="h-6 w-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-all shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSubmit || createMutation.isPending || uploading}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700"
          >
            {uploading ? 'Uploading documents…' : 'Set Goal'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
