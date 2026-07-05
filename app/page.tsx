"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Papa from "papaparse";
import { CsvPreview } from "./components/CsvPreview";
import { parseDMY } from "@/lib/parseDMY";
import styles from "./page.module.css";

type Organisation = { id: string; name: string; notes?: string | null };
type Msg = { type: "success" | "error"; text: string } | null;

export default function Home() {
  const [orgs, setOrgs] = useState<Organisation[]>([]);

  const loadOrgs = useCallback(async () => {
    const res = await fetch("/api/organisations");
    if (res.ok) setOrgs(await res.json());
  }, []);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>CRM Uploader</h1>
        <p className={styles.subtitle}>
          Upload customer CRM data as CSV and export a filtered slice back out.{" "}
          <Link href="/whatsapp-blast" style={{ color: "var(--accent)" }}>
            WhatsApp Blast →
          </Link>
        </p>
      </header>

      <div className={styles.grid}>
        <UploadCard orgs={orgs} reloadOrgs={loadOrgs} />
        <ExportCard orgs={orgs} reloadOrgs={loadOrgs} />
      </div>

      <footer className={styles.footer}>
        Dates are read as dd/mm/yyyy. Re-uploading a customer&apos;s CSV appends
        new rows.
      </footer>
    </main>
  );
}

function OrgSelect({
  orgs,
  value,
  onChange,
  reloadOrgs,
}: {
  orgs: Organisation[];
  value: string;
  onChange: (id: string) => void;
  reloadOrgs?: () => Promise<void>;
}) {
  const [newName, setNewName] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [creating, setCreating] = useState(false);

  async function createOrg() {
    const name = newName.trim();
    if (!name || !reloadOrgs) return;
    setCreating(true);
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, notes: newNotes }),
      });
      if (res.ok) {
        const org: Organisation = await res.json();
        await reloadOrgs();
        onChange(org.id);
        setNewName("");
        setNewNotes("");
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <div className={styles.field}>
        <label className={styles.label}>Organisation</label>
        <select
          className={styles.select}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Select an organisation…</option>
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </div>

      {reloadOrgs && (
        <>
          <div className={styles.inline}>
            <div className={styles.field}>
              <label className={styles.label}>Or add a new organisation</label>
              <input
                className={styles.input}
                placeholder="New organisation name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={createOrg}
              disabled={creating || !newName.trim()}
            >
              {creating ? "Adding…" : "Add"}
            </button>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Notes (optional)</label>
            <textarea
              className={styles.textarea}
              placeholder="Context for exports — e.g. date format quirks, column mappings…"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
            />
          </div>
        </>
      )}
    </>
  );
}

