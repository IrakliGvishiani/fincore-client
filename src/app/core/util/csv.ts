import { saveBlob } from './download';

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Excel opens UTF-8 CSV correctly only with a BOM. */
const BOM = '﻿';

/** Text starting with these can be run as a formula by spreadsheet apps (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

/** RFC 4180 escaping: quote fields containing `,` `"` or line breaks; double inner quotes. */
export function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let text = value;
  // Plain numbers ("-12.50") are safe; anything else starting like a formula is neutralised.
  if (FORMULA_START.test(text) && !PLAIN_NUMBER.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Builds CSV text (CRLF line endings, header row first). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCsvField(c.header)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCsvField(c.value(row))).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Generates the CSV in the browser and downloads it (UTF-8 with BOM). */
export function downloadCsv<T>(fileName: string, rows: readonly T[], columns: readonly CsvColumn<T>[]): void {
  const blob = new Blob([BOM + toCsv(rows, columns)], { type: 'text/csv;charset=utf-8' });
  saveBlob(blob, fileName);
}
