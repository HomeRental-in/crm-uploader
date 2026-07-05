import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const PAGE_SIZE = 1000;

// GET /api/export?organisationId&from&to&field&value -> downloadable CSV
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const organisationId = params.get("organisationId");
  const from = params.get("from"); // yyyy-mm-dd (inclusive)
  const to = params.get("to"); // yyyy-mm-dd (inclusive)
  const field = params.get("field"); // optional header to filter on
  const value = params.get("value"); // optional value to match

  if (!organisationId) {
    return NextResponse.json(
      { error: "organisationId is required." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // Date range + org are filtered in the DB (indexed). The optional field/value
  // match is applied in JS so arbitrary CSV header names (spaces, symbols) work.
  const collected: Record<string, string>[] = [];
  for (let page = 0; ; page++) {
    let query = supabase
      .from("crm_records")
      .select("data")
      .eq("organisation_id", organisationId)
      .order("record_date", { ascending: true })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (from) query = query.gte("record_date", from);
    if (to) query = query.lte("record_date", to);

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of data ?? []) {
      collected.push(row.data as Record<string, string>);
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  const rows =
    field && value !== null
      ? collected.filter((r) => String(r?.[field] ?? "") === value)
      : collected;

  // Union of keys across all rows so no column is dropped in the CSV output.
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r ?? {})) {
      if (!seen.has(k)) {
        seen.add(k);
        fields.push(k);
      }
    }
  }

  const csv = Papa.unparse({ fields, data: rows });
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="crm-export-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