function UploadCard({
  orgs,
  reloadOrgs,
}: {
  orgs: Organisation[];
  reloadOrgs: () => Promise<void>;
}) {
  const [orgId, setOrgId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [dateColumn, setDateColumn] = useState("");
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setHeaders([]);
    setPreviewRows([]);
    setDateColumn("");
    setMsg(null);
    if (!f) return;

    Papa.parse<Record<string, string>>(f, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (result) => {
        const fields = result.meta.fields ?? [];
        setHeaders(fields);
        setPreviewRows(result.data);
        const guess = fields.find((h) => /date/i.test(h));
        if (guess) setDateColumn(guess);
      },
    });
  }

  async function submit() {
    if (!file || !orgId) return;
    setUploading(true);
    setMsg(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("organisationId", orgId);
      form.append("dateColumn", dateColumn);

      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: body.error ?? "Upload failed." });
        return;
      }
      const extra =
        body.unparsedDates > 0
          ? ` (${body.unparsedDates} rows had an unrecognised date and were stored without one)`
          : "";
      setMsg({
        type: "success",
        text: `Uploaded ${body.inserted} rows.${extra}`,
      });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Upload CSV</h2>
      <p className={styles.cardHint}>
        Choose the customer, pick the CSV, then tell us which column holds the
        date (<code>dd/mm/yyyy</code>).{" "}
        <a href="/samples/crm-sample.csv" download>
          Download sample CSV
        </a>{" "}
        (KNS export: 16 columns, 7 rows).
      </p>

      <OrgSelect
        orgs={orgs}
        value={orgId}
        onChange={setOrgId}
        reloadOrgs={reloadOrgs}
      />

      <div className={styles.divider} />

      <div className={styles.field}>
        <label className={styles.label}>CSV file</label>
        <input
          className={styles.input}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
        />
      </div>

      {headers.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Date column (dd/mm/yyyy)</label>
          <select
            className={styles.select}
            value={dateColumn}
            onChange={(e) => setDateColumn(e.target.value)}
          >
            <option value="">No date column</option>
            {headers.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      )}

      {previewRows.length > 0 && (
        <CsvPreview
          title="Storage preview"
          hint={
            dateColumn
              ? "Each row is stored as JSON (all columns) plus record_date parsed from the selected date column."
              : "Each row is stored as JSON with all columns. No date column selected."
          }
          headers={headers}
          rows={previewRows}
          limit={5}
          highlightColumn={dateColumn || undefined}
          extraColumns={
            dateColumn
              ? [
                  {
                    key: "record_date",
                    label: "record_date",
                    value: (row) => parseDMY(row[dateColumn]),
                  },
                ]
              : undefined
          }
        />
      )}

      <div className={styles.actions}>
        <button
          className={styles.button}
          onClick={submit}
          disabled={uploading || !file || !orgId}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </div>

      {msg && (
        <div
          className={`${styles.note} ${
            msg.type === "success" ? styles.noteSuccess : styles.noteError
          }`}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}

function ExportCard({
  orgs,
  reloadOrgs,
}: {
  orgs: Organisation[];
  reloadOrgs: () => Promise<void>;
}) {
  const [orgId, setOrgId] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const selectedOrg = orgs.find((o) => o.id === orgId);
  const savedNotes = selectedOrg?.notes?.trim() ?? "";
  const notesDirty = orgId !== "" && notesDraft !== savedNotes;

  useEffect(() => {
    setNotesDraft(savedNotes);
    setEditingNotes(false);
  }, [orgId, savedNotes]);

  async function saveNotes() {
    if (!orgId) return;
    setSavingNotes(true);
    setMsg(null);
    try {
      const res = await fetch("/api/organisations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orgId, notes: notesDraft }),
      });
      const body = await res.json();
      if (!res.ok) {
        setMsg({ type: "error", text: body.error ?? "Could not save notes." });
        return;
      }
      await reloadOrgs();
      setEditingNotes(false);
      setMsg({ type: "success", text: "Notes saved." });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setSavingNotes(false);
    }
  }

  async function download() {
    if (!orgId) return;
    setDownloading(true);
    setMsg(null);
    try {
      const params = new URLSearchParams({ organisationId: orgId });
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await fetch(`/api/export?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMsg({ type: "error", text: body.error ?? "Export failed." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `crm-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg({ type: "success", text: "Export downloaded." });
    } catch (err) {
      setMsg({ type: "error", text: (err as Error).message });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Export CSV</h2>
      <p className={styles.cardHint}>
        Pick a customer and date range, then download.
      </p>

      <OrgSelect orgs={orgs} value={orgId} onChange={setOrgId} />

      {orgId && (
        <div className={styles.field}>
          <label className={styles.label}>Notes</label>
          {savedNotes && !editingNotes ? (
            <>
              <div className={styles.orgNote}>{savedNotes}</div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={() => {
                    setNotesDraft(savedNotes);
                    setEditingNotes(true);
                  }}
                >
                  Edit notes
                </button>
              </div>
            </>
          ) : (
            <>
              {!savedNotes && !editingNotes && (
                <p className={styles.orgNoteEmpty}>
                  No notes yet for this organisation.
                </p>
              )}
              <textarea
                className={styles.textarea}
                placeholder="Add notes for this customer…"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonSecondary}`}
                  onClick={saveNotes}
                  disabled={savingNotes || !notesDirty}
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
                {savedNotes && (
                  <button
                    type="button"
                    className={`${styles.button} ${styles.buttonSecondary}`}
                    onClick={() => {
                      setNotesDraft(savedNotes);
                      setEditingNotes(false);
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>From</label>
          <input
            className={styles.input}
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>To</label>
          <input
            className={styles.input}
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.button}
          onClick={download}
          disabled={downloading || !orgId}
        >
          {downloading ? "Preparing…" : "Download CSV"}
        </button>
      </div>

      {msg && (
        <div
          className={`${styles.note} ${
            msg.type === "success" ? styles.noteSuccess : styles.noteError
          }`}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}
