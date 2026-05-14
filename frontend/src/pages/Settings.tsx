import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User, Building2, Bell, Shield, CheckCircle2, Camera,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import { getInitials } from '@/lib/utils';
import api from '@/api/client';

const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

const notificationOptions = [
  { key: 'taskAssigned', label: 'Task Assigned to Me', description: 'When someone assigns a task to you' },
  { key: 'taskBlocked', label: 'Task Blocked', description: 'When one of your tasks gets blocked' },
  { key: 'standupReminder', label: 'Standup Reminder', description: 'Daily reminder 15 minutes before standup' },
  { key: 'kraUpdate', label: 'KRA Status Change', description: 'When a KRA you own changes status' },
  { key: 'weeklyDigest', label: 'Weekly Digest', description: 'Sunday summary of team performance' },
  { key: 'reviewDue', label: 'Review Due', description: 'When a review is scheduled for your team' },
];

function SavedBanner() {
  return (
    <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
      <CheckCircle2 className="h-4 w-4" />
      Saved successfully
    </div>
  );
}

const DEFAULT_NOTIF_PREFS: Record<string, boolean> = {
  taskAssigned: true, taskBlocked: true, standupReminder: true,
  kraUpdate: false, weeklyDigest: true, reviewDue: false,
};

export default function Settings() {
  const { user, org, setAuth, token } = useAuthStore();
  const qc = useQueryClient();
  const [profileSaved, setProfileSaved] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);

  // Fetch user detail to get notificationPrefs
  const { data: userDetail } = useQuery({
    queryKey: ['user-me', user?.id],
    queryFn: () => api.get(`/users/${user!.id}`).then((r) => r.data),
    enabled: !!user?.id,
  });

  const [notifications, setNotifications] = useState<Record<string, boolean>>(DEFAULT_NOTIF_PREFS);

  useEffect(() => {
    if (userDetail?.notificationPrefs) {
      setNotifications({ ...DEFAULT_NOTIF_PREFS, ...(userDetail.notificationPrefs as Record<string, boolean>) });
    }
  }, [userDetail?.notificationPrefs]);

  const { register: regProfile, handleSubmit: handleProfile, formState: { errors: profileErrors } } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name || '', phone: user?.phone || '' },
  });

  const { register: regPwd, handleSubmit: handlePwd, reset: resetPwd, formState: { errors: pwdErrors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  });

  const updateProfile = useMutation({
    mutationFn: (data: ProfileForm) => api.patch(`/users/${user?.id}`, data).then((r) => r.data),
    onSuccess: (updated) => {
      if (token && user && org) {
        setAuth(token, { ...user, ...updated }, org);
      }
      qc.invalidateQueries({ queryKey: ['me'] });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    },
  });

  const changePassword = useMutation({
    mutationFn: (data: PasswordForm) =>
      api.patch(`/users/${user?.id}`, { password: data.newPassword }).then((r) => r.data),
    onSuccess: () => {
      resetPwd();
      setPasswordSaved(true);
      setTimeout(() => setPasswordSaved(false), 3000);
    },
  });

  const saveNotifPrefs = useMutation({
    mutationFn: () => api.patch(`/users/${user?.id}`, { notificationPrefs: notifications }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-me', user?.id] });
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 3000);
    },
  });

  const roleLabel: Record<string, string> = {
    OWNER: 'Owner',
    COMPANY_ADMIN: 'Company Admin',
    DEPARTMENT_HEAD: 'Department Head',
    MANAGER: 'Manager',
    TEAM_MEMBER: 'Team Member',
    COACH_ADVISOR: 'Coach / Advisor',
    SUPER_ADMIN: 'Super Admin',
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage your account and preferences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" />Profile
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2">
            <Bell className="h-4 w-4" />Notifications
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2">
            <Shield className="h-4 w-4" />Security
          </TabsTrigger>
          {org && (
            <TabsTrigger value="organization" className="gap-2">
              <Building2 className="h-4 w-4" />Organization
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details and avatar.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Avatar section */}
              <div className="flex items-center gap-5">
                <div className="relative">
                  <Avatar className="h-20 w-20">
                    <AvatarImage src={user?.avatarUrl} />
                    <AvatarFallback className="text-2xl bg-primary/10 text-primary font-bold">
                      {getInitials(user?.name || 'U')}
                    </AvatarFallback>
                  </Avatar>
                  <button className="absolute bottom-0 right-0 h-7 w-7 bg-primary text-primary-foreground rounded-full flex items-center justify-center shadow-md hover:bg-primary/90 transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div>
                  <p className="font-semibold text-lg">{user?.name}</p>
                  <p className="text-sm text-muted-foreground">{user?.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {roleLabel[user?.role || ''] || user?.role}
                    </Badge>
                    {org && (
                      <span className="text-xs text-muted-foreground">{org.name}</span>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              <form onSubmit={handleProfile((data) => updateProfile.mutate(data))} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" {...regProfile('name')} />
                    {profileErrors.name && <p className="text-xs text-destructive">{profileErrors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" value={user?.email} disabled className="opacity-60" />
                    <p className="text-xs text-muted-foreground">Email cannot be changed here</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" placeholder="+91 98765 43210" {...regProfile('phone')} />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  {profileSaved ? <SavedBanner /> : <span />}
                  <Button type="submit" disabled={updateProfile.isPending}>
                    {updateProfile.isPending ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications tab */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose what updates you want to be notified about.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1">
              {notificationOptions.map((opt, idx) => (
                <div key={opt.key}>
                  {idx > 0 && <Separator className="my-1" />}
                  <div className="flex items-center justify-between py-3">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    <Switch
                      checked={notifications[opt.key]}
                      onCheckedChange={(v) => setNotifications((prev) => ({ ...prev, [opt.key]: v }))}
                    />
                  </div>
                </div>
              ))}
              <div className="pt-4 flex items-center justify-between">
                {notifSaved ? <SavedBanner /> : <span />}
                <Button size="sm" onClick={() => saveNotifPrefs.mutate()} disabled={saveNotifPrefs.isPending}>
                  {saveNotifPrefs.isPending ? 'Saving...' : 'Save Preferences'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Use a strong password to keep your account secure.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePwd((data) => changePassword.mutate(data))} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" {...regPwd('currentPassword')} />
                  {pwdErrors.currentPassword && (
                    <p className="text-xs text-destructive">{pwdErrors.currentPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" {...regPwd('newPassword')} />
                  {pwdErrors.newPassword && (
                    <p className="text-xs text-destructive">{pwdErrors.newPassword.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" {...regPwd('confirmPassword')} />
                  {pwdErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{pwdErrors.confirmPassword.message}</p>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2">
                  {passwordSaved ? <SavedBanner /> : <span />}
                  <Button type="submit" disabled={changePassword.isPending}>
                    {changePassword.isPending ? 'Updating...' : 'Update Password'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="mt-4 border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive text-base">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions — proceed with care.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Deactivate Account</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Your account will be disabled. Contact your admin to re-enable.</p>
                </div>
                <Button variant="destructive" size="sm" disabled>Deactivate</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Organization tab (admin/owner only) */}
        {org && (
          <TabsContent value="organization">
            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>View your organization information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Organization Name</Label>
                    <Input value={org.name} disabled className="opacity-70" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Industry</Label>
                    <Input value={org.industry || '—'} disabled className="opacity-70" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Company Size</Label>
                    <Input value={org.size || '—'} disabled className="opacity-70" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Plan</Label>
                    <div className="h-10 flex items-center">
                      <Badge variant="secondary" className="text-sm">{org.plan || 'Starter'}</Badge>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground pt-2">
                  To update organization details or upgrade your plan, contact{' '}
                  <a href="mailto:support@gupio.com" className="text-primary hover:underline">support@gupio.com</a>.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
