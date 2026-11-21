import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { PHOTO_MAX_BYTES, PHOTO_TYPES, isPhotoType } from "@/lib/menu-admin";
import { restaurantMismatch, requireCapability } from "@/lib/staff-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

// Menu photos (capability menu_edit). The browser never talks to Storage: it posts the
// (already resized) file here, and only this route, with the server key, writes the bucket.
//   POST   multipart: item_id + file (jpeg/png/webp, max 1.5 MB). Path: <restaurant_id>/<uuid>.<ext>.
//          The old photo is deleted after the new one is saved.
//   DELETE json { item_id }: removes the photo.

const BUCKET = "menu-photos";
const fail = (error: string, status: number) => NextResponse.json({ success: false, error }, { status });

/** Look at the first bytes, not just the type the browser claims. */
function sniff(b: Uint8Array): keyof typeof PHOTO_TYPES | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Storage path of one of OUR photos (inside this restaurant's folder), or null. */
function ownPath(url: string | null, rid: string): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return null;
  const path = url.slice(at + marker.length).split("?")[0];
  return path.startsWith(`${rid}/`) && !path.includes("..") ? path : null;
}

async function findItem(rid: string, itemId: string) {
  return supabaseAdmin
    .from("menu_items")
    .select("id, image_url")
    .eq("id", itemId)
    .eq("restaurant_id", rid)
    .is("archived_at", null)
    .maybeSingle();
}

async function logPhoto(rid: string, staffId: string, itemId: string, oldUrl: string | null, newUrl: string | null) {
  const { error } = await supabaseAdmin
    .from("menu_changes")
    .insert({ restaurant_id: rid, staff_id: staffId, entity: "item", entity_id: itemId, field: "image_url", old_value: oldUrl, new_value: newUrl });
  if (error) console.error("menu photo: change log failed", error);
}

export async function POST(request: Request) {
  const auth = await requireCapability(request, "menu_edit");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const form = await request.formData().catch(() => null);
  if (!form) return fail("invalid upload", 400);
  const bodyRid = form.get("restaurant_id");
  const mismatch = restaurantMismatch(typeof bodyRid === "string" ? bodyRid : null, auth.staff);
  if (mismatch) return mismatch;

  const itemId = z.guid().safeParse(form.get("item_id"));
  const file = form.get("file");
  if (!itemId.success || !(file instanceof File)) return fail("invalid upload", 400);
  if (!isPhotoType(file.type)) return fail("photo must be a jpeg, png or webp image", 415);
  if (file.size === 0 || file.size > PHOTO_MAX_BYTES) return fail("photo is too big (max 1.5 MB)", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (sniff(bytes) !== file.type) return fail("photo must be a jpeg, png or webp image", 415);

  const found = await findItem(rid, itemId.data);
  if (found.error) return fail("could not save the photo", 500);
  if (!found.data) return fail("not_found", 404);

  const path = `${rid}/${randomUUID()}.${PHOTO_TYPES[file.type]}`;
  const up = await supabaseAdmin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (up.error) {
    console.error("menu photo: upload failed", up.error);
    return fail("could not save the photo", 500);
  }
  const url = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const upd = await supabaseAdmin.from("menu_items").update({ image_url: url }).eq("id", itemId.data).eq("restaurant_id", rid);
  if (upd.error) {
    await supabaseAdmin.storage.from(BUCKET).remove([path]); // do not leave an orphan
    return fail("could not save the photo", 500);
  }
  const oldPath = ownPath(found.data.image_url, rid);
  if (oldPath) await supabaseAdmin.storage.from(BUCKET).remove([oldPath]);
  await logPhoto(rid, staffId, itemId.data, found.data.image_url, url);
  return NextResponse.json({ success: true, image_url: url });
}

export async function DELETE(request: Request) {
  const auth = await requireCapability(request, "menu_edit");
  if (!auth.ok) return auth.response;
  const { restaurantId: rid, staffId } = auth.staff;

  const raw = await request.json().catch(() => null);
  const mismatch = restaurantMismatch(typeof raw?.restaurant_id === "string" ? raw.restaurant_id : null, auth.staff);
  if (mismatch) return mismatch;
  const itemId = z.guid().safeParse(raw?.item_id);
  if (!itemId.success) return fail("invalid request", 400);

  const found = await findItem(rid, itemId.data);
  if (found.error) return fail("could not remove the photo", 500);
  if (!found.data) return fail("not_found", 404);
  if (!found.data.image_url) return NextResponse.json({ success: true });

  const upd = await supabaseAdmin.from("menu_items").update({ image_url: null }).eq("id", itemId.data).eq("restaurant_id", rid);
  if (upd.error) return fail("could not remove the photo", 500);
  const oldPath = ownPath(found.data.image_url, rid);
  if (oldPath) await supabaseAdmin.storage.from(BUCKET).remove([oldPath]);
  await logPhoto(rid, staffId, itemId.data, found.data.image_url, null);
  return NextResponse.json({ success: true });
}
