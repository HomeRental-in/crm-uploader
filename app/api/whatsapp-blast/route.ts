import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const maxDuration = 60;

const INSERT_CHUNK = 500;
const PAGE_SIZE = 1000;

// GET /api/whatsapp-blast -> { headers, records }
export async function GET() {
  const supabase = getSupabaseAdmin();

  const collected: { id: string; data: Record<string, string> }[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("whatsapp_blast_records")
      .select("id, data")
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const row of data ?? []) {
      collected.push({
        id: row.id,
        data: row.data as Record<string, string>,
      });
    }
    if (!data || data.length < PAGE_SIZE) break;
  }

  const headers: string[] = [];
  const seen = new Set<string>();
  for (const r of collected) {
    for (const k of Object.keys(r.data ?? {})) {
      if (!seen.has(k)) {
        seen.add(k);
        headers.push(k);
      }
    }
  }

  return NextResponse.json({ headers, records: collected });
}

// POST /api/whatsapp-blast (multipart form: file)
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
  }

  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields ?? [];
  const rows = parsed.data;

  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json(
      { error: "The CSV appears to be empty or has no header row." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: imp, error: impErr } = await supabase
    .from("whatsapp_blast_imports")
    .insert({
      file_name: file.name,
      headers,
      row_count: rows.length,
    })
    .select("id")
    .single();

  if (impErr || !imp) {
    return NextResponse.json(
      { error: impErr?.message ?? "Failed to create import record." },
      { status: 500 },
    );
  }

  const records = rows.map((row) => ({
    import_id: imp.id,
    data: row,
  }));

  for (let i = 0; i < records.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("whatsapp_blast_records")
      .insert(records.slice(i, i + INSERT_CHUNK));
    if (error) {
      return NextResponse.json(
        {
          error: `Insert failed after ${i} rows: ${error.message}`,
          importId: imp.id,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    importId: imp.id,
    inserted: records.length,
    headers,
  });
}
