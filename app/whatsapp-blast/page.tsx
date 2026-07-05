"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import { CsvPreview } from "../components/CsvPreview";
import base from "../page.module.css";
import styles from "./page.module.css";

type Row = { id: string; data: Record<string, string> };
type Msg = { type: "success" | "error"; text: string } | null;

export default function WhatsappBlastPage() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Row[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<Msg>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp-blast");
      if (res.ok) {
        const body = await res.json();
        setHeaders(body.headers ?? []);
        setRecords(body.records ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreviewHeaders([]);
    setPreviewRows([]);
    setMsg(null);
    if (!f) return;

    Papa.parse<Record<string, string>>(f, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        setPreviewHeaders(result.meta.fields ?? []);
        setPreviewRows(result.data);
      },
    });
  }

  async function submit() {
    if (!file) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const res = await fetch("/api/whatsapp-blast", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: body.error ?? "Upload failed." });
        return;
      }
      setFile(null);
      setPreviewHeaders([]);
      setPreviewRows([]);
      setMsg({
        type: "success",
        text: `Uploaded ${body.inserted} rows from ${file.name}.`,
      });
      await loadRecords();
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className={base.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.navLink}>
          ← CRM Uploader
        </Link>
      </nav>

      <header className={base.header}>
        <h1 className={base.title}>WhatsApp Blast</h1>
        <p className={base.subtitle}>
          Upload a CSV to save all WhatsApp blast records. Re-uploading appends
          new rows.
        </p>
      </header>

      <section className={base.card}>
        <h2 className={base.cardTitle}>Upload CSV</h2>
        <p className={base.cardHint}>
          Pick a CSV file. Every column and value is stored as-is. Expected
          columns: <code>name</code>, <code>mobile</code>, <code>buyer_id</code>,{" "}
          <code>lead_type</code>, <code>rep_number</code> (optional fields may be
          blank).{" "}
          <a href="/samples/whatsapp-blast-sample.csv" download>
            Download sample CSV
          </a>
        </p>

        <div className={base.field}>
          <label className={base.label}>CSV file</label>
          <input
            className={base.input}
            type="file"
            accept=".csv,text/csv"
            onChange={onFileChange}
          />
        </div>

        {previewRows.length > 0 && (
          <CsvPreview
            title="Storage preview"
            hint="Each row will be stored as JSON with all columns from your CSV."
            headers={previewHeaders}
            rows={previewRows}
            limit={5}
          />
        )}

        <div className={base.actions}>
          <button
            className={base.button}
            onClick={submit}
            disabled={uploading || !file}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        {msg && (
          <div
            className={`${base.note} ${
              msg.type === "success" ? base.noteSuccess : base.noteError
            }`}
          >
            {msg.text}
          </div>
        )}
      </section>

      <section className={base.card} style={{ marginTop: 24 }}>
        <CsvPreview
          title="Saved records"
          hint={
            loading
              ? "Loading…"
              : records.length === 0
                ? undefined
                : `${records.length} row${records.length === 1 ? "" : "s"} stored.`
          }
          headers={headers}
          rows={records.map((r) => r.data)}
          emptyMessage={
            loading ? "Loading…" : "No records saved yet. Upload a CSV above."
          }
        />
      </section>
    </main>
  );
}
