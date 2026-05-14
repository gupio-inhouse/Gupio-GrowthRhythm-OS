import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Building2, Users, CheckSquare, Activity, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import api from '@/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type Plan = 'FREE' | 'STARTER' | 'GROWTH' | 'ENTERPRISE';

interface OrgListItem {
  id: string;
  name: string;
  plan: Plan;
  isActive: boolean;
  industry?: string;
  size?: string;
  createdAt: string;
  _count: {
    users: number;
    departments: number;
  };
}

interface OrgOwner {
  id: string;
  name: string;
  email: string;
}

interface OrgDetail extends OrgListItem {
  aiCreditsUsed: number;
  aiCreditsTotal: number;
  owners: OrgOwner[];
}

interface SuperAdminStats {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  totalTasks: number;
  totalStandups: number;
  avgUsersPerOrg: number;
}

interface PatchOrgPayload {
  plan?: Plan;
  isActive?: boolean;
  aiCreditsTotal?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_STYLES: Record<Plan, string> = {
  FREE: 'bg-gray-100 text-gray-700',
  STARTER: 'bg-blue-100 text-blue-700',
  GROWTH: 'bg-purple-100 text-purple-700',
  ENTERPRISE: 'bg-amber-100 text-amber-700',
};

function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        PLAN_STYLES[plan] ?? 'bg-gray-100 text-gray-700'
      )}
    >
      {plan}
    </span>
  );
}

function ActiveDot({ active }: { active: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          active ? 'bg-green-500' : 'bg-red-400'
        )}
      />
      <span className={cn('text-xs', active ? 'text-green-700' : 'text-red-600')}>
        {active ? 'Active' : 'Inactive'}
      </span>
    </span>
  );
}

// ─── Org Detail Dialog ────────────────────────────────────────────────────────

interface OrgDetailDialogProps {
  orgId: string | null;
  onClose: () => void;
}

