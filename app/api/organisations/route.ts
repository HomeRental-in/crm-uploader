import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

// GET /api/organisations -> list all organisations
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organisations")
    .select("id, name, notes")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

// POST /api/organisations { name, notes? } -> create (or return existing) organisation
export async function POST(req: Request) {
  let body: { name?: unknown; notes?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { error: "Organisation name is required." },
      { status: 400 },
    );
  }

  const notesInBody = typeof body.notes === "string";
  const notes =
    typeof body.notes === "string" ? body.notes.trim() || null : null;

  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("organisations")
    .select("id, name, notes")
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    if (notesInBody) {
      const { data, error } = await supabase
        .from("organisations")
        .update({ notes })
        .eq("id", existing.id)
        .select("id, name, notes")
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
    return NextResponse.json(existing);
  }

  const { data, error } = await supabase
    .from("organisations")
    .insert({ name, notes })
    .select("id, name, notes")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
