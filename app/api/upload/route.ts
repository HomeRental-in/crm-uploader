import { NextResponse } from "next/server";
import Papa from "papaparse";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseDMY } from "@/lib/parseDMY";

export const runtime = "nodejs";
// CSV bodies can be larger than the default; allow the whole request through.
export const maxDuration = 60;

const INSERT_CHUNK = 500;

// POST /api/upload  (multipart form: file, organisationId, dateColumn?)
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  const organisationId = String(form.get("organisationId") || "").trim();
  const dateColumn = String(form.get("dateColumn") || "").trim();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A CSV file is required." }, { status: 400 });
  }
  if (!organisationId) {
    return NextResponse.json(
      { error: "An organisation is required." },
      { status: 400 },
    );
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
  if (dateColumn && !headers.includes(dateColumn)) {
    return NextResponse.json(
      { error: `Date column "${dateColumn}" is not in the CSV headers.` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // 1. Record the upload (audit trail + original headers for the export dropdown).
  const { data: imp, error: impErr } = await supabase
    .from("imports")
    .insert({
      organisation_id: organisationId,
      file_name: file.name,
      headers,
      date_column: dateColumn || null,
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

  // 2. Build records. Re-uploads append (new import_id), never replace.
  let unparsedDates = 0;
  const records = rows.map((row) => {
    let recordDate: string | null = null;
    if (dateColumn) {
      recordDate = parseDMY(row[dateColumn]);
      if (recordDate === null && (row[dateColumn] ?? "").trim() !== "") {
        unparsedDates += 1;
      }
    }
    return {
      organisation_id: organisationId,
      import_id: imp.id,
      record_date: recordDate,
      data: row,
    };
  });

  // 3. Insert in chunks to stay under payload limits.
  for (let i = 0; i < records.length; i += INSERT_CHUNK) {
    const { error } = await supabase
      .from("crm_records")
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
    unparsedDates,
  });
}
