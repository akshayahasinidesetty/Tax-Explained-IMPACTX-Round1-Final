import type { ReconciliationRecord } from './reconciliationBatch';

export interface ImportResult { records: ReconciliationRecord[]; warnings: string[]; }

/** Parse RFC-4180-style CSV rows without evaluating formulas or executing content. */
export function parseReconciliationCsv(text: string, sourceName: string): ImportResult {
  if (typeof text !== 'string' || !text.trim()) throw new Error('CSV is empty.');
  if (text.length > 5_000_000) throw new Error('CSV exceeds the 5 MB text limit.');
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n') { row.push(cell.trim()); rows.push(row); row = []; cell = ''; }
    else if (ch !== '\r') cell += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
  const nonEmpty = rows.filter(r => r.some(c => c.length));
  if (nonEmpty.length < 2) throw new Error('CSV must include a header and at least one data row.');
  const headers = nonEmpty[0].map(h => h.toLowerCase().replace(/[\s_-]+/g, ''));
  const index = (names: string[]) => headers.findIndex(h => names.includes(h));
  const ix = {
    id: index(['id', 'recordid']), payer: index(['employer', 'employerorpayer', 'payer', 'entity']),
    reference: index(['reference', 'referenceid', 'transactionid']), period: index(['period', 'reportingperiod', 'month']),
    category: index(['category', 'incomecategory', 'type']), amount: index(['amount', 'value', 'income']),
    date: index(['date', 'transactiondate']), documentId: index(['documentid', 'document']),
  };
  for (const [name, i] of Object.entries({ id: ix.id, employer: ix.payer, period: ix.period, category: ix.category, amount: ix.amount })) {
    if (i < 0) throw new Error(`CSV is missing a required column: ${name}.`);
  }
  const records: ReconciliationRecord[] = [];
  const warnings: string[] = [];
  for (let r = 1; r < nonEmpty.length; r++) {
    const cells = nonEmpty[r];
    if (cells.length !== headers.length) { warnings.push(`Row ${r + 1}: column count differs from the header; skipped.`); continue; }
    const amount = Number(cells[ix.amount].replace(/[₹,\s]/g, ''));
    if (!Number.isFinite(amount) || amount < 0) { warnings.push(`Row ${r + 1}: amount is invalid or negative; skipped.`); continue; }
    const id = cells[ix.id];
    if (!id) { warnings.push(`Row ${r + 1}: record ID is empty; skipped.`); continue; }
    records.push({
      id, source: sourceName, employerOrPayer: cells[ix.payer], reference: ix.reference < 0 ? undefined : cells[ix.reference],
      period: cells[ix.period], category: cells[ix.category].toUpperCase(), amount,
      date: ix.date < 0 || !cells[ix.date] ? undefined : cells[ix.date],
      documentId: ix.documentId < 0 ? undefined : cells[ix.documentId],
    });
  }
  if (!records.length) throw new Error('No valid records were found. Check the template and row values.');
  return { records, warnings };
}

/**
 * Optional local OCR for image files. The image is processed in the browser by
 * Tesseract.js and is not uploaded by this helper. OCR text is untrusted and
 * must be reviewed/corrected by the user before reconciliation.
 */
export async function extractImageTextLocally(file: File, onProgress?: (progress: number) => void): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Local OCR accepts image files only.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Image exceeds the 10 MB limit.');
  const { recognize } = await import('tesseract.js');
  const result = await recognize(file, 'eng', { logger: message => {
    if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress);
  }});
  return result.data.text;
}
