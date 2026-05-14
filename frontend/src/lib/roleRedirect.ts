export function getRoleRedirect(role: string, departmentSlug?: string | null): string {
  switch (role) {
    case 'OWNER':
    case 'SUPER_ADMIN':
      return '/cockpit';
    case 'COMPANY_ADMIN':
      return '/dashboard';
    case 'DEPARTMENT_HEAD':
      return departmentSlug ? `/dashboard/${departmentSlug}` : '/dashboard';
    case 'MANAGER':
    case 'TEAM_MEMBER':
      return '/tasks';
    case 'COACH_ADVISOR':
      return '/dashboard';
    default:
      return '/dashboard';
  }
}
