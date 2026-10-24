import type { ReconciliationRecord } from './reconciliationBatch';
import { parseReconciliationCsv } from './documentImport';

export interface ExtractedDocumentContent {
  text: string;
  records: ReconciliationRecord[];
  warnings: string[];
  kind: 'csv' | 'xlsx' | 'pdf' | 'image' | 'text';
}

function recordImport(text: string, name: string): { records: ReconciliationRecord[]; warnings: string[] } {
  try {
    const imported = parseReconciliationCsv(text, name);
    return { records: imported.records, warnings: imported.warnings };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Could not parse structured records.';
    return { records: [], warnings: [`No structured rows were imported automatically: ${reason} Add or correct records in the review screen.`] };
  }
}

async function extractPdf(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('PDF exceeds the 25 MB local-processing limit.');
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url).toString();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, 100);
  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str : '').join(' ').replace(/[ \t]+/g, ' ').trim();
    parts.push(`--- Page ${pageNumber} ---\n${text}`);
  }
  if (pdf.numPages > pageCount) parts.push(`[Only the first ${pageCount} of ${pdf.numPages} pages were processed.]`);
  return parts.join('\n\n');
}

async function extractWorkbook(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Spreadsheet exceeds the 25 MB local-processing limit.');
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, dense: true });
  if (!workbook.SheetNames.length) throw new Error('Spreadsheet has no worksheets.');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('The first worksheet could not be read.');
  return XLSX.utils.sheet_to_csv(sheet, { FS: ',', RS: '\n' });
}

/**
 * Extracts local file content and attempts structured CSV import. OCR/PDF text is
 * never silently considered authoritative: the UI must expose it for review.
 */
export async function processLocalDocument(file: File, onProgress?: (progress: number) => void): Promise<ExtractedDocumentContent> {
  if (file.size > 25 * 1024 * 1024) throw new Error('File exceeds the 25 MB local-processing limit.');
  const name = file.name.toLocaleLowerCase('en-IN');
  let kind: ExtractedDocumentContent['kind'];
  let text: string;
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    kind = 'csv'; text = await file.text();
  } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || /spreadsheet|excel/.test(file.type)) {
    kind = 'xlsx'; text = await extractWorkbook(file);
  } else if (name.endsWith('.pdf') || file.type === 'application/pdf') {
    kind = 'pdf'; text = await extractPdf(file);
  } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) {
    kind = 'image';
    const { extractImageTextLocally } = await import('./documentImport');
    text = await extractImageTextLocally(file, onProgress);
  } else if (name.endsWith('.txt') || file.type.startsWith('text/')) {
    kind = 'text'; text = await file.text();
  } else {
    throw new Error('Unsupported file. Use PDF, CSV, XLS/XLSX, TXT, or an image.');
  }
  const parsed = (kind === 'csv' || kind === 'xlsx')
    ? (() => { try { const result = parseReconciliationCsv(text, file.name); return { records: result.records, warnings: result.warnings }; }
      catch (error) { return { records: [], warnings: [error instanceof Error ? error.message : 'Structured data could not be imported.'] }; } })()
    : recordImport(text, file.name);
  return { text, records: parsed.records, warnings: parsed.warnings, kind };
}
