// SECTION A — three SEPARATE state machines. No single "status" field.
// ============================================================
import { auditLog, type AuditEntry, type MachineName } from './audit';

export type DeadlineState = 'SAFE' | 'AT_RISK_6D' | 'CRITICAL' | 'OVERDUE';
export type DraftState =
  | 'DRAFT'
  | 'VALIDATED'
  | 'SUBMITTED_SIM'
  | 'ACKNOWLEDGED_SIM'
  | 'DEFECT_NOTICE'
  | 'RESPONSE';
export type DocumentState =
  | 'UPLOADED'
  | 'SCANNED'
  | 'VALIDATED'
  | 'ACCEPTED_FOR_CALC'
  | 'SUPERSEDED';

export const SYNTHETIC_RULE_LABEL = 'SYNTHETIC RULE — DEMO ONLY — NOT OFFICIAL';

export interface MachineSpec<S extends string> {
  name: MachineName;
  states: readonly S[];
  initial: S;
  /** Legal transitions only. Anything else is rejected and never written. */
  transitions: Readonly<Record<S, readonly S[]>>;
  /** Terminal states cannot be left. */
  terminal: readonly S[];
  labelEn: string;
  labelHi: string;
}

export const DEADLINE_MACHINE: MachineSpec<DeadlineState> = {
  name: 'DEADLINE',
  states: ['SAFE', 'AT_RISK_6D', 'CRITICAL', 'OVERDUE'],
  initial: 'SAFE',
  transitions: {
    SAFE: ['AT_RISK_6D', 'CRITICAL', 'OVERDUE'],
    AT_RISK_6D: ['SAFE', 'CRITICAL', 'OVERDUE'],
    CRITICAL: ['AT_RISK_6D', 'OVERDUE'],
    OVERDUE: [], // terminal
  },
  terminal: ['OVERDUE'],
  labelEn: 'Deadline proximity (48h buffer before 31 July)',
  labelHi: 'समय-सीमा की निकटता (31 जुलाई से 48 घंटे पहले का बफर)',
};

export const DRAFT_MACHINE: MachineSpec<DraftState> = {
  name: 'DRAFT',
  states: ['DRAFT', 'VALIDATED', 'SUBMITTED_SIM', 'ACKNOWLEDGED_SIM', 'DEFECT_NOTICE', 'RESPONSE'],
  initial: 'DRAFT',
  transitions: {
    DRAFT: ['VALIDATED'],
    VALIDATED: ['DRAFT', 'SUBMITTED_SIM'], // -> DRAFT = "needs revalidation"
    SUBMITTED_SIM: ['ACKNOWLEDGED_SIM', 'DEFECT_NOTICE'],
    ACKNOWLEDGED_SIM: ['DEFECT_NOTICE'],
    DEFECT_NOTICE: ['RESPONSE'],
    RESPONSE: ['SUBMITTED_SIM', 'ACKNOWLEDGED_SIM'],
  },
  terminal: [],
  labelEn: 'Return draft lifecycle (simulates u/s 139(9) and 143(1))',
  labelHi: 'रिटर्न ड्राफ्ट चक्र (धारा 139(9) और 143(1) का अनुकरण)',
};

export const DOCUMENT_MACHINE: MachineSpec<DocumentState> = {
  name: 'DOCUMENT',
  states: ['UPLOADED', 'SCANNED', 'VALIDATED', 'ACCEPTED_FOR_CALC', 'SUPERSEDED'],
  initial: 'UPLOADED',
  transitions: {
    UPLOADED: ['SCANNED', 'SUPERSEDED'],
    SCANNED: ['VALIDATED', 'SUPERSEDED'],
    VALIDATED: ['ACCEPTED_FOR_CALC', 'SUPERSEDED'],
    ACCEPTED_FOR_CALC: ['VALIDATED', 'SUPERSEDED'],
    SUPERSEDED: [], // terminal — lineage is preserved forever
  },
  terminal: ['SUPERSEDED'],
  labelEn: 'Document lifecycle',
  labelHi: 'दस्तावेज़ चक्र',
};

