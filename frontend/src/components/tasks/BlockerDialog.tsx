import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const BLOCKER_TYPES = [
  { value: 'APPROVAL', label: 'Awaiting Approval' },
  { value: 'CLIENT', label: 'Client Dependency' },
  { value: 'DEPENDENCY', label: 'Technical Dependency' },
  { value: 'RESOURCE', label: 'Resource Unavailable' },
  { value: 'UNCLEAR_REQUIREMENT', label: 'Unclear Requirement' },
  { value: 'SYSTEM_ISSUE', label: 'System / Tool Issue' },
  { value: 'OTHER', label: 'Other' },
];

const schema = z.object({
  blockerType: z.enum(['APPROVAL', 'CLIENT', 'DEPENDENCY', 'RESOURCE', 'UNCLEAR_REQUIREMENT', 'SYSTEM_ISSUE', 'OTHER']),
  blockerDescription: z.string().min(5, 'Please describe the blocker'),
  blockerExpectedResolution: z.string().optional(),
});

type BlockerForm = z.infer<typeof schema>;

interface Props {
  open: boolean;
  taskTitle: string;
  onConfirm: (data: BlockerForm) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function BlockerDialog({ open, taskTitle, onConfirm, onCancel, isLoading }: Props) {
  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<BlockerForm>({
    resolver: zodResolver(schema),
    defaultValues: { blockerType: 'OTHER' },
  });

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Mark as Blocked
          </DialogTitle>
          <DialogDescription className="truncate">
            {taskTitle}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit((data) => { onConfirm(data); reset(); })} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Blocker Type</Label>
            <Select defaultValue="OTHER" onValueChange={(v) => setValue('blockerType', v as BlockerForm['blockerType'])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCKER_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.blockerType && <p className="text-xs text-destructive">{errors.blockerType.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Describe the blocker</Label>
            <Textarea
              placeholder="What exactly is blocking this task? Who needs to act?"
              rows={3}
              {...register('blockerDescription')}
            />
            {errors.blockerDescription && <p className="text-xs text-destructive">{errors.blockerDescription.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Expected resolution date (optional)</Label>
            <Input type="date" {...register('blockerExpectedResolution')} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Confirm Blocker'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
