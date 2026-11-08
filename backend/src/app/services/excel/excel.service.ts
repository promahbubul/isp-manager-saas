import ExcelJS from "exceljs";
import { Response } from "express";
import config from "../../config";

export type XlsxColumn = { header: string; key: string; width?: number; numFmt?: string };

/** Build a single-sheet workbook with a bold, frozen header row. */
export async function buildXlsx(sheetName: string, columns: XlsxColumn[], rows: Record<string, unknown>[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = config.appName;
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.addRows(rows);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function sendXlsx(res: Response, filename: string, buffer: Buffer) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"`);
  res.send(buffer);
}

/** Read the first sheet into objects keyed by the header row (trimmed, lowercased). */
export async function readXlsx(buffer: Buffer, maxRows = 5000): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, col) => {
    headers[col] = String(cell.text ?? "").trim().toLowerCase();
  });
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, n) => {
    if (n === 1 || rows.length >= maxRows) return;
    const obj: Record<string, string> = {};
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      const v = cell.value;
      obj[key] = v instanceof Date ? v.toISOString() : String(cell.text ?? "").trim();
    });
    if (Object.values(obj).some((v) => v !== "")) rows.push({ __row: String(n), ...obj });
  });
  return rows;
}
