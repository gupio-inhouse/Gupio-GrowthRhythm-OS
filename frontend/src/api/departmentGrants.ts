import api from './client';

export type DeptAccessType = 'FULL' | 'SPECIFIC';

export type DeptGrant = {
  id: string;
  orgId: string;
  userId: string;
  grantedByUserId: string;
  accessType: DeptAccessType;
  departmentIds: string[];
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string; role: string; avatarUrl?: string };
  grantedBy: { id: string; name: string };
};

export const departmentGrantsApi = {
  list: () =>
    api.get<DeptGrant[]>('/owner/department-grants').then((r) => r.data),

  upsert: (data: { userId: string; accessType: DeptAccessType; departmentIds: string[] }) =>
    api.post<DeptGrant>('/owner/department-grants', data).then((r) => r.data),

  revoke: (userId: string) =>
    api.delete(`/owner/department-grants/${userId}`).then((r) => r.data),
};
