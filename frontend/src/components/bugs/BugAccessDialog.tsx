import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { KeyRound } from 'lucide-react';
import { getInitials } from '@/lib/utils';
import api from '@/api/client';
import { toast } from '@/hooks/use-toast';

type Member = {
  id: string; name: string; email: string; role: string; avatarUrl?: string;
  bugTrackerFullAccess: boolean;
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BugAccessDialog({ open, onClose }: Props) {
  const qc = useQueryClient();

  const { data: members = [], isLoading } = useQuery<Member[]>({
    queryKey: ['bug-access-members'],
    queryFn: () => api.get('/bugs/access/members').then((r) => r.data),
    enabled: open,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ userId, fullAccess }: { userId: string; fullAccess: boolean }) =>
      api.patch(`/bugs/access/${userId}`, { fullAccess }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['bug-access-members'] });
      toast.success(v.fullAccess ? 'Full Bug Tracker access granted' : 'Full Bug Tracker access removed');
    },
    onError: () => toast.error('Failed to update access'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden rounded-2xl">
        <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-red-50 to-rose-50/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-sm">
              <KeyRound className="h-4 w-4 text-white" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">Manage Bug Access</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Give a specific Engineering member full visibility into all bugs — like a department head, without changing their role.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-1.5">
          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No Engineering members found.</p>
          ) : (
            members.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={m.avatarUrl} />
                  <AvatarFallback className="text-[10px] font-bold bg-gradient-to-br from-red-100 to-rose-100 text-red-700">
                    {getInitials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{m.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate capitalize">{m.role.toLowerCase().replace(/_/g, ' ')}</p>
                </div>
                <Switch
                  checked={m.bugTrackerFullAccess}
                  disabled={toggleMutation.isPending}
                  onCheckedChange={(checked) => toggleMutation.mutate({ userId: m.id, fullAccess: checked })}
                />
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
