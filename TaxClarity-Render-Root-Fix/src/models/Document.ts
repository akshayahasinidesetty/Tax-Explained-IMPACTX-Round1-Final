// SECTION B — document model with lineage, internal validation and diffing.
// ============================================================
export type TaxPeriod = 'FY2025-26';

export type FreshnessTier = 'FRESH' | 'AGING' | 'STALE';

export interface Freshness {
  asOf: string;
  ageDays: number;
  tier: FreshnessTier;
  label: string;
}

export type LineCategory = 'SALARY' | 'TDS' | 'INTEREST' | 'FREELANCE' | 'DEDUCTION' | 'OTHER';

export type DocumentKind =
  | 'FORM16'
  | 'AIS'
  | 'PAYSLIP_SET'
  | 'BANK_INTEREST'
  | 'INVOICE_BOOK'
  | 'PORTAL_PREFILL';

export interface LineItem {
  id: string;
  label: string;
  amount: number;
  /** "YYYY-MM" — used for timing / period-mapping reconciliation. */
  period?: string;
  category: LineCategory;
  /** TDS lines are reported but not part of the income total. Default true. */
  includeInTotal?: boolean;
}

export interface DocumentInit {
  docId: string;
  versionId: string;
  issueDate: string;
  taxPeriod: TaxPeriod;
  sourceEntity: string;
  uploadTime: string;
  supersedesId?: string | null;
  lineItems: LineItem[];
  statedTotal: number;
  kind: DocumentKind;
  /** PAN / TAN style identifier, synthetic only. */
  panOrTan?: string;
}

export interface InternalContradiction {
  statedTotal: number;
  computedSum: number;
  delta: number;
  message: string;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

export interface LineChange {
  id: string;
  label: string;
  from: number | null;
  to: number | null;
  delta: number;
  kind: 'ADDED' | 'REMOVED' | 'CHANGED';
}

export interface DocumentDiff {
  oldDocId: string;
  newDocId: string;
  fieldChanges: FieldChange[];
  lineChanges: LineChange[];
  amountDelta: number;
  /** Full chain of supersession, oldest first. */
  lineage: string[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Named TaxDocument (not `Document`) to avoid shadowing the DOM `Document`
 * type. Exported alias `Document` is provided for spec parity.
 */
export class TaxDocument {
  readonly docId: string;
  readonly versionId: string;
  readonly issueDate: string;
  readonly taxPeriod: TaxPeriod;
  readonly sourceEntity: string;
  readonly uploadTime: string;
  readonly supersedesId: string | null;
  readonly lineItems: readonly LineItem[];
  readonly statedTotal: number;
  readonly kind: DocumentKind;
  readonly panOrTan?: string;

  /** Versioning state (see DOCUMENT_MACHINE). */
  state: 'UPLOADED' | 'SCANNED' | 'VALIDATED' | 'ACCEPTED_FOR_CALC' | 'SUPERSEDED';
  isSuperseded: boolean;
  supersessionLineage: string[];

  constructor(
    init: DocumentInit,
    opts?: {
      state?: TaxDocument['state'];
      isSuperseded?: boolean;
      lineage?: string[];
    },
  ) {
    this.docId = init.docId;
    this.versionId = init.versionId;
    this.issueDate = init.issueDate;
    this.taxPeriod = init.taxPeriod;
    this.sourceEntity = init.sourceEntity;
    this.uploadTime = init.uploadTime;
    this.supersedesId = init.supersedesId ?? null;
    this.lineItems = init.lineItems;
    this.statedTotal = init.statedTotal;
    this.kind = init.kind;
    this.panOrTan = init.panOrTan;

    this.state = opts?.state ?? 'UPLOADED';
    this.isSuperseded = opts?.isSuperseded ?? false;
    this.supersessionLineage = opts?.lineage ?? (init.supersedesId ? [init.supersedesId] : []);
  }

  /** Sum of line items that participate in the document total. */
  computeSum(): number {
    return round2(
      this.lineItems
        .filter((li) => li.includeInTotal !== false)
        .reduce((acc, li) => acc + li.amount, 0),
    );
  }

  /** statedTotal vs computedSum. */
  validateInternal():
    | { ok: true; discrepancy: null }
    | { ok: false; discrepancy: InternalContradiction } {
    const computedSum = this.computeSum();
    const delta = round2(this.statedTotal - computedSum);
    if (Math.abs(delta) < 0.005) return { ok: true, discrepancy: null };
    return {
      ok: false,
      discrepancy: {
        statedTotal: this.statedTotal,
        computedSum,
        delta,
        message: `Stated total ${this.statedTotal} != sum of line items ${computedSum} (delta ${delta}).`,
      },
    };
  }

  /** Freshness of the document relative to a reference instant. */
  freshnessAt(nowIso: string): Freshness {
    const ageDays = Math.max(0, (Date.parse(nowIso) - Date.parse(this.issueDate)) / 86_400_000);
    const rounded = Math.round(ageDays * 10) / 10;
    const tier: FreshnessTier = rounded <= 30 ? 'FRESH' : rounded <= 120 ? 'AGING' : 'STALE';
    return {
      asOf: nowIso,
      ageDays: rounded,
      tier,
      label: `${tier} — issued ${this.issueDate} (${rounded} day(s) old at reference time)`,
    };
  }

  get freshness(): Freshness {
    return this.freshnessAt(new Date().toISOString());
  }

  /** Field-by-field and line-by-line diff against a previous version. */
  createDiff(oldDoc: TaxDocument): DocumentDiff {
    const fieldChanges: FieldChange[] = [];
    const pushIf = (field: string, from: string | number, to: string | number) => {
      if (String(from) !== String(to)) fieldChanges.push({ field, from: String(from), to: String(to) });
    };

    pushIf('issueDate', oldDoc.issueDate, this.issueDate);
    pushIf('sourceEntity', oldDoc.sourceEntity, this.sourceEntity);
    pushIf('versionId', oldDoc.versionId, this.versionId);
    pushIf('statedTotal', oldDoc.statedTotal, this.statedTotal);
    pushIf('computedSum', oldDoc.computeSum(), this.computeSum());

    const oldLines = new Map(oldDoc.lineItems.map((li) => [li.id, li]));
    const newLines = new Map(this.lineItems.map((li) => [li.id, li]));
    const ids = Array.from(new Set([...oldLines.keys(), ...newLines.keys()])).sort();

    const lineChanges: LineChange[] = [];
    for (const id of ids) {
      const a = oldLines.get(id);
      const b = newLines.get(id);
      if (a && !b) {
        lineChanges.push({ id, label: a.label, from: a.amount, to: null, delta: -a.amount, kind: 'REMOVED' });
      } else if (!a && b) {
        lineChanges.push({ id, label: b.label, from: null, to: b.amount, delta: b.amount, kind: 'ADDED' });
      } else if (a && b && a.amount !== b.amount) {
        lineChanges.push({
          id,
          label: b.label,
          from: a.amount,
          to: b.amount,
          delta: round2(b.amount - a.amount),
          kind: 'CHANGED',
        });
      }
    }

    return {
      oldDocId: oldDoc.docId,
      newDocId: this.docId,
      fieldChanges,
      lineChanges,
      amountDelta: round2(this.statedTotal - oldDoc.statedTotal),
      lineage: [...oldDoc.supersessionLineage, oldDoc.docId],
    };
  }
}

/** Spec parity alias. Use `TaxDocument` in code to avoid DOM shadowing. */
export type Document = TaxDocument;
