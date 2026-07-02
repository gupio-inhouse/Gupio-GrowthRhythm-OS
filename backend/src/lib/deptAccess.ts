import prisma from './prisma';

export type DeptAccess = { accessType: 'FULL' | 'SPECIFIC'; departmentIds: string[] } | null;

export async function getUserDeptAccess(userId: string, orgId: string, role: string): Promise<DeptAccess> {
  if (['OWNER', 'SUPER_ADMIN', 'COMPANY_ADMIN'].includes(role)) {
    return { accessType: 'FULL', departmentIds: [] };
  }
  const grant = await prisma.userDepartmentGrant.findUnique({
    where: { userId },
    select: { accessType: true, departmentIds: true, orgId: true },
  });
  if (!grant || grant.orgId !== orgId) return null;
  return { accessType: grant.accessType as 'FULL' | 'SPECIFIC', departmentIds: grant.departmentIds };
}
