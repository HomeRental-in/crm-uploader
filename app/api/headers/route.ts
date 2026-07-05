import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/headers?organisationId=... -> distinct column headers seen for that org
export async function GET(req: Request) {
  const organisationId = new URL(req.url).searchParams.get("organisationId");
  if (!organisationId) {
    return NextResponse.json(
      { error: "organisationId is required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("imports")
    .select("headers")
    .eq("organisation_id", organisationId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const set = new Set<string>();
  for (const row of data ?? []) {
    for (const h of (row.headers as string[] | null) ?? []) set.add(h);
  }
  return NextResponse.json([...set].sort((a, b) => a.localeCompare(b)));
}
