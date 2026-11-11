import { NextResponse } from "next/server";
import { z } from "zod";
import { requireToolSecret } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { priceForSpeech, sizeForSpeech } from "@/lib/speech";

// Voice-agent tool: fuzzy-search the menu for what the caller said.
// All matching happens in Postgres (public.search_menu) in a single RPC call.

const bodySchema = z.object({
  query: z.string().trim().min(1).max(100),
  restaurant_id: z.guid(), // z.guid(): seeded demo ids aren't RFC-version UUIDs
});

type SearchRow = {
  id: string;
  name: string;
  description: string | null;
  is_available: boolean;
  base_price: number;
  score: number;
  sizes: { name: string; price: number }[];
};

const NO_MATCH_SPEECH =
  "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?";

// If the runner-up scores within this margin of the top match, ask instead of guessing.
const AMBIGUITY_MARGIN = 0.1;

function buildSpeech(rows: SearchRow[]): string {
  if (rows.length === 0) return NO_MATCH_SPEECH;

  const [top, second] = rows;

  if (second && top.score < 1 && top.score - second.score < AMBIGUITY_MARGIN) {
    return `Did you mean the ${top.name} or the ${second.name}?`;
  }

  if (!top.is_available) {
    return `Sorry, the ${top.name} isn't available right now — can I get you something else?`;
  }

  if (top.sizes.length === 0) {
    return `${top.name} is ${priceForSpeech(top.base_price)}.`;
  }

  const parts = top.sizes.map((s, i) =>
    i === 0
      ? `${sizeForSpeech(s.name)} is ${priceForSpeech(s.price)}`
      : `${sizeForSpeech(s.name)} ${priceForSpeech(s.price)}`,
  );
  return `${top.name} — ${parts.join(", ")}.`;
}

export async function POST(request: Request) {
  const denied = requireToolSecret(request);
  if (denied) return denied;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid JSON body", speech: "Sorry, could you say that again?" },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "body must be { query: string, restaurant_id: uuid }", speech: "Sorry, could you say that again?" },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc("search_menu", {
    p_restaurant_id: parsed.data.restaurant_id,
    p_query: parsed.data.query,
  });

  if (error) {
    console.error("search_menu RPC failed", error);
    return NextResponse.json(
      { error: "search failed", speech: "Sorry, I'm having trouble checking the menu right now." },
      { status: 500 },
    );
  }

  const rows = ((data ?? []) as SearchRow[]).map((r) => ({
    ...r,
    base_price: Number(r.base_price),
    score: Number(r.score),
    sizes: r.sizes.map((s) => ({ name: s.name, price: Number(s.price) })),
  }));

  return NextResponse.json({
    matches: rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      available: r.is_available,
      base_price: r.base_price,
      sizes: r.sizes,
    })),
    speech: buildSpeech(rows),
  });
}
