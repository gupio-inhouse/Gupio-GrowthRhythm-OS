import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Clock, Video, FileText, HelpCircle, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import api from '@/api/client';

const typeIcon: Record<string, React.ElementType> = {
  VIDEO: Video, PDF: FileText, SOP: FileText, QUIZ: HelpCircle,
  ASSIGNMENT: CheckCircle2, ROLE_PLAY: BookOpen, EXTERNAL_LINK: BookOpen, COACHING_NOTE: BookOpen,
};

type Assignment = {
  id: string; status: string; dueDate?: string;
  learningItem: { title: string; type: string; estimatedMinutes?: number; learningPath: { title: string } };
};

type LearningPath = {
  id: string; title: string; description?: string;
  _count: { items: number };
  department?: { name: string };
};

export default function Learning() {
  const { data: assignments = [] } = useQuery<Assignment[]>({
    queryKey: ['learning-assignments'],
    queryFn: () => api.get('/learning/assignments').then((r) => r.data),
  });

  const { data: paths = [] } = useQuery<LearningPath[]>({
    queryKey: ['learning-paths'],
    queryFn: () => api.get('/learning/paths').then((r) => r.data),
  });

  const completed = assignments.filter((a) => a.status === 'COMPLETED').length;
  const overdue = assignments.filter((a) => a.status !== 'COMPLETED' && a.dueDate && new Date(a.dueDate) < new Date()).length;
  const completionRate = assignments.length > 0 ? Math.round((completed / assignments.length) * 100) : 0;

  return (
    <div className="p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-indigo-500" />
            Learning Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Skill building connected to execution</p>
        </div>
        <Button className="gap-2"><Plus className="h-4 w-4" /> Create Path</Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completed}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
              <Clock className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{overdue}</p>
              <p className="text-xs text-muted-foreground">Overdue</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground mb-2">Completion Rate</p>
            <Progress value={completionRate} className="h-2 mb-1" />
            <p className="text-xs text-right text-muted-foreground">{completionRate}%</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Assignments */}
        <div>
          <h2 className="text-base font-semibold mb-3">My Assignments</h2>
          <div className="space-y-2">
            {assignments.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p>No learning assignments yet</p>
              </div>
            ) : assignments.map((a) => {
              const Icon = typeIcon[a.learningItem.type] || BookOpen;
              const isOverdue = a.status !== 'COMPLETED' && a.dueDate && new Date(a.dueDate) < new Date();
              return (
                <Card key={a.id} className="hover:shadow-sm transition-shadow cursor-pointer">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                      a.status === 'COMPLETED' ? 'bg-green-100' : 'bg-indigo-100'
                    }`}>
                      <Icon className={`h-4 w-4 ${a.status === 'COMPLETED' ? 'text-green-600' : 'text-indigo-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{a.learningItem.title}</p>
                      <p className="text-xs text-muted-foreground">{a.learningItem.learningPath.title}</p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      {a.learningItem.estimatedMinutes && (
                        <span className="text-xs text-muted-foreground">{a.learningItem.estimatedMinutes}m</span>
                      )}
                      <Badge variant={
                        a.status === 'COMPLETED' ? 'success' :
                        isOverdue ? 'destructive' :
                        a.status === 'IN_PROGRESS' ? 'info' : 'secondary'
                      } className="text-xs">
                        {isOverdue ? 'Overdue' : a.status.toLowerCase().replace('_', ' ')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Learning Paths */}
        <div>
          <h2 className="text-base font-semibold mb-3">Learning Paths</h2>
          <div className="space-y-3">
            {paths.map((path) => (
              <Card key={path.id} className="hover:shadow-sm transition-shadow cursor-pointer">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{path.title}</p>
                      {path.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{path.description}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        {path.department && <Badge variant="secondary" className="text-xs">{path.department.name}</Badge>}
                        <span className="text-xs text-muted-foreground">{path._count.items} items</span>
                      </div>
                    </div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 ml-3 shrink-0">
                      <BookOpen className="h-5 w-5 text-indigo-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {paths.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                <p className="text-sm">No learning paths yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
