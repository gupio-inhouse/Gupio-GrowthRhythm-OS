import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Users, CheckSquare, Target, ArrowRight, Clock, Settings, Plus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { getInitials } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import api from '@/api/client';

type Department = {
  id: string; name: string; slug: string;
  standupTime?: string; standupDuration?: number;
  head?: { id: string; name: string; email: string; avatarUrl?: string };
  _count: { users: number; kras: number; tasks: number };
};

export default function Departments() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [scheduleTarget, setScheduleTarget] = useState<Department | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState('');
  const { data: departments = [], isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => api.get('/departments').then((r) => r.data),
  });

  const canConfigure = ['OWNER', 'COMPANY_ADMIN', 'DEPARTMENT_HEAD'].includes(user?.role || '');
  const canCreate = ['OWNER', 'COMPANY_ADMIN'].includes(user?.role || '');
  const qc = useQueryClient();

  useEffect(() => {
    if (searchParams.get('create') === 'department') {
      setCreateOpen(true);
    }
  }, [searchParams]);

  const clearCreateParam = () => {
    if (!searchParams.get('create')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('create');
    setSearchParams(next, { replace: true });
  };

  const createDepartment = useMutation({
    mutationFn: async () => {
      const finalName = name.trim();
      const finalSlug = slug.trim();

      if (finalName.length < 2) throw new Error('Department name must be at least 2 characters');
      if (finalSlug.length < 2) throw new Error('Department slug must be at least 2 characters');

      return api.post('/departments', {
        name: finalName,
        slug: finalSlug,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['departments'] });
      qc.invalidateQueries({ queryKey: ['cockpit'] });
      setCreateOpen(false);
      setName('');
      setSlug('');
      setError('');
      clearCreateParam();
    },
    onError: (err: unknown) => {
      setError(err instanceof Error ? err.message : 'Unable to create department');
    },
  });

  const handleNameChange = (value: string) => {
    setName(value);
    if (!slug || slug === toSlug(name)) {
      setSlug(toSlug(value));
    }
  };

  const handleCreateOpen = (open: boolean) => {
    setCreateOpen(open);
    if (!open) {
      setError('');
      clearCreateParam();
    }
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-purple-500" />
            Departments
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">{departments.length} departments</p>
        </div>
        {canCreate && (
          <Button className="gap-2" onClick={() => handleCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Department
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <Card key={dept.id} className="group hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                    <Building2 className="h-5 w-5 text-purple-600" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canConfigure && (
                      <button
                        onClick={() => setScheduleTarget(dept)}
                        className="text-muted-foreground hover:text-primary p-1 rounded"
                        title="Configure standup schedule"
                      >
                        <Settings className="h-4 w-4" />
                      </button>
                    )}
                    <Link
                      to={`/dashboard/${dept.slug}`}
                      className="text-muted-foreground hover:text-primary"
                    >
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>

                <h3 className="font-semibold text-lg">{dept.name}</h3>

                {dept.head && (
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={dept.head.avatarUrl} />
                      <AvatarFallback className="text-xs bg-blue-100 text-blue-700">{getInitials(dept.head.name)}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground">{dept.head.name}</span>
                  </div>
                )}

                {dept.standupTime && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>Standup at {dept.standupTime} · {dept.standupDuration ?? 15} min</span>
                  </div>
                )}

                <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Users className="h-4 w-4" />
                    <span>{dept._count.users}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Target className="h-4 w-4" />
                    <span>{dept._count.kras} KRAs</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CheckSquare className="h-4 w-4" />
                    <span>{dept._count.tasks} tasks</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {scheduleTarget && (
        <StandupScheduleDialog
          dept={scheduleTarget}
          onClose={() => setScheduleTarget(null)}
        />
      )}

      <Dialog open={createOpen} onOpenChange={handleCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-purple-500" />
              Create Department
            </DialogTitle>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              createDepartment.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="department-name">Department name</Label>
              <Input
                id="department-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Customer Success"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="department-slug">Department slug</Label>
              <Input
                id="department-slug"
                value={slug}
                onChange={(e) => setSlug(toSlug(e.target.value))}
                placeholder="customer-success"
              />
              <p className="text-xs text-muted-foreground">Used in dashboard URLs. Lowercase letters, numbers, and dashes only.</p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createDepartment.isPending}>
                {createDepartment.isPending ? 'Creating...' : 'Create Department'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function StandupScheduleDialog({ dept, onClose }: { dept: Department; onClose: () => void }) {
  const qc = useQueryClient();
  const [time, setTime] = useState(dept.standupTime || '09:00');
  const [duration, setDuration] = useState(String(dept.standupDuration ?? 15));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/departments/${dept.id}`, {
        standupTime: time,
        standupDuration: parseInt(duration, 10) || 15,
      });
      qc.invalidateQueries({ queryKey: ['departments'] });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            Standup Schedule — {dept.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Daily standup time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              min={5}
              max={60}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
