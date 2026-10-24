/**
 * Deterministic structured-record reconciliation.
 * Findings are review prompts, never a legal conclusion or fraud assessment.
 */
export type ReviewStatus = 'NEEDS_REVIEW' | 'UNDER_REVIEW' | 'MORE_EVIDENCE' | 'RESOLVED' | 'DISMISSED';
export type FindingType = 'AMOUNT_MISMATCH' | 'MISSING_RECORD' | 'UNMATCHED' | 'POTENTIAL_DUPLICATE' | 'PERIOD_CONFLICT';
export interface ReconciliationRecord {
  id: string;
  source: string;
  employerOrPayer: string;
  reference?: string;
  period: string;
  date?: string;
  category: string;
  amount: number;
  documentId?: string;
}
export interface BatchFinding {
  id: string;
  type: FindingType;
  severity: 'INFO' | 'WARNING' | 'HIGH';
  confidence: number;
  explanation: string;
  records: ReconciliationRecord[];
  delta: number;
  status: ReviewStatus;
  createdAt: string;
  evidence: string[];
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const norm = (s?: string) => (s ?? '').trim().toLocaleLowerCase('en-IN').replace(/\s+/g, ' ');
function validateRecord(r: ReconciliationRecord): void {
  if (!r || !r.id?.trim() || !r.source?.trim() || !r.category?.trim() || !r.period?.trim()) {
    throw new Error('Each record requires an ID, source, category, and reporting period.');
  }
  if (!Number.isFinite(r.amount) || r.amount < 0) throw new Error(`Record ${r.id} must have a finite, non-negative amount.`);
  if (r.date && !Number.isFinite(Date.parse(r.date))) throw new Error(`Record ${r.id} has an invalid date.`);
}
const matchKey = (r: ReconciliationRecord) =>
  [norm(r.employerOrPayer), norm(r.reference), norm(r.period), norm(r.category)].join('|');
const evidence = (r: ReconciliationRecord) =>
  `${r.source} · ${r.id} · ${r.period} · ₹${round2(r.amount).toFixed(2)}${r.documentId ? ` · document ${r.documentId}` : ''}`;

export function reconcileRecords(
  left: ReconciliationRecord[],
  right: ReconciliationRecord[],
  now: string,
  tolerance = 0,
): BatchFinding[] {
  if (!Number.isFinite(Date.parse(now))) throw new Error('A valid reference timestamp is required.');
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error('Tolerance must be a finite, non-negative amount.');
  [...left, ...right].forEach(validateRecord);
  const findings: BatchFinding[] = [];
  const rightByKey = new Map<string, ReconciliationRecord[]>();
  for (const r of right) rightByKey.set(matchKey(r), [...(rightByKey.get(matchKey(r)) ?? []), r]);
  const usedRightIds = new Set<string>();
  const finding = (
    type: FindingType, records: ReconciliationRecord[], delta: number,
    explanation: string, severity: BatchFinding['severity'], confidence: number,
  ) => findings.push({
    id: `REC-${String(findings.length + 1).padStart(3, '0')}`,
    type, records, delta: round2(delta), explanation, severity, confidence,
    status: 'NEEDS_REVIEW', createdAt: new Date(now).toISOString(),
    evidence: records.map(evidence),
  });

  // Detect duplicate-looking rows in either source without silently discarding them.
  for (const rows of [left, right]) {
    const seen = new Map<string, ReconciliationRecord>();
    for (const r of rows) {
      const k = `${matchKey(r)}|${round2(r.amount)}`;
      const prior = seen.get(k);
      if (prior) finding('POTENTIAL_DUPLICATE', [prior, r], 0,
        'Two records in the same source share payer, reference, period, category, and amount. Confirm whether this is a duplicate or a legitimate repeated transaction.',
        'WARNING', 0.85);
      else seen.set(k, r);
    }
  }

  for (const a of left) {
    const candidates = rightByKey.get(matchKey(a)) ?? [];
    const b = candidates.find(x => !usedRightIds.has(x.id));
    if (b) {
      usedRightIds.add(b.id);
      const delta = round2(a.amount - b.amount);
      if (Math.abs(delta) > tolerance) finding('AMOUNT_MISMATCH', [a, b], delta,
        `The matched records differ by ₹${Math.abs(delta).toFixed(2)}. Check source documents and reporting periods; this comparison cannot determine which value is correct.`,
        'WARNING', 1);
      continue;
    }
    const periodCandidate = right.find(x =>
      !usedRightIds.has(x.id) &&
      norm(x.employerOrPayer) === norm(a.employerOrPayer) &&
      norm(x.category) === norm(a.category) &&
      round2(x.amount) === round2(a.amount));
    if (periodCandidate) {
      usedRightIds.add(periodCandidate.id);
      finding('PERIOD_CONFLICT', [a, periodCandidate], 0,
        'The same amount appears under a different reporting period. Verify transaction dates and corrected statements before classifying it.',
        'WARNING', 0.55);
    } else {
      finding('MISSING_RECORD', [a], a.amount,
        'No matching record was found in the comparison source. Confirm source coverage; absence alone does not establish which source is correct.',
        'HIGH', 0.75);
    }
  }
  for (const b of right) {
    if (usedRightIds.has(b.id)) continue;
    if (left.some(a => matchKey(a) === matchKey(b))) continue;
    finding('UNMATCHED', [b], b.amount,
      'This record has no counterpart in the first source. Check whether the sources cover the same period and income categories.',
      'INFO', 0.65);
  }
  return findings;
}

export interface DocumentVersion<T> {
  id: string; documentKey: string; version: number; content: T;
  uploadedAt: string; supersedes?: string; active: boolean;
}
/**
 * In-memory reference registry for tests/demo only. It is not durable storage
 * and must not be used as a multi-user production document store.
 */
export class DocumentVersionRegistry<T> {
  private versions: DocumentVersion<T>[] = [];
  add(documentKey: string, id: string, content: T, uploadedAt: string, supersedes?: string): DocumentVersion<T> {
    if (!documentKey.trim() || !id.trim() || !Number.isFinite(Date.parse(uploadedAt))) {
      throw new Error('Document key, version ID, and valid upload timestamp are required.');
    }
    if (this.versions.some(v => v.id === id)) throw new Error('Document version ID already exists.');
    const prior = supersedes ? this.versions.find(v => v.id === supersedes && v.documentKey === documentKey) : undefined;
    if (supersedes && !prior) throw new Error('Superseded version was not found for this document.');
    const siblings = this.versions.filter(v => v.documentKey === documentKey);
    const entry: DocumentVersion<T> = {
      id, documentKey, content, uploadedAt,
      version: siblings.reduce((n, v) => Math.max(n, v.version), 0) + 1,
      supersedes, active: true,
    };
    siblings.forEach(v => { v.active = false; });
    this.versions.push(entry);
    return { ...entry };
  }
  list(documentKey: string): DocumentVersion<T>[] {
    return this.versions.filter(v => v.documentKey === documentKey).map(v => ({ ...v }));
  }
  restore(id: string): DocumentVersion<T> {
    const target = this.versions.find(v => v.id === id);
    if (!target) throw new Error('Document version not found.');
    this.versions.filter(v => v.documentKey === target.documentKey).forEach(v => { v.active = v.id === id; });
    return { ...target, active: true };
  }
}
