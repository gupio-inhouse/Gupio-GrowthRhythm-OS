import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/api/client';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { formatRelative } from '@/lib/utils';

interface Notification {
  id: string;
  type: string;
  payload: Record<string, any>;
  channel: 'DASHBOARD';
  status: 'PENDING' | 'SENT' | 'OPENED' | 'FAILED';
  openedAt: string | null;
  createdAt: string;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // Poll unread count every 30 seconds
  const { data: unreadData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data),
    refetchInterval: 30000,
  });

  const unreadCount = unreadData?.count ?? 0;

  // Fetch notifications only when panel is open
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notification[]>('/notifications').then((r) => r.data),
    enabled: open,
  });

  // Mark single notification as read
  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    },
  });

  const handleNotificationClick = (notification: Notification) => {
    if (notification.status !== 'OPENED') {
      markRead.mutate(notification.id);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>

        {/* Notification list */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Bell className="h-8 w-8 opacity-30" />
              <span>No notifications yet</span>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const isUnread = notification.status !== 'OPENED';
                return (
                  <li key={notification.id}>
                    <button
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:bg-accent/50',
                        isUnread && 'bg-blue-50 dark:bg-blue-950/20'
                      )}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-2">
                        {isUnread && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" aria-hidden="true" />
                        )}
                        <div className={cn('flex-1 min-w-0', !isUnread && 'pl-4')}>
                          {notification.payload.title && (
                            <p className="text-sm font-medium leading-snug truncate">
                              {notification.payload.title}
                            </p>
                          )}
                          {notification.payload.body && (
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                              {notification.payload.body}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-muted-foreground/70">
                            {formatRelative(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
