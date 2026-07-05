import { NextResponse, type NextRequest } from "next/server";

/**
 * Shared-password gate using HTTP Basic Auth. The browser shows a native login
 * prompt and caches the credentials for the session, so every page and API
 * route below is protected by one username/password pair from env vars.
 *
 * (Next.js 16 renamed the `middleware` convention to `proxy`; runs on Node.js.)
 */
export function proxy(req: NextRequest) {
  const username = process.env.APP_USERNAME || "admin";
  const password = process.env.APP_PASSWORD;

  // If no password is configured, fail closed rather than leaving it open.
  if (!password) {
    return new NextResponse("Server auth is not configured (APP_PASSWORD).", {
      status: 500,
    });
  }

  const header = req.headers.get("authorization") || "";
  const expected = "Basic " + btoa(`${username}:${password}`);

  if (!timingSafeEqual(header, expected)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="CRM Uploader"' },
    });
  }

  return NextResponse.next();
}

// Length-independent comparison to avoid leaking the password via timing.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const config = {
  // Protect pages and all API routes; skip Next static assets & favicon.
  matcher: ["/", "/whatsapp-blast", "/api/:path*"],
};
