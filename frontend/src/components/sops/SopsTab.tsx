import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, FileText, ChevronDown, ChevronUp, Check, X, Sparkles, Loader2 } from 'lucide-react';
import { SopEditor } from './SopEditor';
import api from '@/api/client';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface Sop {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  updatedBy?: { id: string; name: string } | null;
}

interface Props {
  departmentId: string;
}

const EDITOR_ROLES = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'];

export function SopsTab({ departmentId }: Props) {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const canEdit = EDITOR_ROLES.includes(user?.role || '');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');

  const { data: sops = [], isLoading } = useQuery<Sop[]>({
    queryKey: ['sops', departmentId],
    queryFn: () => api.get(`/sops/${departmentId}`).then((r) => r.data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['sops', departmentId] });

  const createMutation = useMutation({
    mutationFn: (data: { title: string; content: string }) =>
      api.post(`/sops/${departmentId}`, data).then((r) => r.data),
    onSuccess: () => { invalidate(); setCreating(false); setNewTitle(''); setNewContent(''); toast.success('SOP created'); },
    onError: () => toast.error('Failed to create SOP'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, title, content }: { id: string; title: string; content: string }) =>
      api.patch(`/sops/${departmentId}/${id}`, { title, content }).then((r) => r.data),
    onSuccess: () => { invalidate(); setEditingId(null); toast.success('SOP updated'); },
    onError: () => toast.error('Failed to update SOP'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/sops/${departmentId}/${id}`),
    onSuccess: () => { invalidate(); toast.success('SOP deleted'); },
    onError: () => toast.error('Failed to delete SOP'),
  });

  const beautifyMutation = useMutation({
    mutationFn: (content: string) =>
      api.post(`/sops/${departmentId}/beautify`, { content }).then((r) => r.data as { content: string }),
  });

  const beautify = (content: string, apply: (html: string) => void) => {
    if (!content.replace(/<[^>]+>/g, '').trim()) { toast.error('Add some content first'); return; }
    beautifyMutation.mutate(content, {
      onSuccess: (data) => { apply(data.content); toast.success('Formatting improved — wording unchanged'); },
      onError: (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        toast.error(msg || 'Failed to beautify content');
      },
    });
  };

  const startEdit = (sop: Sop) => {
    setEditingId(sop.id);
    setEditTitle(sop.title);
    setEditContent(sop.content);
    setExpandedId(sop.id);
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-muted/40 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sops.length} SOP{sops.length !== 1 ? 's' : ''} · standard operating procedures for this department
        </p>
        {canEdit && !creating && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold hover:from-indigo-600 hover:to-violet-700 transition-all shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add SOP
          </button>
        )}
      </div>

      {/* New SOP form */}
      {creating && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 space-y-3">
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="SOP Title (e.g. Month-End Close Checklist)"
            className="w-full h-9 px-3 rounded-lg border border-border/60 text-sm font-medium bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <SopEditor content={newContent} onChange={setNewContent} />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => beautify(newContent, setNewContent)}
              disabled={beautifyMutation.isPending}
              title="Improve formatting and colors with AI — wording is never changed"
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-indigo-200 bg-white text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-60 mr-auto"
            >
              {beautifyMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Sparkles className="h-3.5 w-3.5" />}
              Beautify with AI
            </button>
            <button
              onClick={() => { setCreating(false); setNewTitle(''); setNewContent(''); }}
              className="h-8 px-3 rounded-lg border border-border/60 text-xs font-medium text-muted-foreground hover:bg-muted/40"
            >
              Cancel
            </button>
            <button
              onClick={() => { if (newTitle.trim()) createMutation.mutate({ title: newTitle.trim(), content: newContent }); }}
              disabled={!newTitle.trim() || createMutation.isPending}
              className="h-8 px-4 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold disabled:opacity-60"
            >
              {createMutation.isPending ? 'Saving…' : 'Save SOP'}
            </button>
          </div>
        </div>
      )}

      {/* SOP list */}
      {sops.length === 0 && !creating ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="h-12 w-12 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No SOPs yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {canEdit ? 'Click "Add SOP" to create the first one' : 'No standard operating procedures have been added yet'}
          </p>
        </div>
      ) : (
        sops.map((sop) => (
          <div
            key={sop.id}
            className={cn(
              'rounded-xl border border-border/60 bg-white overflow-hidden transition-all',
              expandedId === sop.id && 'border-indigo-200 shadow-sm',
            )}
          >
            {/* SOP header row */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="h-8 w-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-indigo-500" />
              </div>

              {editingId === sop.id ? (
                <input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="flex-1 h-8 px-2 rounded-lg border border-border/60 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              ) : (
                <button
                  onClick={() => setExpandedId(expandedId === sop.id ? null : sop.id)}
                  className="flex-1 text-left"
                >
                  <p className="text-sm font-semibold text-foreground">{sop.title}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                    Last updated {new Date(sop.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {sop.updatedBy ? ` by ${sop.updatedBy.name}` : ` by ${sop.createdBy.name}`}
                  </p>
                </button>
              )}

              <div className="flex items-center gap-1 shrink-0">
                {editingId === sop.id ? (
                  <>
                    <button
                      onClick={() => updateMutation.mutate({ id: sop.id, title: editTitle, content: editContent })}
                      disabled={updateMutation.isPending}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted/40 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    {canEdit && (
                      <>
                        <button
                          onClick={() => startEdit(sop)}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete "${sop.title}"?`)) deleteMutation.mutate(sop.id); }}
                          className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpandedId(expandedId === sop.id ? null : sop.id)}
                      className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted/40 transition-colors"
                    >
                      {expandedId === sop.id
                        ? <ChevronUp className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expanded content */}
            {expandedId === sop.id && (
              <div className="px-4 pb-4 border-t border-border/40 pt-3">
                {editingId === sop.id ? (
                  <div className="space-y-2">
                    <SopEditor content={editContent} onChange={setEditContent} editable />
                    <button
                      onClick={() => beautify(editContent, setEditContent)}
                      disabled={beautifyMutation.isPending}
                      title="Improve formatting and colors with AI — wording is never changed"
                      className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-indigo-200 bg-white text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-60"
                    >
                      {beautifyMutation.isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Sparkles className="h-3.5 w-3.5" />}
                      Beautify with AI
                    </button>
                  </div>
                ) : (
                  <SopEditor content={sop.content || '<p>No content yet.</p>'} editable={false} />
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}
