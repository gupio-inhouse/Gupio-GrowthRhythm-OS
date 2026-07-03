import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Upload, BookOpen, Users, Eye, EyeOff, Edit2, Trash2,
  GraduationCap, BarChart2, ChevronRight, AlertCircle, CheckCircle2,
  Loader2, X, FileText, Layers,
} from 'lucide-react';
import { learningApi, LearningModule } from '@/api/learning';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import LearningPage from './LearningPage';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const MODULE_TYPES = [
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'COMPLIANCE', label: 'Compliance' },
  { value: 'SKILLS', label: 'Skills' },
  { value: 'PRODUCT', label: 'Product' },
  { value: 'PROCESS', label: 'Process' },
  { value: 'CERTIFICATION', label: 'Certification' },
  { value: 'OTHER', label: 'Other' },
];

const TYPE_COLORS: Record<string, string> = {
  ONBOARDING: 'bg-blue-100 text-blue-800',
  COMPLIANCE: 'bg-red-100 text-red-800',
  SKILLS: 'bg-purple-100 text-purple-800',
  PRODUCT: 'bg-orange-100 text-orange-800',
  PROCESS: 'bg-yellow-100 text-yellow-800',
  CERTIFICATION: 'bg-green-100 text-green-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

interface ModuleFormData {
  title: string;
  description: string;
  type: string;
  isMandatory: boolean;
  passScore: number;
  durationDays: string;
  departmentId: string;
}

const EMPTY_FORM: ModuleFormData = {
  title: '',
  description: '',
  type: 'OTHER',
  isMandatory: false,
  passScore: 70,
  durationDays: '',
  departmentId: '',
};

export default function LearningAdmin() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [editModule, setEditModule] = useState<LearningModule | null>(null);
  const [form, setForm] = useState<ModuleFormData>(EMPTY_FORM);
  const [pdfImporting, setPdfImporting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ['learning:admin'],
    queryFn: learningApi.getAdminModules,
  });

  const { data: departments = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
    enabled: user?.role === 'OWNER' || user?.role === 'COMPANY_ADMIN',
  });

  const { data: analytics } = useQuery({
    queryKey: ['learning:analytics'],
    queryFn: learningApi.getAnalytics,
  });

  const createMutation = useMutation({
    mutationFn: learningApi.createModule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      qc.invalidateQueries({ queryKey: ['learning:analytics'] });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      toast.success('Module created');
    },
    onError: () => toast.error('Failed to create module'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<LearningModule> }) =>
      learningApi.updateModule(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      setEditModule(null);
      toast.success('Module updated');
    },
    onError: () => toast.error('Failed to update module'),
  });

  const publishMutation = useMutation({
    mutationFn: learningApi.publishModule,
    onSuccess: (mod) => {
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      toast.success(mod.isPublished ? 'Module published' : 'Module unpublished');
    },
    onError: (e: Error) => toast.error(e.message || 'Publish failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: learningApi.deleteModule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      setDeleteId(null);
      toast.success('Module deleted');
    },
    onError: () => toast.error('Failed to delete'),
  });

  function openCreate() {
    setForm({ ...EMPTY_FORM, departmentId: user?.departmentId ?? '' });
    setShowCreate(true);
  }

  function openEdit(mod: LearningModule) {
    setForm({
      title: mod.title,
      description: mod.description ?? '',
      type: mod.type,
      isMandatory: mod.isMandatory,
      passScore: mod.passScore,
      durationDays: mod.durationDays?.toString() ?? '',
      departmentId: mod.departmentId ?? '',
    });
    setEditModule(mod);
  }

  function submitForm() {
    const payload: Partial<LearningModule> = {
      title: form.title,
      description: form.description || undefined,
      type: form.type as LearningModule['type'],
      isMandatory: form.isMandatory,
      passScore: form.passScore,
      durationDays: form.durationDays ? parseInt(form.durationDays) : null,
      departmentId: form.departmentId || null,
    };
    if (editModule) {
      updateMutation.mutate({ id: editModule.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  async function handlePdfImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPdfImporting(true);
    try {
      const result = await learningApi.importPdf(file, user?.departmentId);
      qc.invalidateQueries({ queryKey: ['learning:admin'] });
      toast.success(`"${result.title}" imported successfully`);
      navigate(`/learning/admin/modules/${result.moduleId}`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'PDF import failed');
    } finally {
      setPdfImporting(false);
    }
  }

  const isAdmin = user?.role === 'OWNER' || user?.role === 'COMPANY_ADMIN';

  return (
    <div className="p-8 max-w-full mx-auto space-y-8">
      <Tabs defaultValue="learner" className="w-full space-y-8">
        {/* Header with Tabs */}
        <div className="flex items-center justify-between border-b border-muted pb-5 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent flex items-center gap-3">
              <GraduationCap className="h-8 w-8 text-primary" />
              Learning Hub
            </h1>
            <p className="text-muted-foreground text-sm mt-1 font-medium">
              Access your personal roadmap or orchestrate team training courses
            </p>
          </div>
          <TabsList className="bg-muted/80 p-1 rounded-xl border border-muted/60 shadow-inner">
            <TabsTrigger value="learner" className="gap-2 px-4 py-2 font-semibold transition-all rounded-lg data-[state=active]:shadow-md">
              <BookOpen className="h-4 w-4" />
              My Learning
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-2 px-4 py-2 font-semibold transition-all rounded-lg data-[state=active]:shadow-md">
              <Building2 className="h-4 w-4" />
              Admin Console
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Learner View */}
        <TabsContent value="learner" className="mt-0">
          <LearningPage isEmbedded={true} />
        </TabsContent>

        {/* Tab 2: Admin View */}
        <TabsContent value="admin" className="mt-0 space-y-8">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-muted/40 pb-5">
            <div>
              <h2 className="text-2xl font-bold text-foreground/90">Training Directory</h2>
              <p className="text-muted-foreground text-sm mt-0.5 font-medium">
                Create new learning streams and track organizational enrollments
              </p>
            </div>
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handlePdfImport} />
              <Button variant="outline" className="font-semibold shadow-sm border-muted/80" onClick={() => fileRef.current?.click()} disabled={pdfImporting}>
                {pdfImporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                Import PDF
              </Button>
              <Button className="font-bold shadow-md hover:shadow-lg transition-all" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                New Module
              </Button>
            </div>
          </div>

          {/* Analytics strip */}
          {analytics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {[
                { label: 'Total Modules', value: analytics.moduleCount, icon: BookOpen, color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
                { label: 'Active Enrollments', value: analytics.enrollmentCount, icon: Users, color: 'text-purple-500 bg-purple-500/10 border-purple-500/20' },
                { label: 'Completions', value: analytics.completionCount, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
                { label: 'Completion Rate', value: `${analytics.completionRate}%`, icon: BarChart2, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
              ].map((stat) => (
                <div key={stat.label} className="relative overflow-hidden bg-card/65 backdrop-blur-md border border-muted/50 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/20 hover:-translate-y-0.5">
                  <div className={cn('rounded-xl p-3 border shrink-0 transition-transform duration-300 hover:scale-105', stat.color)}>
                    <stat.icon className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold tracking-tight leading-tight">{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-0.5">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Modules list */}
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : modules.length === 0 ? (
            <div className="border-2 border-dashed border-muted rounded-3xl p-16 text-center bg-card/25 backdrop-blur-sm">
              <GraduationCap className="h-16 w-16 mx-auto mb-5 text-muted-foreground/40 animate-pulse" />
              <h3 className="text-xl font-bold text-foreground/95">No training modules</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                Establish your first module or drag and drop a PDF syllabus to get started.
              </p>
              <div className="flex items-center justify-center gap-3 mt-6">
                <Button className="font-bold shadow-md" onClick={openCreate}><Plus className="h-4 w-4 mr-2" />New Module</Button>
                <Button variant="outline" className="font-semibold shadow-sm" onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" />Import PDF
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-5">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className="group bg-card/60 backdrop-blur-sm border border-muted/60 rounded-2xl p-6 flex items-center gap-5 hover:shadow-xl hover:shadow-primary/5 hover:border-primary/30 transition-all duration-300"
                >
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-lg text-foreground/90 group-hover:text-primary transition-colors truncate leading-snug">{mod.title}</h3>
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${TYPE_COLORS[mod.type] || 'bg-gray-100 text-gray-800'}`}>
                        {mod.type}
                      </span>
                      {mod.isMandatory && (
                        <Badge variant="secondary" className="bg-red-500/10 text-red-500 border border-red-500/20 shadow-sm shrink-0">Mandatory</Badge>
                      )}
                      {mod.isPublished ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Published
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-bold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                          <AlertCircle className="h-3 w-3" /> Draft
                        </span>
                      )}
                    </div>
                    {mod.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1 leading-relaxed">{mod.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground pt-1 border-t border-muted/30 max-w-fit">
                      {mod.department && <span className="flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-indigo-500/70" />{mod.department.name}</span>}
                      <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-indigo-500/70" />{mod._count?.lessons ?? 0} lessons</span>
                      <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-indigo-500/70" />{mod._count?.enrollments ?? 0} enrolled</span>
                      {mod.durationDays && <span>{mod.durationDays} days</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="hover:bg-muted text-muted-foreground hover:text-foreground h-9 w-9 p-0 rounded-lg transition-colors"
                      onClick={() => publishMutation.mutate(mod.id)}
                      disabled={publishMutation.isPending}
                      title={mod.isPublished ? 'Unpublish' : 'Publish'}
                    >
                      {mod.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="hover:bg-muted text-muted-foreground hover:text-foreground h-9 w-9 p-0 rounded-lg transition-colors" onClick={() => openEdit(mod)} title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive/80 hover:text-destructive hover:bg-red-500/10 h-9 w-9 p-0 rounded-lg transition-colors"
                      onClick={() => setDeleteId(mod.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="font-bold border-muted/80 shadow-sm transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary"
                      onClick={() => navigate(`/learning/admin/modules/${mod.id}`)}
                    >
                      Manage
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create / Edit Dialog */}
      <Dialog open={showCreate || !!editModule} onOpenChange={(o) => { if (!o) { setShowCreate(false); setEditModule(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editModule ? 'Edit Module' : 'New Learning Module'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium mb-1 block">Title *</label>
              <Input
                placeholder="e.g. Sales Onboarding Track"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Description</label>
              <Textarea
                placeholder="What will learners achieve?"
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULE_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Duration (days)</label>
                <Input
                  type="number"
                  placeholder="e.g. 30"
                  value={form.durationDays}
                  onChange={(e) => setForm((f) => ({ ...f, durationDays: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Pass Score (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={form.passScore}
                  onChange={(e) => setForm((f) => ({ ...f, passScore: parseInt(e.target.value) || 70 }))}
                />
              </div>
              {isAdmin && (
                <div>
                  <label className="text-sm font-medium mb-1 block">Department</label>
                  <Select
                    value={form.departmentId || '__org'}
                    onValueChange={(v) => setForm((f) => ({ ...f, departmentId: v === '__org' ? '' : v }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Org-wide" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__org">Org-wide</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input
                id="mandatory"
                type="checkbox"
                checked={form.isMandatory}
                onChange={(e) => setForm((f) => ({ ...f, isMandatory: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <label htmlFor="mandatory" className="text-sm font-medium cursor-pointer">
                Mandatory for enrolled users
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); setEditModule(null); }}>
              Cancel
            </Button>
            <Button
              onClick={submitForm}
              disabled={!form.title || createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editModule ? 'Save Changes' : 'Create Module'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={!!deleteId} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Module?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will deactivate the module and remove it from learner views. Existing progress is preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
