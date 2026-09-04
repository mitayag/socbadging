import { readSheet } from "read-excel-file/node";

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  return rows;
}
export async function parseRosterFile(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error("Roster file must not exceed 2 MiB");
  const lower = file.name.toLowerCase();
  const mimeType = file.type.toLowerCase();
  let rows: unknown[][];
  if (lower.endsWith(".csv")) {
    if (
      mimeType !== "" &&
      mimeType !== "text/csv" &&
      mimeType !== "application/csv" &&
      mimeType !== "application/vnd.ms-excel"
    ) {
      throw new Error("Roster file MIME type is not supported");
    }
    rows = parseCsv(await file.text());
  } else if (lower.endsWith(".xlsx")) {
    if (
      mimeType !== "" &&
      mimeType !== "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    ) {
      throw new Error("Roster file MIME type is not supported");
    }
    rows = (await readSheet(Buffer.from(await file.arrayBuffer()))) as unknown as unknown[][];
  } else throw new Error("Roster file must be CSV or XLSX");
  if (rows.length < 2) throw new Error("Roster file must contain a header and at least one row");
  if (rows.length > 5001) throw new Error("Roster file cannot exceed 5,000 data rows");
  return {
    headers: rows[0]!.map(String),
    rows: rows.slice(1).map((r) => r.map((v) => (v == null ? "" : String(v)))),
  };
}
