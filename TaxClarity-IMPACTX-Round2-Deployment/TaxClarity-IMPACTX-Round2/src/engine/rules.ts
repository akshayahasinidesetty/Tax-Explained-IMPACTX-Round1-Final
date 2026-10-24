// Synthetic rule sets. Deliberately NOT real Income Tax Act slabs.
// Used by liability estimation and by the rule-change handler.
// ============================================================
export const SYNTHETIC_RULE_LABEL = 'SYNTHETIC RULE — DEMO ONLY — NOT OFFICIAL';

export interface Slab {
  upTo: number | null;
  rate: number;
}

export interface RuleSet {
  id: string;
  label: string;
  effectiveFrom: string;
  slabs: Slab[];
  standardDeduction: number;
  rebateUpTo: number;
  rebateMax: number;
  cessRate: number;
}

export const SYNTH_RULES_V1: RuleSet = {
  id: 'SYNTH-V1',
  label: 'Synthetic rule set V1 (demo)',
  effectiveFrom: '2026-04-01',
  slabs: [
    { upTo: 350_000, rate: 0 },
    { upTo: 700_000, rate: 0.1 },
    { upTo: 1_200_000, rate: 0.2 },
    { upTo: 2_400_000, rate: 0.28 },
    { upTo: null, rate: 0.33 },
  ],
  standardDeduction: 50_000,
  rebateUpTo: 500_000,
  rebateMax: 12_500,
  cessRate: 0.04,
};

export const SYNTH_RULES_V2: RuleSet = {
  id: 'SYNTH-V2',
  label: 'Synthetic rule set V2 (demo, mid-event change)',
  effectiveFrom: '2026-07-15',
  slabs: [
    { upTo: 400_000, rate: 0 },
    { upTo: 800_000, rate: 0.1 },
    { upTo: 1_400_000, rate: 0.2 },
    { upTo: 2_400_000, rate: 0.28 },
    { upTo: null, rate: 0.33 },
  ],
  standardDeduction: 75_000,
  rebateUpTo: 700_000,
  rebateMax: 25_000,
  cessRate: 0.04,
};

export interface LiabilityStep {
  label: string;
  taxable: number;
  rate: number;
  amount: number;
}

export interface LiabilityResult {
  grossIncome: number;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  cess: number;
  total: number;
  steps: LiabilityStep[];
  ruleId: string;
  label: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** SYNTHETIC RULE — DEMO ONLY — NOT OFFICIAL. Estimate only, never a filing figure. */
export function computeLiability(grossIncome: number, rule: RuleSet): LiabilityResult {
  if (!Number.isFinite(grossIncome) || grossIncome < 0) throw new Error('Gross income must be a finite, non-negative number.');
  validateRuleSet(rule);
  const taxableIncome = Math.max(0, round2(grossIncome - rule.standardDeduction));
  const steps: LiabilityStep[] = [];
  let lower = 0;
  let slabTax = 0;

  for (const slab of rule.slabs) {
    if (taxableIncome <= lower) break;
    const upper = slab.upTo ?? Number.POSITIVE_INFINITY;
    const taxable = Math.max(0, Math.min(taxableIncome, upper) - lower);
    if (taxable > 0) {
      const amount = round2(taxable * slab.rate);
      steps.push({
        label: `${lower} → ${slab.upTo ?? '∞'} @ ${(slab.rate * 100).toFixed(0)}%`,
        taxable,
        rate: slab.rate,
        amount,
      });
      slabTax += amount;
    }
    lower = upper;
  }

  slabTax = round2(slabTax);
  const rebate = taxableIncome <= rule.rebateUpTo ? Math.min(rule.rebateMax, slabTax) : 0;
  const afterRebate = Math.max(0, slabTax - rebate);
  const cess = round2(afterRebate * rule.cessRate);
  const total = round2(afterRebate + cess);

  return {
    grossIncome,
    taxableIncome,
    slabTax,
    rebate,
    cess,
    total,
    steps,
    ruleId: rule.id,
    label: rule.label,
  };
}


/** Validate the shape of a rule set before it is used by the synthetic engine. */
export function validateRuleSet(rule: RuleSet): void {
  if (!rule?.id?.trim() || !rule.label?.trim() || !Number.isFinite(Date.parse(rule.effectiveFrom))) {
    throw new Error('Rule set requires an ID, label, and valid effective date.');
  }
  if (!Array.isArray(rule.slabs) || rule.slabs.length === 0) throw new Error('Rule set must contain at least one slab.');
  let previous = 0;
  rule.slabs.forEach((slab, index) => {
    if (!Number.isFinite(slab.rate) || slab.rate < 0 || slab.rate > 1) throw new Error(`Invalid rate in slab ${index + 1}.`);
    if (slab.upTo !== null) {
      if (!Number.isFinite(slab.upTo) || slab.upTo <= previous) throw new Error(`Slab ${index + 1} thresholds must increase.`);
      previous = slab.upTo;
    } else if (index !== rule.slabs.length - 1) {
      throw new Error('Only the final slab may be open-ended.');
    }
  });
  const fields: [string, number][] = [
    ['standard deduction', rule.standardDeduction], ['rebate threshold', rule.rebateUpTo],
    ['maximum rebate', rule.rebateMax], ['cess rate', rule.cessRate],
  ];
  for (const [name, value] of fields) {
    if (!Number.isFinite(value) || value < 0 || (name === 'cess rate' && value > 1)) {
      throw new Error(`Invalid ${name}.`);
    }
  }
}

/** Compare two synthetic rule sets. This is a simulator, not official tax guidance. */
export function compareRuleVersions(grossIncome: number, older: RuleSet, newer: RuleSet) {
  const before = computeLiability(grossIncome, older);
  const after = computeLiability(grossIncome, newer);
  return {
    grossIncome, before, after, taxDelta: round2(after.total - before.total),
    changed: before.total !== after.total,
    notice: 'Synthetic rule comparison for demonstration only; not official tax advice.',
  };
}
