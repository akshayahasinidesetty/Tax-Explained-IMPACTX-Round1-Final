'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import { processLocalDocument } from '@/engine/documentPipeline';
import { parseReconciliationCsv } from '@/engine/documentImport';
import { reconcileRecords, type BatchFinding, type ReconciliationRecord } from '@/engine/reconciliationBatch';
import { createReconciliationPdf, reconciliationFindingsToCsv, structuredRecordsToCsv } from '@/engine/pdfReport';

type SourceSide = 'A' | 'B';
type IntakeStatus = 'processing' | 'ready' | 'error';
interface IntakeDocument {
  id: string;
  name: string;
  side: SourceSide;
  kind?: string;
  status: IntakeStatus;
  progress: number;
  text: string;
  records: ReconciliationRecord[];
  warnings: string[];
  error?: string;
}
interface ManualRecord extends ReconciliationRecord { side: SourceSide; }

const money = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount);
const newId = () => `DOC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const saveFile = (name: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export default function DocumentsPage() {
  const [uploadSide, setUploadSide] = useState<SourceSide>('A');
  const [documents, setDocuments] = useState<IntakeDocument[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([]);
  const [findings, setFindings] = useState<BatchFinding[] | null>(null);
  const [tolerance, setTolerance] = useState('0');
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const [manual, setManual] = useState({ side: 'A' as SourceSide, payer: '', reference: '', period: '2025-26', category: 'SALARY', amount: '', date: '' });

  const allRecords = useMemo(() => [
    ...documents.flatMap(doc => doc.records),
    ...manualRecords,
  ], [documents, manualRecords]);
  const recordsA = useMemo(() => allRecords.filter(record => {
    const doc = documents.find(item => item.id === record.documentId);
    const manualRow = manualRecords.find(item => item.id === record.id);
    return manualRow ? manualRow.side === 'A' : doc?.side === 'A';
  }), [allRecords, documents, manualRecords]);
  const recordsB = useMemo(() => allRecords.filter(record => {
    const doc = documents.find(item => item.id === record.documentId);
    const manualRow = manualRecords.find(item => item.id === record.id);
    return manualRow ? manualRow.side === 'B' : doc?.side === 'B';
  }), [allRecords, documents, manualRecords]);
  const busy = documents.some(doc => doc.status === 'processing');

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    const picked = Array.from(fileList);
    setMessage('Processing selected files in this browser. Imported values must still be reviewed.');
    setFindings(null);
    const staged = picked.map(file => ({
      id: newId(), name: file.name, side: uploadSide, status: 'processing' as const, progress: 0,
      text: '', records: [], warnings: [],
    }));
    setDocuments(previous => [...previous, ...staged]);
    await Promise.all(picked.map(async (file, index) => {
      const id = staged[index].id;
      try {
        const result = await processLocalDocument(file, progress => {
          setDocuments(previous => previous.map(doc => doc.id === id ? { ...doc, progress: Math.max(0, Math.min(100, Math.round(progress * 100))) } : doc));
        });
        const rows = result.records.map((record, rowIndex) => ({
          ...record,
          id: `${id}-${rowIndex + 1}-${record.id}`,
          source: file.name,
          documentId: id,
        }));
        setDocuments(previous => previous.map(doc => doc.id === id ? {
          ...doc, status: 'ready', progress: 100, kind: result.kind, text: result.text,
          records: rows, warnings: result.warnings,
        } : doc));
        setExpandedDoc(id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'File processing failed.';
        setDocuments(previous => previous.map(doc => doc.id === id ? { ...doc, status: 'error', progress: 0, error: reason } : doc));
      }
    }));
  };

  const updateDoc = (id: string, updater: (doc: IntakeDocument) => IntakeDocument) => {
    setFindings(null);
    setDocuments(previous => previous.map(doc => doc.id === id ? updater(doc) : doc));
  };

  const addManualRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amount = Number(manual.amount);
    if (!manual.payer.trim() || !manual.period.trim() || !manual.category.trim() || !Number.isFinite(amount) || amount < 0) {
      setMessage('Enter a payer, period, category, and valid non-negative amount.'); return;
    }
    const id = `MAN-${newId()}`;
    setManualRecords(previous => [...previous, {
      id, side: manual.side, source: `Manual entry — Source ${manual.side}`, employerOrPayer: manual.payer.trim(),
      reference: manual.reference.trim() || undefined, period: manual.period.trim(), category: manual.category.trim().toUpperCase(),
      amount, date: manual.date.trim() || undefined, documentId: 'MANUAL',
    }]);
    setFindings(null);
    setManual(current => ({ ...current, payer: '', reference: '', amount: '', date: '' }));
    setMessage(`Record added to Source ${manual.side}; verify it against the original document.`);
  };

  const runReconciliation = () => {
    setMessage('');
    try {
      if (!recordsA.length || !recordsB.length) throw new Error('Add at least one structured record to both Source A and Source B.');
      const tol = Number(tolerance);
      if (!Number.isFinite(tol) || tol < 0) throw new Error('Tolerance must be a non-negative number.');
      const now = new Date().toISOString();
      const result = reconcileRecords(recordsA, recordsB, now, tol);
      setFindings(result);
      setMessage(`Reconciliation complete: ${recordsA.length} Source A rows and ${recordsB.length} Source B rows reviewed. Every finding requires human verification.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Reconciliation could not run.'); }
  };

  const downloadPdf = () => {
    if (!findings) return;
    const report = createReconciliationPdf({
      generatedAt: new Date().toISOString(), title: 'TaxClarity Document Reconciliation Report',
      leftLabel: [...new Set(recordsA.map(record => record.source))].join(', ') || 'Source A',
      rightLabel: [...new Set(recordsB.map(record => record.source))].join(', ') || 'Source B',
      leftCount: recordsA.length, rightCount: recordsB.length, tolerance: Number(tolerance), findings,
    });
    saveFile('taxclarity-reconciliation-report.pdf', new Blob([report.buffer as ArrayBuffer], { type: 'application/pdf' }));
  };
  const downloadCsv = (kind: 'findings' | 'records') => {
    const content = kind === 'findings' && findings ? reconciliationFindingsToCsv(findings) : structuredRecordsToCsv(allRecords);
    saveFile(kind === 'findings' ? 'taxclarity-findings.csv' : 'taxclarity-reviewed-records.csv', new Blob([content], { type: 'text/csv;charset=utf-8' }));
  };
  const downloadTemplate = () => {
    const template = 'id,employer,reference,period,category,amount,date,documentId\nR-001,Example Employer,REF-001,2025-26,SALARY,840000,2026-03-31,DEMO-001\n';
    saveFile('taxclarity-record-import-template.csv', new Blob([template], { type: 'text/csv;charset=utf-8' }));
  };

  return <main className="auth-shell" style={{ alignItems: 'start', paddingTop: 26 }}>
    <section className="auth-card" style={{ width: 'min(100%, 1120px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <Link href="/">← TaxClarity home</Link>
        <button type="button" className="auth-button" style={{ width: 'auto' }} onClick={downloadTemplate}>Download CSV template</button>
      </div>
      <h1>Document processing and reconciliation</h1>
      <p>Choose documents, extract text or structured rows, review/correct the extracted evidence, reconcile Source A against Source B, and export a report. Processing is performed in this browser; the workflow does not upload files to the TaxClarity server.</p>
      <div className="auth-notice" style={{ marginTop: 16 }}><b>Review gate:</b> PDF text and OCR may be incomplete; spreadsheet cells may be misread or absent; no extracted value is treated as verified. This remains an educational prototype and is not a tax filing engine.</div>

      <section style={{ marginTop: 25, border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 20, marginTop: 0 }}>1. Import documents</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={{ display: 'grid', gap: 6, minWidth: 180, flex: '0 0 auto' }}>Assign new files to
            <select value={uploadSide} onChange={event => setUploadSide(event.target.value as SourceSide)} style={{ padding: 11, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)', color: 'var(--text)' }}>
              <option value="A">Source A — first set</option><option value="B">Source B — comparison set</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6, flex: '1 1 360px' }}>Select one or more files
            <input type="file" multiple accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff,.txt" onChange={event => { void processFiles(event.target.files); event.target.value = ''; }} style={{ padding: 9, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)' }} />
          </label>
        </div>
        <p style={{ fontSize: 13 }}>Supported: CSV, XLS/XLSX (first worksheet), text-based PDF, TXT, and image OCR. File limit: 25 MB. OCR can take time and may produce errors.</p>
        {busy && <p role="status">Processing documents locally…</p>}
        {!documents.length && <p style={{ padding: 18, border: '1px dashed var(--line)', borderRadius: 10, textAlign: 'center' }}>No documents selected yet.</p>}
        <div style={{ display: 'grid', gap: 12 }}>
          {documents.map(doc => <article key={doc.id} style={{ padding: 14, border: '1px solid var(--line)', borderRadius: 11 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ flex: '1 1 200px', overflowWrap: 'anywhere' }}>{doc.name}</strong>
              <select aria-label={`Assign ${doc.name} to a source`} value={doc.side} onChange={event => updateDoc(doc.id, item => ({ ...item, side: event.target.value as SourceSide }))} style={{ padding: 7, border: '1px solid var(--line)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text)' }}><option value="A">Source A</option><option value="B">Source B</option></select>
              <span className={doc.status === 'error' ? 'auth-error' : doc.status === 'ready' ? 'auth-success' : 'auth-notice'} style={{ padding: '5px 8px', fontSize: 12 }}>{doc.status === 'ready' ? `Ready · ${doc.records.length} rows` : doc.status === 'processing' ? `Processing ${doc.progress}%` : 'Processing failed'}</span>
              <button type="button" onClick={() => { setDocuments(previous => previous.filter(item => item.id !== doc.id)); setFindings(null); }} aria-label={`Remove ${doc.name}`} style={{ padding: '5px 8px' }}>Remove</button>
            </div>
            {doc.error && <p className="auth-error" role="alert">{doc.error}</p>}
            {doc.warnings.map((warning, index) => <p key={index} className="auth-notice" style={{ marginTop: 8 }}>{warning}</p>)}
            {doc.status === 'ready' && <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}>{expandedDoc === doc.id ? 'Hide extraction review' : 'Review extracted text and rows'}</button>
              <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)' }}>Text extracted: {doc.text.length.toLocaleString()} characters</span>
            </div>}
            {doc.status === 'ready' && expandedDoc === doc.id && <div style={{ marginTop: 14, display: 'grid', gap: 12 }}>
              <label style={{ display: 'grid', gap: 6, fontWeight: 650 }}>Extracted text — edit/correct the working copy before using it
                <textarea rows={8} value={doc.text} onChange={event => updateDoc(doc.id, item => ({ ...item, text: event.target.value }))} style={{ width: '100%', padding: 10, border: '1px solid var(--line)', borderRadius: 9, background: 'var(--surface)', color: 'var(--text)', fontSize: 13 }} />
              </label>
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><strong>Structured records ({doc.records.length})</strong><button type="button" onClick={() => {
                  try {
                    const result = parseReconciliationCsv(doc.text, doc.name);
                    const rows = result.records.map((record, index) => ({ ...record, id: `${doc.id}-review-${index + 1}`, source: doc.name, documentId: doc.id }));
                    updateDoc(doc.id, item => ({ ...item, records: rows, warnings: result.warnings }));
                    setMessage(`Re-imported ${rows.length} reviewed rows from ${doc.name}.`);
                  } catch (error) { setMessage(error instanceof Error ? error.message : 'Edited text could not be converted to structured rows.'); }
                }}>Re-parse edited text as CSV</button></div>
                {doc.records.length > 0 ? <div style={{ overflowX: 'auto', marginTop: 8 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['ID', 'Payer', 'Period', 'Category', 'Amount', 'Action'].map(header => <th key={header} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid var(--line)' }}>{header}</th>)}</tr></thead><tbody>{doc.records.map(record => <tr key={record.id}><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.id}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.employerOrPayer}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.period}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.category}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{money(record.amount)}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}><button type="button" onClick={() => updateDoc(doc.id, item => ({ ...item, records: item.records.filter(row => row.id !== record.id) }))}>Remove row</button></td></tr>)}</tbody></table></div> : <p>No structured rows found. Add records manually below using the source document as evidence.</p>}
              </div>
            </div>}
          </article>)}
        </div>
      </section>

      <section style={{ marginTop: 20, border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 20, marginTop: 0 }}>2. Correct or add structured records</h2>
        <p>Use this form when a PDF or OCR output is unstructured. Type values only after checking them against the source evidence.</p>
        <form onSubmit={addManualRecord} className="auth-form" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', marginTop: 12 }}>
          <label>Source<select value={manual.side} onChange={event => setManual(v => ({ ...v, side: event.target.value as SourceSide }))}><option value="A">Source A</option><option value="B">Source B</option></select></label>
          <label>Payer / employer<input value={manual.payer} required onChange={event => setManual(v => ({ ...v, payer: event.target.value }))} /></label>
          <label>Reference ID<input value={manual.reference} onChange={event => setManual(v => ({ ...v, reference: event.target.value }))} /></label>
          <label>Period<input value={manual.period} required onChange={event => setManual(v => ({ ...v, period: event.target.value }))} placeholder="2025-26 or YYYY-MM" /></label>
          <label>Category<input value={manual.category} required onChange={event => setManual(v => ({ ...v, category: event.target.value }))} /></label>
          <label>Amount (INR)<input type="number" min="0" step="0.01" value={manual.amount} required onChange={event => setManual(v => ({ ...v, amount: event.target.value }))} /></label>
          <label>Date (optional)<input type="date" value={manual.date} onChange={event => setManual(v => ({ ...v, date: event.target.value }))} /></label>
          <button type="submit" className="auth-button">Add reviewed record</button>
        </form>
        {manualRecords.length > 0 && <div style={{ overflowX: 'auto', marginTop: 14 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr>{['Source', 'Payer', 'Period', 'Category', 'Amount', 'Action'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8, borderBottom: '2px solid var(--line)' }}>{h}</th>)}</tr></thead><tbody>{manualRecords.map(record => <tr key={record.id}><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.side}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.employerOrPayer}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.period}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{record.category}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}>{money(record.amount)}</td><td style={{ padding: 8, borderBottom: '1px solid var(--line)' }}><button type="button" onClick={() => { setManualRecords(v => v.filter(x => x.id !== record.id)); setFindings(null); }}>Remove</button></td></tr>)}</tbody></table></div>}
      </section>

      <section style={{ marginTop: 20, border: '1px solid var(--line)', borderRadius: 14, padding: 18 }}>
        <h2 style={{ fontSize: 20, marginTop: 0 }}>3. Reconcile and review findings</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
          <div className="auth-notice"><b>Source A</b><br />{recordsA.length} records · {[...new Set(recordsA.map(r => r.source))].join(', ') || 'No records yet'}</div>
          <div className="auth-notice"><b>Source B</b><br />{recordsB.length} records · {[...new Set(recordsB.map(r => r.source))].join(', ') || 'No records yet'}</div>
          <label style={{ display: 'grid', gap: 6 }}>Amount tolerance (INR)<input type="number" min="0" step="0.01" value={tolerance} onChange={event => { setTolerance(event.target.value); setFindings(null); }} /></label>
        </div>
        <button type="button" className="auth-button" style={{ marginTop: 14 }} disabled={busy || running} onClick={() => { setRunning(true); try { runReconciliation(); } finally { setRunning(false); } }}>{running ? 'Reconciling…' : 'Run reconciliation'}</button>
        {message && <p role="status" className="auth-notice" style={{ marginTop: 12 }}>{message}</p>}
        {findings && <>
          <div className={findings.length ? 'auth-notice' : 'auth-success'} style={{ marginTop: 14 }}><b>{findings.length} findings</b> · {findings.filter(f => f.status !== 'RESOLVED' && f.status !== 'DISMISSED').length} still need review. No finding is automatically accepted or resolved.</div>
          {findings.length > 0 ? <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{findings.map(finding => <article key={finding.id} style={{ border: '1px solid var(--line)', padding: 12, borderRadius: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}><strong>{finding.type.replaceAll('_', ' ')}</strong><span>{finding.severity} · {Math.round(finding.confidence * 100)}% confidence · {finding.status}</span></div><p>{finding.explanation}</p><p><b>Difference:</b> {money(finding.delta)}</p><ul>{finding.evidence.map((evidence, index) => <li key={index}>{evidence}</li>)}</ul></article>)}</div> : <p>No findings were produced for these records. This does not prove tax compliance or source completeness.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}><button type="button" className="auth-button" onClick={downloadPdf}>Download PDF report</button><button type="button" onClick={() => downloadCsv('findings')}>Export findings CSV</button><button type="button" onClick={() => downloadCsv('records')}>Export structured records CSV</button></div>
        </>}
      </section>
      <p style={{ fontSize: 12, marginTop: 20, color: 'var(--muted)' }}>Privacy and scope: records and extracted text remain in this page's memory until you leave or refresh. They are not saved to an account or server. Browser file processing is not an encrypted document vault. Use fictional/test records in this prototype only.</p>
    </section>
  </main>;
}