function OrgDetailDialog({ orgId, onClose }: OrgDetailDialogProps) {
  const qc = useQueryClient();
  const [editPlan, setEditPlan] = useState<Plan | ''>('');
  const [editCredits, setEditCredits] = useState<string>('');
  const [editActive, setEditActive] = useState<boolean | null>(null);

  const { data: org, isLoading } = useQuery<OrgDetail>({
    queryKey: ['superadmin-org', orgId],
    queryFn: () => api.get(`/superadmin/orgs/${orgId}`).then((r) => r.data),
    enabled: !!orgId,
    staleTime: 10 * 1000,
  });

  // Sync local state when org loads
  const currentPlan: Plan = (editPlan || org?.plan || 'FREE') as Plan;
  const currentActive = editActive !== null ? editActive : (org?.isActive ?? true);
  const currentCredits = editCredits !== '' ? editCredits : String(org?.aiCreditsTotal ?? '');

  const mutation = useMutation({
    mutationFn: (payload: PatchOrgPayload) =>
      api.patch(`/superadmin/orgs/${orgId}`, payload).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-orgs'] });
      qc.invalidateQueries({ queryKey: ['superadmin-org', orgId] });
      onClose();
    },
  });

  function handleSave() {
    const payload: PatchOrgPayload = {};
    if (editPlan) payload.plan = editPlan as Plan;
    if (editCredits !== '' && !isNaN(Number(editCredits))) {
      payload.aiCreditsTotal = Number(editCredits);
    }
    if (editActive !== null) payload.isActive = editActive;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    mutation.mutate(payload);
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      setEditPlan('');
      setEditCredits('');
      setEditActive(null);
      onClose();
    }
  }

  return (
    <Dialog open={!!orgId} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-muted-foreground" />
            {isLoading ? 'Loading…' : org?.name ?? 'Organisation'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-8 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!isLoading && org && (
          <div className="space-y-5">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Plan</p>
                <PlanBadge plan={org.plan} />
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <ActiveDot active={org.isActive} />
              </div>
              {org.industry && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Industry</p>
                  <p className="font-medium">{org.industry}</p>
                </div>
              )}
              {org.size && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Size</p>
                  <p className="font-medium">{org.size}</p>
                </div>
              )}
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">AI Credits Used</p>
                <p className="font-medium">
                  {org.aiCreditsUsed ?? 0} / {org.aiCreditsTotal ?? 0}
                </p>
              </div>
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Members</p>
                <p className="font-medium">{org._count.users} users · {org._count.departments} depts</p>
              </div>
            </div>

            {/* Owners */}
            {org.owners && org.owners.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Owners</p>
                <div className="space-y-2">
                  {org.owners.map((owner) => (
                    <div
                      key={owner.id}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold shrink-0">
                        {owner.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{owner.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{owner.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Edit form */}
            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-semibold">Edit Organisation</p>

              {/* Plan */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-plan">Plan</Label>
                <Select
                  value={editPlan || org.plan}
                  onValueChange={(v) => setEditPlan(v as Plan)}
                >
                  <SelectTrigger id="edit-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(['FREE', 'STARTER', 'GROWTH', 'ENTERPRISE'] as Plan[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Credits */}
              <div className="space-y-1.5">
                <Label htmlFor="edit-credits">AI Credits Total</Label>
                <Input
                  id="edit-credits"
                  type="number"
                  min={0}
                  placeholder={String(org.aiCreditsTotal ?? 0)}
                  value={currentCredits}
                  onChange={(e) => setEditCredits(e.target.value)}
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
                <Label htmlFor="edit-active" className="cursor-pointer">
                  Organisation Active
                </Label>
                <Switch
                  id="edit-active"
                  checked={currentActive}
                  onCheckedChange={(checked) => setEditActive(checked)}
                />
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuperAdmin() {
  const qc = useQueryClient();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<SuperAdminStats>({
    queryKey: ['superadmin-stats'],
    queryFn: () => api.get('/superadmin/stats').then((r) => r.data),
  });

  const { data: orgs = [], isLoading: orgsLoading } = useQuery<OrgListItem[]>({
    queryKey: ['superadmin-orgs'],
    queryFn: () => api.get('/superadmin/orgs').then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/superadmin/orgs/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['superadmin-orgs'] });
      qc.invalidateQueries({ queryKey: ['superadmin-stats'] });
    },
  });

  const statCards = [
    {
      label: 'Total Orgs',
      value: stats?.totalOrgs ?? 0,
      icon: Building2,
      color: 'text-blue-500',
      bg: 'bg-blue-50',
    },
    {
      label: 'Active Orgs',
      value: stats?.activeOrgs ?? 0,
      icon: Activity,
      color: 'text-green-500',
      bg: 'bg-green-50',
    },
    {
      label: 'Total Users',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-purple-500',
      bg: 'bg-purple-50',
    },
    {
      label: 'Total Tasks',
      value: stats?.totalTasks ?? 0,
      icon: CheckSquare,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
  ];

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Shield className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Super Admin — Platform Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage all organisations on GrowthRhythm OS
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <Card key={label}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  {statsLoading ? (
                    <div className="mt-1 h-8 w-16 rounded bg-muted animate-pulse" />
                  ) : (
                    <p className="text-3xl font-bold mt-1">{value.toLocaleString()}</p>
                  )}
                </div>
                <div className={cn('p-2.5 rounded-lg shrink-0', bg)}>
                  <Icon className={cn('h-5 w-5', color)} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Org directory table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            Organisation Directory
            {!orgsLoading && (
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {orgs.length} org{orgs.length !== 1 ? 's' : ''}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orgsLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground text-sm">
              No organisations found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Org Name
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Users / Depts
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Created
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org, idx) => (
                    <tr
                      key={org.id}
                      className={cn(
                        'border-b last:border-0 transition-colors hover:bg-muted/30',
                        idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'
                      )}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium">{org.name}</p>
                        {org.industry && (
                          <p className="text-xs text-muted-foreground mt-0.5">{org.industry}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PlanBadge plan={org.plan} />
                      </td>
                      <td className="px-4 py-3">
                        <ActiveDot active={org.isActive} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground">
                          {org._count.users} /{' '}
                          <span className="text-foreground">{org._count.departments}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(org.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => setSelectedOrgId(org.id)}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            size="sm"
                            variant={org.isActive ? 'destructive' : 'outline'}
                            className="h-7 px-2.5 text-xs"
                            disabled={
                              toggleMutation.isPending &&
                              toggleMutation.variables?.id === org.id
                            }
                            onClick={() =>
                              toggleMutation.mutate({
                                id: org.id,
                                isActive: !org.isActive,
                              })
                            }
                          >
                            {org.isActive ? (
                              <>
                                <ToggleRight className="h-3 w-3 mr-1" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-3 w-3 mr-1" />
                                Activate
                              </>
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Org detail / edit dialog */}
      <OrgDetailDialog
        orgId={selectedOrgId}
        onClose={() => setSelectedOrgId(null)}
      />
    </div>
  );
}
