import { NextResponse, type NextRequest } from "next/server";

/**
 * Two jobs, in this order:
 *
 * 1. Feature Tracker routing. The tracker is a static page at
 *    public/propfocus-tracker/index.html with its own Supabase login, so it
 *    is served WITHOUT the shared password:
 *      - On its own hostname (TRACKER_HOST, default customer.n8npropfocus.com)
 *        the root path serves the tracker and every other path is a 404, so
 *        the CRM pages and API are never exposed on that hostname.
 *      - On any hostname, /propfocus-tracker serves the same page (handy for
 *        local dev and until the customer DNS record exists).
 *
 * 2. Shared-password gate for everything else, using HTTP Basic Auth. The
 *    browser shows a native login prompt and caches the credentials for the
 *    session, so every page and API route below is protected by one
 *    username/password pair from env vars.
 *
 * (Next.js 16 renamed the `middleware` convention to `proxy`; runs on Node.js.)
 */
const TRACKER_PAGE = "/propfocus-tracker/index.html";

export function proxy(req: NextRequest) {
  const trackerHost = process.env.TRACKER_HOST || "customer.n8npropfocus.com";
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const { pathname } = req.nextUrl;

  if (host === trackerHost) {
    if (pathname === "/") {
      return NextResponse.rewrite(new URL(TRACKER_PAGE, req.url));
    }
    return new NextResponse("Not found.", { status: 404 });
  }

  if (pathname === "/propfocus-tracker") {
    return NextResponse.rewrite(new URL(TRACKER_PAGE, req.url));
  }

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
  // /propfocus-tracker is listed so the proxy can rewrite it (it is not gated).
  matcher: ["/", "/whatsapp-blast", "/propfocus-tracker", "/api/:path*"],
};
