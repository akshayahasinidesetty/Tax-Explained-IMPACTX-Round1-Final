import type { BatchFinding, ReconciliationRecord } from './reconciliationBatch';

export interface ReconciliationPdfReportInput {
  generatedAt: string;
  title?: string;
  leftLabel: string;
  rightLabel: string;
  leftCount: number;
  rightCount: number;
  tolerance: number;
  findings: BatchFinding[];
}

const money = (n: number) => `Rs. ${n.toFixed(2)}`;
const ascii = (value: unknown) => String(value ?? '')
  .normalize('NFKD')
  .replace(/[^\x20-\x7E]/g, '?')
  .replace(/[\\()]/g, '\\$&');
const wrap = (value: string, width = 88) => {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (current && `${current} ${word}`.length > width) { lines.push(current); current = word; }
    else current = current ? `${current} ${word}` : word;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
};

/** Creates a dependency-free, printable PDF report using the standard Helvetica fonts. */
export function createReconciliationPdf(input: ReconciliationPdfReportInput): Uint8Array {
  const unresolved = input.findings.filter(f => f.status !== 'RESOLVED' && f.status !== 'DISMISSED').length;
  const lines: Array<{ text: string; bold?: boolean }> = [
    { text: input.title ?? 'TaxClarity Reconciliation Report', bold: true },
    { text: 'Educational prototype report - not a tax filing, audit opinion, or legal determination.' },
    { text: `Generated: ${input.generatedAt}` },
    { text: '' },
    { text: 'SUMMARY', bold: true },
    { text: `Source A: ${input.leftLabel}` },
    { text: `Source B: ${input.rightLabel}` },
    { text: `Records in Source A: ${input.leftCount}` },
    { text: `Records in Source B: ${input.rightCount}` },
    { text: `Amount tolerance: ${money(input.tolerance)}` },
    { text: `Findings: ${input.findings.length} total; ${unresolved} need further review.` },
    { text: `High severity: ${input.findings.filter(f => f.severity === 'HIGH').length}; warnings: ${input.findings.filter(f => f.severity === 'WARNING').length}; info: ${input.findings.filter(f => f.severity === 'INFO').length}` },
    { text: '' },
    { text: 'FINDINGS AND SOURCE EVIDENCE', bold: true },
  ];
  if (!input.findings.length) lines.push({ text: 'No findings were produced for the selected records and tolerance.' });
  input.findings.forEach((f, index) => {
    lines.push({ text: `${index + 1}. ${f.type} | ${f.severity} | ${f.status} | confidence ${Math.round(f.confidence * 100)}%`, bold: true });
    lines.push({ text: `   ${f.explanation}` });
    lines.push({ text: `   Difference: ${money(f.delta)} | Finding ID: ${f.id}` });
    f.evidence.forEach(e => lines.push({ text: `   Evidence: ${e}` }));
    lines.push({ text: '' });
  });
  lines.push({ text: 'IMPORTANT LIMITATIONS', bold: true });
  [
    'A mismatch is a review prompt, not proof that any record is wrong, omitted, or fraudulent.',
    'OCR and imported fields can be incomplete or inaccurate. Verify every record against its original document.',
    'This report contains only the data supplied to this local workflow and is not a complete tax computation.',
    'No data is uploaded by the report generator. The report is downloaded to the current device.',
  ].forEach(text => lines.push({ text: `- ${text}` }));

  const pageLines: Array<Array<{ text: string; bold?: boolean }>> = [];
  let page: Array<{ text: string; bold?: boolean }> = [];
  for (const line of lines) {
    const wrapped = wrap(line.text, 94);
    for (const segment of wrapped) {
      if (page.length >= 47) { pageLines.push(page); page = []; }
      page.push({ text: segment, bold: line.bold });
    }
  }
  if (page.length || !pageLines.length) pageLines.push(page);

  const objects: string[] = [];
  const addObj = (source: string) => { objects.push(source); return objects.length; };
  const catalogId = addObj('');
  const pagesId = addObj('');
  const regularFontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const boldFontId = addObj('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
  const pageIds: number[] = [];
  for (const pageContent of pageLines) {
    let stream = 'BT\n/F1 9 Tf\n48 794 Td\n';
    pageContent.forEach((line, i) => {
      if (i > 0) stream += '0 -15 Td\n';
      if (line.bold) stream += '/F2 10 Tf\n'; else stream += '/F1 9 Tf\n';
      stream += `(${ascii(line.text)}) Tj\n`;
    });
    stream += 'ET\n';
    const streamId = addObj(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
    const pageId = addObj(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  let pdf = '%PDF-1.4\n%TaxClarity\n';
  const offsets = [0];
  objects.forEach((obj, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${obj}\nendobj\n`; });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(offset => { pdf += `${String(offset).padStart(10, '0')} 00000 n \n`; });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

export function reconciliationFindingsToCsv(findings: BatchFinding[]): string {
  const headers = ['finding_id', 'type', 'severity', 'status', 'confidence', 'delta', 'explanation', 'evidence', 'record_ids', 'sources', 'created_at'];
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`; // protect spreadsheet apps from formula injection
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows = findings.map(f => [f.id, f.type, f.severity, f.status, f.confidence, f.delta, f.explanation, f.evidence.join(' | '), f.records.map(r => r.id).join(' | '), f.records.map(r => r.source).join(' | '), f.createdAt]);
  return [headers, ...rows].map(row => row.map(quote).join(',')).join('\r\n');
}

export function structuredRecordsToCsv(records: ReconciliationRecord[]): string {
  const headers = ['id', 'source', 'employerOrPayer', 'reference', 'period', 'date', 'category', 'amount', 'documentId'];
  const quote = (value: unknown) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`; // protect spreadsheet apps from formula injection
    return `"${text.replace(/"/g, '""')}"`;
  };
  return [headers, ...records.map(r => headers.map(h => (r as unknown as Record<string, unknown>)[h]))]
    .map(row => row.map(quote).join(',')).join('\r\n');
}
