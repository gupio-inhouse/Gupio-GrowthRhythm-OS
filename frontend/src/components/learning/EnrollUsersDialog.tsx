import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, UserCheck, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from '@/hooks/use-toast';
import { learningApi } from '@/api/learning';
import api from '@/api/client';
import { getInitials } from '@/lib/utils';

interface Props {
  moduleId: string;
  departmentId?: string | null;
  open: boolean;
  onClose: () => void;
}

interface OrgUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  departmentId?: string | null;
}

export default function EnrollUsersDialog({ moduleId, departmentId, open, onClose }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueDate, setDueDate] = useState('');

  const { data: users = [], isLoading } = useQuery<OrgUser[]>({
    queryKey: ['users', 'all'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: open,
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['learning:enrollments', moduleId],
    queryFn: () => learningApi.getEnrollments(moduleId),
    enabled: open,
  });

  const enrolledIds = new Set(enrollments.map((e) => e.userId));

  const filtered = users.filter((u) => {
    const matchesDept = !departmentId || u.departmentId === departmentId;
    const matchesSearch =
      !search ||
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    return matchesDept && matchesSearch;
  });

  const enrollMutation = useMutation({
    mutationFn: () =>
      learningApi.enrollUsers(moduleId, Array.from(selected), dueDate || undefined),
    onSuccess: (data: { enrolled: number; skipped: number }) => {
      qc.invalidateQueries({ queryKey: ['learning:enrollments', moduleId] });
      toast.success(`${data.enrolled} user(s) enrolled`);
      setSelected(new Set());
      onClose();
    },
    onError: () => toast.error('Enrollment failed'),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    const eligible = filtered.filter((u) => !enrolledIds.has(u.id)).map((u) => u.id);
    setSelected(new Set(eligible));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Enroll Users</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{filtered.length} users</span>
            <button
              className="text-primary hover:underline text-sm"
              onClick={selectAll}
            >
              Select all eligible
            </button>
          </div>

          <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-24">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">No users found</div>
            ) : (
              filtered.map((u) => {
                const alreadyEnrolled = enrolledIds.has(u.id);
                const isSelected = selected.has(u.id);
                return (
                  <div
                    key={u.id}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors ${alreadyEnrolled ? 'opacity-50' : ''}`}
                    onClick={() => !alreadyEnrolled && toggle(u.id)}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected || alreadyEnrolled}
                      onChange={() => !alreadyEnrolled && toggle(u.id)}
                      disabled={alreadyEnrolled}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={u.avatarUrl ?? undefined} />
                      <AvatarFallback className="text-xs">{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{u.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {alreadyEnrolled && (
                      <UserCheck className="h-4 w-4 text-green-600 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Due Date (optional)</label>
            <Input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selected.size === 0 || enrollMutation.isPending}
            onClick={() => enrollMutation.mutate()}
          >
            {enrollMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Enroll {selected.size > 0 ? `${selected.size} Users` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
