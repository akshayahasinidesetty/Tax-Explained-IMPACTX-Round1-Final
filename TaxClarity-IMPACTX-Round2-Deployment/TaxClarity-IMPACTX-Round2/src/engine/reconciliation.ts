import type { Freshness, LineItem, TaxDocument } from '../models/Document';

export const RULESET_VERSION = 'SYNTH-RECON-2026.2';
export const SYNTHETIC_RULE_LABEL = 'SYNTHETIC RULE — DEMO ONLY — NOT OFFICIAL';
export type DiscrepancyType = 'ROUNDING' | 'TIMING' | 'MISSING_RECORD' | 'SOURCE_CORRECTION' | 'IMPLAUSIBLE' | 'INTERNAL_CONTRADICTION' | 'VERSION_CONFLICT';
export interface Discrepancy {
  id: string; type: DiscrepancyType; delta: number; explanation: string; whatIsWrong: string;
  whyItMatters: string; nextAction: string; confidence: number; confidenceBasis: string;
  source: string; freshness: Freshness; autoAccepted: false; requiresHumanOverride: true;
  evidence: { label: string; value: string }[]; docIds: string[]; ruleVersion: string;
}
export interface ReconciliationContext { now: string; source: string; }
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
function validAmount(n: number, name: string): void {
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a finite, non-negative number.`);
}
function freshness(now: string, issueDate: string): Freshness {
  const nowMs = Date.parse(now), issueMs = Date.parse(issueDate);
  if (!Number.isFinite(nowMs) || !Number.isFinite(issueMs)) throw new Error('Invalid reference or issue date.');
  const ageDays = Math.max(0, (nowMs - issueMs) / 86400000);
  const tier = ageDays <= 30 ? 'FRESH' : ageDays <= 120 ? 'AGING' : 'STALE';
  return { asOf: now, ageDays: round2(ageDays), tier, label: `${tier} — issued ${issueDate}` };
}
function makeIssue(input: Omit<Discrepancy, 'autoAccepted'|'requiresHumanOverride'|'ruleVersion'>): Discrepancy {
  return { ...input, autoAccepted: false, requiresHumanOverride: true, ruleVersion: RULESET_VERSION };
}
export function compareAmounts(a: number, b: number, context: ReconciliationContext): Discrepancy | null {
  validAmount(a, 'First amount'); validAmount(b, 'Second amount');
  if (!Number.isFinite(Date.parse(context.now))) throw new Error('Invalid reference date.');
  const delta = round2(a - b);
  if (delta === 0) return null;
  return makeIssue({
    id: `DIFF-${Math.abs(delta).toFixed(2)}-${a}-${b}`, type: 'INTERNAL_CONTRADICTION', delta,
    explanation: 'The two source values differ; this comparison does not determine which value is legally correct.',
    whatIsWrong: `Source A is ₹${a.toFixed(2)} and Source B is ₹${b.toFixed(2)}.`,
    whyItMatters: 'Using either value without checking source, period, and correction history may produce an incomplete or incorrect draft.',
    nextAction: 'Compare reporting period and source documents; request a corrected statement or professional review if unresolved.',
    confidence: 1, confidenceBasis: 'Exact arithmetic comparison only; no conclusion about tax meaning.', source: context.source,
    freshness: { asOf: context.now, ageDays: 0, tier: 'FRESH', label: 'Reference date supplied by the user' },
    evidence: [{label:'Source A', value:a.toFixed(2)}, {label:'Source B', value:b.toFixed(2)}], docIds: [],
  });
}
export function validateDocument(doc: TaxDocument, now: string): Discrepancy | null {
  const total = doc.statedTotal;
  validAmount(total, 'Document stated total');
  for (const line of doc.lineItems) {
    if (!Number.isFinite(line.amount)) throw new Error(`Line ${line.id} has an invalid amount.`);
    if (line.amount < 0 && line.category !== 'DEDUCTION') throw new Error(`Line ${line.id} has a negative amount not allowed for ${line.category}.`);
  }
  const computed = round2(doc.lineItems.filter((x: LineItem) => x.includeInTotal !== false && x.category !== 'TDS').reduce((sum, x) => sum + x.amount, 0));
  const delta = round2(total - computed);
  if (delta === 0) return null;
  return makeIssue({
    id: `DOC-TOTAL-${doc.docId}`, type:'INTERNAL_CONTRADICTION', delta,
    explanation:'The stated document total differs from the included line items.',
    whatIsWrong:`Stated total ₹${total.toFixed(2)}; recomputed included income/amount lines ₹${computed.toFixed(2)}.`,
    whyItMatters:'Totals may use a different inclusion policy, or the document may contain an entry error. TDS is excluded from this total.',
    nextAction:'Check the source document’s total definition and line-item inclusion policy before correcting anything.',
    confidence:1, confidenceBasis:'Deterministic arithmetic; interpretation of source total remains uncertain.',
    source:`Document ${doc.docId}`, freshness:freshness(now, doc.issueDate), evidence:[{label:'Stated total',value:total.toFixed(2)},{label:'Included line sum (TDS excluded)',value:computed.toFixed(2)}], docIds:[doc.docId],
  });
}
export function explainPossibleTimingMatch(a: LineItem, b: LineItem, now: string, source: string): Discrepancy | null {
  validAmount(a.amount, 'Amount A'); validAmount(b.amount, 'Amount B');
  if (!a.period || !b.period || a.amount !== b.amount || a.period === b.period) return null;
  const monthA = /^\d{4}-(0[1-9]|1[0-2])$/.test(a.period), monthB = /^\d{4}-(0[1-9]|1[0-2])$/.test(b.period);
  if (!monthA || !monthB) throw new Error('Periods must use YYYY-MM format.');
  return makeIssue({id:`TIMING-${a.id}-${b.id}`,type:'TIMING',delta:0,
    explanation:'Equal amounts appear in different months. This is only a possible timing explanation, not proof.',
    whatIsWrong:`“${a.label}” is recorded in ${a.period}; “${b.label}” is recorded in ${b.period}.`,
    whyItMatters:'Period differences may explain a mismatch, but could also be unrelated entries.',
    nextAction:'Check transaction dates and the reporting entity’s corrected statement; leave unresolved until evidence supports a classification.',
    confidence:0.4,confidenceBasis:'Amount and month comparison only; no supporting transaction evidence.',source,
    freshness:{asOf:now,ageDays:0,tier:'FRESH',label:'Checked at supplied reference time'},evidence:[{label:a.label,value:`₹${a.amount} (${a.period})`},{label:b.label,value:`₹${b.amount} (${b.period})`}],docIds:[]});
}
