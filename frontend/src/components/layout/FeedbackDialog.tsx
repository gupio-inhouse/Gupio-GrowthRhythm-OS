import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { MessageSquarePlus, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import api from '@/api/client';

const CATEGORIES = [
  { value: 'BUG', label: 'Bug / Something broken' },
  { value: 'FEATURE_REQUEST', label: 'Feature Request' },
  { value: 'UI_UX', label: 'UI / UX Improvement' },
  { value: 'PERFORMANCE', label: 'Performance' },
  { value: 'OTHER', label: 'Other' },
];

export default function FeedbackDialog() {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'OTHER' });

  const submit = useMutation({
    mutationFn: () => api.post('/feedback', form).then((r) => r.data),
    onSuccess: () => {
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setForm({ title: '', description: '', category: 'OTHER' });
      }, 1800);
    },
  });

  const valid = form.title.trim().length >= 3 && form.description.trim().length >= 10;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium w-full text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
      >
        <MessageSquarePlus className="h-4 w-4 shrink-0" />
        Give Feedback
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-5 w-5 text-primary" />
              Share App Feedback
            </DialogTitle>
          </DialogHeader>

          {done ? (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-semibold">Thank you for your feedback!</p>
              <p className="text-sm text-muted-foreground">Your suggestion has been sent to the team.</p>
            </div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="Short summary of your feedback"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  maxLength={120}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description <span className="text-destructive">*</span></Label>
                <Textarea
                  placeholder="Describe the issue or improvement in detail..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground text-right">{form.description.length}/2000</p>
              </div>

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => submit.mutate()}
                  disabled={!valid || submit.isPending}
                >
                  {submit.isPending ? 'Sending…' : 'Submit Feedback'}
                </Button>
              </div>

              {submit.isError && (
                <p className="text-xs text-destructive">Failed to submit. Please try again.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
