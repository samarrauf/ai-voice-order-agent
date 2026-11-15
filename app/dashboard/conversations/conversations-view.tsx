"use client";

import { useState } from "react";
import { ArrowLeft, MessageCircle, MessageSquareText, Phone } from "lucide-react";
import { Badge, Card, EmptyState, cn } from "@/components/ui";

// Conversations screen: filter chips on top, a list of chats on the left and the
// open chat on the right (on a phone: the list first, the chat after a tap).
// No real data yet. When it exists, pass it in as the `conversations` prop;
// nothing else in this file needs to change.

export type Lead = "hot" | "warm" | "followup" | "converted";

export type ChatMessage = { id: string; from: "customer" | "agent"; text: string; time: string };

export type Conversation = {
  id: string;
  customer: string; // name, or the phone number if we don't know the name
  channel: "whatsapp" | "phone";
  time: string; // already formatted, e.g. "14:32"
  summary: string; // one line
  lead: Lead;
  messages: ChatMessage[];
};

// What each lead type means. Shown in the "?" tooltip next to every chip.
const LEADS: { key: Lead; label: string; meaning: string; tone: "hot" | "preparing" | "new" | "ready" }[] = [
  { key: "hot", label: "Hot", tone: "hot", meaning: "Wanted to order, book or plan an event, but did not finish." },
  { key: "warm", label: "Warm", tone: "preparing", meaning: "Asked about the menu, prices or opening times. Not ready to commit yet." },
  { key: "followup", label: "Follow-up", tone: "new", meaning: "A complaint, refund or callback. A person needs to reply." },
  { key: "converted", label: "Converted", tone: "ready", meaning: "The order or booking was completed." },
];

type Filter = "all" | Lead;

export function ConversationsView({ conversations }: { conversations: Conversation[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const visible = filter === "all" ? conversations : conversations.filter((c) => c.lead === filter);
  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const countOf = (lead: Lead) => conversations.filter((c) => c.lead === lead).length;

  return (
    <div>
      <div role="group" aria-label="Lead type" className="mb-4 flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={conversations.length} />
        {LEADS.map((lead, i) => (
          <Chip
            key={lead.key}
            active={filter === lead.key}
            onClick={() => setFilter(lead.key)}
            label={lead.label}
            count={countOf(lead.key)}
            hint={lead.meaning}
            alignRight={i >= 2}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* List. Hidden on a phone while a chat is open. */}
        <Card className={cn("lg:col-span-2", selected && "hidden lg:block")}>
          {visible.length === 0 ? (
            <EmptyState
              className="min-h-72"
              icon={<MessageSquareText size={20} />}
              title="No conversations yet"
              message="When the agent talks to customers, their chats will show up here."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {visible.map((c) => (
                <li key={c.id}>
                  <ConversationCard conversation={c} active={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Chat. On a phone it only shows once a conversation is tapped. */}
        <Card className={cn("lg:col-span-3", !selected && "hidden lg:block")}>
          {selected ? (
            <ChatThread conversation={selected} onBack={() => setSelectedId(null)} />
          ) : (
            <EmptyState
              className="min-h-72"
              icon={<MessageSquareText size={20} />}
              title="No chat selected"
              message="Pick a conversation from the list to read it here."
            />
          )}
        </Card>
      </div>
    </div>
  );
}

/** One filter chip. The "?" beside it is a separate button so the tooltip never sits inside another button. */
function Chip({
  label,
  count,
  active,
  onClick,
  hint,
  alignRight,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  hint?: string;
  alignRight?: boolean;
}) {
  const tipId = `lead-tip-${label.toLowerCase()}`;
  return (
    <div className="group relative inline-flex items-center">
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border py-0 pl-4 text-sm font-medium transition-colors duration-200",
          hint ? "pr-9" : "pr-4",
          active
            ? "border-accent-line bg-accent-soft text-accent-ink"
            : "border-line bg-raised text-ink-muted hover:border-line-strong hover:text-ink",
        )}
      >
        {label}
        <span
          className={cn(
            "min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-bold tabular-nums",
            active ? "bg-accent text-on-accent" : "bg-ink/10 text-ink-muted",
          )}
        >
          {count}
        </span>
      </button>
      {hint && (
        <>
          <button
            type="button"
            aria-label={`What does ${label} mean?`}
            aria-describedby={tipId}
            className="absolute right-2 flex size-5 items-center justify-center rounded-full border border-line-strong text-[11px] font-bold text-ink-faint transition-colors hover:text-ink focus-visible:text-ink"
          >
            ?
          </button>
          <span
            id={tipId}
            role="tooltip"
            className={cn(
              "pointer-events-none invisible absolute top-full z-20 mt-2 w-56 rounded-xl border border-line-strong bg-raised p-3 text-xs leading-relaxed text-ink-muted opacity-0 shadow-lg shadow-black/40 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100",
              alignRight ? "right-0" : "left-0",
            )}
          >
            {hint}
          </span>
        </>
      )}
    </div>
  );
}

function LeadBadge({ lead }: { lead: Lead }) {
  const info = LEADS.find((l) => l.key === lead)!;
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

function ChannelIcon({ channel, size = 14 }: { channel: Conversation["channel"]; size?: number }) {
  return channel === "whatsapp" ? (
    <MessageCircle size={size} aria-label="WhatsApp" />
  ) : (
    <Phone size={size} aria-label="Phone call" />
  );
}

/** One row in the list: who, channel, time, a one-line summary and a single lead badge. */
function ConversationCard({
  conversation: c,
  active,
  onSelect,
}: {
  conversation: Conversation;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border p-4 text-left transition-colors duration-200",
        active ? "border-accent-line bg-accent-soft" : "border-line bg-raised hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <span className="text-ink-faint">
            <ChannelIcon channel={c.channel} />
          </span>
          <span className="truncate">{c.customer}</span>
        </span>
        <span className="shrink-0 text-xs text-ink-faint">{c.time}</span>
      </div>
      <p className="truncate text-xs text-ink-muted">{c.summary}</p>
      <div>
        <LeadBadge lead={c.lead} />
      </div>
    </button>
  );
}

/** The open chat: customer messages on the left, the agent's on the right in the accent colour. */
function ChatThread({ conversation: c, onBack }: { conversation: Conversation; onBack: () => void }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3 border-b border-line pb-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the list"
          className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-raised text-ink-muted hover:text-ink lg:hidden"
        >
          <ArrowLeft size={18} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 truncate text-sm font-semibold">
            <span className="text-ink-faint">
              <ChannelIcon channel={c.channel} />
            </span>
            {c.customer}
          </p>
          <p className="text-xs text-ink-faint">{c.time}</p>
        </div>
        <LeadBadge lead={c.lead} />
      </div>

      <ul className="flex flex-col gap-3">
        {c.messages.map((m) => {
          const agent = m.from === "agent";
          return (
            <li key={m.id} className={cn("flex", agent ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl border px-4 py-2.5 text-sm leading-relaxed",
                  agent
                    ? "rounded-br-sm border-accent-line bg-accent-soft text-ink"
                    : "rounded-bl-sm border-line bg-raised text-ink",
                )}
              >
                <p>{m.text}</p>
                <p className="mt-1 text-[11px] text-ink-faint">{m.time}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
