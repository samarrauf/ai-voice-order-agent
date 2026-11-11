import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

// Hashing both values gives two 32-byte buffers of equal length, so
// timingSafeEqual never throws on a wrong-length header and the
// comparison time doesn't reveal the secret's length.
function sha256(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "unauthorized", speech: "Sorry, something went wrong on our side." },
    { status: 401 },
  );
}

/**
 * Checks the x-tool-secret header against TOOL_API_SECRET.
 * Returns null if the request is allowed, or a 401 response to return as-is.
 *
 * Usage in a route:
 *   const denied = requireToolSecret(request);
 *   if (denied) return denied;
 */
export function requireToolSecret(request: Request): NextResponse | null {
  const expected = process.env.TOOL_API_SECRET;
  if (!expected) {
    // Fail closed: if the secret isn't configured, nobody gets in.
    console.error("TOOL_API_SECRET is not set; rejecting tool request");
    return unauthorized();
  }

  const provided = request.headers.get("x-tool-secret");
  if (!provided) {
    return unauthorized();
  }

  const isValid = timingSafeEqual(sha256(provided), sha256(expected));
  return isValid ? null : unauthorized();
}
