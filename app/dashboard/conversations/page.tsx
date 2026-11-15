import { MessageSquareText, PhoneIncoming } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KpiCard, PageHeader } from "@/components/ui";

// Conversations: every phone call the voice agent handled, with its transcript.
// Layout only for now; calls are wired in during a later phase.

const KPIS = ["Calls", "Turned into orders", "Average length", "Callbacks requested"];

export default function ConversationsPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Conversations"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            What callers asked and how the agent answered. <Badge>Coming soon</Badge>
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KPIS.map((label) => (
          <KpiCard key={label} label={label} value="–" />
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Recent calls" />
          <EmptyState
            className="min-h-72"
            icon={<PhoneIncoming size={20} />}
            title="No data yet"
            message="Each call is listed here with the time, the caller and how it ended."
          />
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Transcript" />
          <EmptyState
            className="min-h-72"
            icon={<MessageSquareText size={20} />}
            title="No call selected"
            message="Pick a call from the list to read the conversation word for word."
          />
        </Card>
      </div>
    </div>
  );
}
