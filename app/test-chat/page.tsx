import { notFound } from "next/navigation";
import ChatClient from "./chat-client";

// Developer-only text test page for the voice agent. Never shipped:
// in production it is a 404, same as /api/chat.
export default function TestChatPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ChatClient />;
}
