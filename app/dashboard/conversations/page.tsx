import { Badge, PageHeader } from "@/components/ui";
import { ConversationsView, type Conversation } from "./conversations-view";

// Conversations: chats the voice agent had with customers (phone and WhatsApp).
// Layout only for now; real conversations are wired in during a later phase.

// Replace this with the real data (a database query) later.
const conversations: Conversation[] = [];

export default function ConversationsPage() {
  return (
    <div className="anim-rise">
      <PageHeader
        title="Conversations"
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            What customers asked and how the agent answered. <Badge>Coming soon</Badge>
          </span>
        }
      />
      <ConversationsView conversations={conversations} />
    </div>
  );
}
