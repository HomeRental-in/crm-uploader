import styles from "./CsvPreview.module.css";

export type CsvRow = Record<string, string>;

export type ExtraColumn = {
  key: string;
  label: string;
  value: (row: CsvRow) => string | null;
};

type Props = {
  headers: string[];
  rows: CsvRow[];
  title?: string;
  hint?: string;
  limit?: number;
  highlightColumn?: string;
  extraColumns?: ExtraColumn[];
  emptyMessage?: string;
};

export function CsvPreview({
  headers,
  rows,
  title = "Preview",
  hint,
  limit,
  highlightColumn,
  extraColumns = [],
  emptyMessage,
}: Props) {
  if (headers.length === 0) return null;

  const displayRows = limit ? rows.slice(0, limit) : rows;
  const showEmpty = rows.length === 0 && emptyMessage;

  return (
    <div className={styles.preview}>
      {title && <p className={styles.previewTitle}>{title}</p>}
      {hint && <p className={styles.previewHint}>{hint}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className={highlightColumn === h ? styles.highlight : undefined}
                >
                  {h}
                </th>
              ))}
              {extraColumns.map((col) => (
                <th key={col.key} className={styles.storedCol}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showEmpty ? (
              <tr>
                <td
                  colSpan={headers.length + extraColumns.length}
                  className={styles.empty}
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayRows.map((row, i) => (
                <tr key={i}>
                  {headers.map((h) => (
                    <td
                      key={h}
                      className={
                        highlightColumn === h ? styles.highlight : undefined
                      }
                    >
                      {row[h]?.trim() ? row[h] : "—"}
                    </td>
                  ))}
                  {extraColumns.map((col) => {
                    const val = col.value(row);
                    const unparsed = val === null;
                    return (
                      <td
                        key={col.key}
                        className={`${styles.storedCol} ${unparsed ? styles.unparsed : ""}`}
                      >
                        {unparsed ? "(unparsed)" : val}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {limit && rows.length > limit && (
        <p className={styles.previewHint}>
          Showing first {limit} rows. The full file will be stored on upload.
        </p>
      )}
    </div>
  );
}
