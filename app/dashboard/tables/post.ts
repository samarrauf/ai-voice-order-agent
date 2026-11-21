// Small fetch helper shared by the Tables page's client components.

export type PostResult = { ok: boolean; status: number; message: string };

export async function post(url: string, body: unknown): Promise<PostResult> {
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) return { ok: true, status: res.status, message: "" };
    const json = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    if (res.status === 401) return { ok: false, status: 401, message: "You were logged out. Please log in again." };
    if (res.status === 403) return { ok: false, status: 403, message: "You do not have permission to do this." };
    return { ok: false, status: res.status, message: json?.message ?? json?.error ?? "Something went wrong." };
  } catch {
    return { ok: false, status: 0, message: "Network problem. Try again." };
  }
}
