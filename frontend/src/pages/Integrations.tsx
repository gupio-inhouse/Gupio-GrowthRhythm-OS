import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plug, Calendar, Mail, MessageSquare, CreditCard, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '@/api/client';

interface IntegrationStatus {
  provider: string;
  connected: boolean;
  message: string;
  authUrl?: string | null;
}

interface RazorpayPlan { id: string; name: string; priceINR: number; users: number; aiCredits: number }
interface RazorpayData { plans: RazorpayPlan[]; connected: boolean; message: string }

const INTEGRATION_ICONS: Record<string, React.ReactNode> = {
  google: <Calendar className="h-6 w-6 text-blue-500" />,
  microsoft: <Calendar className="h-6 w-6 text-blue-700" />,
  interakt: <MessageSquare className="h-6 w-6 text-green-500" />,
  razorpay: <CreditCard className="h-6 w-6 text-blue-600" />,
};

function ConnectedBadge({ connected }: { connected: boolean }) {
  return (
    <Badge
      variant={connected ? 'default' : 'secondary'}
      className={`text-xs shrink-0 ${connected ? 'bg-green-100 text-green-700' : ''}`}
    >
      {connected ? (
        <><CheckCircle2 className="h-3 w-3 mr-1" />Connected</>
      ) : (
        <><XCircle className="h-3 w-3 mr-1" />Not connected</>
      )}
    </Badge>
  );
}

function OAuthIntegrationCard({
  title,
  description,
  icon,
  status,
  disconnectEndpoint,
  invalidateKey,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  status: IntegrationStatus | null;
  disconnectEndpoint: string;
  invalidateKey: string;
}) {
  const qc = useQueryClient();
  const disconnectMutation = useMutation({
    mutationFn: () => api.delete(disconnectEndpoint),
    onSuccess: () => qc.invalidateQueries({ queryKey: [invalidateKey] }),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-muted rounded-lg">{icon}</div>
            <div>
              <CardTitle className="text-base">{title}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{description}</CardDescription>
            </div>
          </div>
          {status && <ConnectedBadge connected={status.connected} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && <p className="text-xs text-muted-foreground">{status.message}</p>}
        <div className="flex gap-2">
          {status?.connected ? (
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : status?.authUrl ? (
            <Button size="sm" asChild>
              <a href={status.authUrl}>
                <ExternalLink className="h-3 w-3 mr-1.5" />Connect
              </a>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Integrations() {
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Handle OAuth callbacks — ?connected=google or ?error=...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get('connected');
    const error = params.get('error');
    if (connected) {
      qc.invalidateQueries({ queryKey: ['integration-calendar'] });
      qc.invalidateQueries({ queryKey: ['integration-outlook'] });
      navigate('/integrations', { replace: true });
    } else if (error) {
      console.error('OAuth error:', error);
      navigate('/integrations', { replace: true });
    }
  }, [location.search, navigate, qc]);

  const { data: calendarStatus } = useQuery<IntegrationStatus>({
    queryKey: ['integration-calendar'],
    queryFn: () => api.get('/integrations/calendar/status').then((r) => r.data),
  });

  const { data: outlookStatus } = useQuery<IntegrationStatus>({
    queryKey: ['integration-outlook'],
    queryFn: () => api.get('/integrations/outlook/status').then((r) => r.data),
  });

  const { data: whatsappStatus } = useQuery<IntegrationStatus>({
    queryKey: ['integration-whatsapp'],
    queryFn: () => api.get('/integrations/whatsapp/status').then((r) => r.data),
  });

  const { data: razorpay } = useQuery<RazorpayData>({
    queryKey: ['integration-razorpay'],
    queryFn: () => api.get('/integrations/razorpay/plans').then((r) => r.data),
  });

  return (
    <div className="p-8 max-w-4xl space-y-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Plug className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Integrations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Connect GrowthRhythm OS with your existing tools</p>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Calendar</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OAuthIntegrationCard
            title="Google Calendar"
            description="Sync standups and review meetings to Google Calendar"
            icon={INTEGRATION_ICONS['google']}
            status={calendarStatus ?? null}
            disconnectEndpoint="/integrations/calendar/disconnect"
            invalidateKey="integration-calendar"
          />
          <OAuthIntegrationCard
            title="Microsoft Outlook"
            description="Sync events via Microsoft Graph API"
            icon={INTEGRATION_ICONS['microsoft']}
            status={outlookStatus ?? null}
            disconnectEndpoint="/integrations/outlook/disconnect"
            invalidateKey="integration-outlook"
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Messaging</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-muted rounded-lg">{INTEGRATION_ICONS['interakt']}</div>
                  <div>
                    <CardTitle className="text-base">WhatsApp Business</CardTitle>
                    <CardDescription className="text-xs mt-0.5">Send standup reminders and alerts via WhatsApp (Interakt)</CardDescription>
                  </div>
                </div>
                {whatsappStatus && <ConnectedBadge connected={whatsappStatus.connected} />}
              </div>
            </CardHeader>
            <CardContent>
              {whatsappStatus && <p className="text-xs text-muted-foreground mb-3">{whatsappStatus.message}</p>}
              <Button size="sm" variant="outline" asChild>
                <a href="https://docs.interakt.ai" target="_blank" rel="noopener noreferrer">Setup Guide</a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-muted rounded-lg"><Mail className="h-6 w-6 text-orange-500" /></div>
                <div>
                  <CardTitle className="text-base">Email (Nodemailer / SMTP)</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Transactional email for invites and digests via any SMTP provider</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Set <code className="bg-muted px-1 rounded">SMTP_HOST</code>, <code className="bg-muted px-1 rounded">SMTP_USER</code>, and <code className="bg-muted px-1 rounded">SMTP_PASS</code> in your <code className="bg-muted px-1 rounded">.env</code> to enable delivery.
                Works with Gmail, Outlook, Zoho, Brevo, or Mailtrap.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Payments</h2>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-muted rounded-lg"><CreditCard className="h-6 w-6 text-blue-600" /></div>
                <div>
                  <CardTitle className="text-base">Razorpay</CardTitle>
                  <CardDescription className="text-xs mt-0.5">Accept subscription payments in ₹ INR</CardDescription>
                </div>
              </div>
              {razorpay && (
                <Badge variant={razorpay.connected ? 'default' : 'secondary'} className={`text-xs ${razorpay.connected ? 'bg-green-100 text-green-700' : ''}`}>
                  {razorpay.connected ? 'Connected' : 'Not configured'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {razorpay && (
              <>
                <p className="text-xs text-muted-foreground mb-4">{razorpay.message}</p>
                <div className="grid grid-cols-3 gap-3">
                  {razorpay.plans.map((plan) => (
                    <div key={plan.id} className="rounded-lg border p-3 text-center space-y-1">
                      <p className="text-sm font-semibold">{plan.name}</p>
                      <p className="text-lg font-bold">₹{(plan.priceINR / 100).toLocaleString('en-IN')}</p>
                      <p className="text-xs text-muted-foreground">/mo · {plan.users} users</p>
                      <p className="text-xs text-muted-foreground">{plan.aiCredits} AI credits</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
