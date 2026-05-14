import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Filter, CheckSquare, AlertTriangle, Clock, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, statusColor, priorityColor, formatDate } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import api from '@/api/client';

type Task = {
  id: string; title: string; status: string; priority: string;
  dueDate?: string; assignee?: { name: string; avatarUrl?: string };
  kra?: { name: string }; department?: { name: string };
  blockerType?: string; _count?: { comments: number };
};

const statusOrder = ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'];

export default function Tasks() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [view, setView] = useState<'list' | 'kanban'>('list');

  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ['tasks'],
    queryFn: () => api.get('/tasks').then((r) => r.data),
  });

  const filtered = tasks.filter((t) => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter && t.status !== statusFilter) return false;
    return true;
  });

  const statusCounts = {
    TODO: tasks.filter((t) => t.status === 'TODO').length,
    IN_PROGRESS: tasks.filter((t) => t.status === 'IN_PROGRESS').length,
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').length,
    DONE: tasks.filter((t) => t.status === 'DONE').length,
  };

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{tasks.length} total tasks</p>
        </div>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'To Do', count: statusCounts.TODO, color: 'bg-gray-100 text-gray-700', icon: CheckSquare },
          { label: 'In Progress', count: statusCounts.IN_PROGRESS, color: 'bg-blue-50 text-blue-700', icon: Clock },
          { label: 'Blocked', count: statusCounts.BLOCKED, color: 'bg-red-50 text-red-700', icon: AlertTriangle },
          { label: 'Done', count: statusCounts.DONE, color: 'bg-green-50 text-green-700', icon: CheckSquare },
        ].map(({ label, count, color, icon: Icon }) => (
          <button
            key={label}
            onClick={() => setStatusFilter(label.replace(' ', '_').toUpperCase() === statusFilter ? '' : label.replace(' ', '_').toUpperCase())}
            className={cn('rounded-xl border p-4 text-left transition-all hover:shadow-sm', color)}
          >
            <div className="flex items-center gap-2">
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold mt-2">{count}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {['', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors',
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CheckSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
          <p>No tasks found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => (
            <Card key={task.id} className="hover:shadow-sm transition-shadow cursor-pointer">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Status indicator */}
                  <div className={cn('h-3 w-3 rounded-full shrink-0', {
                    'bg-gray-300': task.status === 'TODO',
                    'bg-blue-500': task.status === 'IN_PROGRESS',
                    'bg-red-500': task.status === 'BLOCKED',
                    'bg-green-500': task.status === 'DONE',
                    'bg-gray-200': task.status === 'CANCELLED',
                  })} />

                  {/* Task info */}
                  <div className="flex-1 min-w-0">
                    <p className={cn('font-medium truncate', task.status === 'DONE' && 'line-through text-muted-foreground')}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {task.kra && <span className="text-xs text-muted-foreground">KRA: {task.kra.name}</span>}
                      {task.department && <span className="text-xs text-muted-foreground">{task.department.name}</span>}
                      {task.blockerType && (
                        <span className="text-xs text-red-500 font-medium capitalize">
                          ⚠ {task.blockerType.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Priority */}
                  <Badge className={cn('text-xs border shrink-0', priorityColor(task.priority))}>
                    {task.priority}
                  </Badge>

                  {/* Due date */}
                  {task.dueDate && (
                    <span className={cn('text-xs shrink-0', new Date(task.dueDate) < new Date() && task.status !== 'DONE' ? 'text-red-500 font-medium' : 'text-muted-foreground')}>
                      {formatDate(task.dueDate)}
                    </span>
                  )}

                  {/* Assignee */}
                  {task.assignee && (
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarImage src={task.assignee.avatarUrl} />
                      <AvatarFallback className="text-xs bg-primary/10">{getInitials(task.assignee.name)}</AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