export type MachineSpecs = {
  DEADLINE: MachineSpec<DeadlineState>;
  DRAFT: MachineSpec<DraftState>;
  DOCUMENT: MachineSpec<DocumentState>;
};

export const MACHINES: MachineSpecs = {
  DEADLINE: DEADLINE_MACHINE,
  DRAFT: DRAFT_MACHINE,
  DOCUMENT: DOCUMENT_MACHINE,
};

export function canTransition(machine: MachineName, from: string, to: string): boolean {
  const spec = MACHINES[machine];
  const allowed = (spec.transitions as Record<string, readonly string[]>)[from];
  return Array.isArray(allowed) && allowed.includes(to);
}

export function nextLegalStates(machine: MachineName, from: string): readonly string[] {
  return (MACHINES[machine].transitions as Record<string, readonly string[]>)[from] ?? [];
}

export interface TransitionRequest {
  machine: MachineName;
  entityId: string;
  from: string;
  to: string;
  reason: string;
  sourceDocId: string | null;
  actor: string;
  at?: string;
}

export interface TransitionResult {
  ok: boolean;
  entry?: AuditEntry;
  error?: string;
}

/**
 * The ONLY way a machine state changes. Illegal transitions are rejected
 * and never reach the audit log (the attempt is reported to the caller,
 * which surfaces it to the user).
 */
export function transition(req: TransitionRequest): TransitionResult {
  if (req.from === req.to) {
    return { ok: false, error: `No-op transition rejected: ${req.machine} already in ${req.from}.` };
  }
  if (!canTransition(req.machine, req.from, req.to)) {
    const legal = nextLegalStates(req.machine, req.from);
    return {
      ok: false,
      error: `Illegal transition ${req.machine}: ${req.from} → ${req.to}. Legal from ${req.from}: ${
        legal.length ? legal.join(', ') : '(none — terminal state)'
      }`,
    };
  }
  if (req.machine === 'DOCUMENT' && !req.sourceDocId) {
    return { ok: false, error: 'DOCUMENT transitions require a sourceDocId for lineage.' };
  }

  const entry = auditLog.append({
    machine: req.machine,
    entityId: req.entityId,
    from: req.from,
    to: req.to,
    reason: req.reason,
    sourceDocId: req.sourceDocId,
    actor: req.actor,
    timestamp: req.at,
  });

  return { ok: true, entry };
}

/**
 * Deadline proximity with a 48-hour safety buffer.
 * SYNTHETIC RULE — DEMO ONLY — NOT OFFICIAL
 */
export const SYNTHETIC_DUE_DATE_ISO = '2026-07-31T23:59:59.000Z';
export const CRITICAL_BUFFER_HOURS = 48;
export const AT_RISK_WINDOW_DAYS = 6;

export function deriveDeadlineState(
  nowIso: string,
  dueIso: string = SYNTHETIC_DUE_DATE_ISO,
  bufferHours: number = CRITICAL_BUFFER_HOURS,
): DeadlineState {
  const remainingMs = Date.parse(dueIso) - Date.parse(nowIso);
  if (remainingMs < 0) return 'OVERDUE';
  if (remainingMs <= bufferHours * 3_600_000) return 'CRITICAL';
  if (remainingMs <= AT_RISK_WINDOW_DAYS * 86_400_000) return 'AT_RISK_6D';
  return 'SAFE';
}

export function explainDeadlineState(state: DeadlineState, nowIso: string): string {
  const days = (Date.parse(SYNTHETIC_DUE_DATE_ISO) - Date.parse(nowIso)) / 86_400_000;
  const rounded = Math.round(days * 10) / 10;
  switch (state) {
    case 'SAFE':
      return `${rounded} day(s) remaining — outside the 6-day risk window.`;
    case 'AT_RISK_6D':
      return `${rounded} day(s) remaining — inside the 6-day risk window.`;
    case 'CRITICAL':
      return `${rounded} day(s) remaining — inside the 48-hour buffer. Act now.`;
    case 'OVERDUE':
      return `Due date passed ${Math.abs(rounded)} day(s) ago. Original-return window closed; a belated/updated path would be a separate workflow.`;
  }
}
