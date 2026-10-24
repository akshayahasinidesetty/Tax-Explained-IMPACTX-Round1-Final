/**
 * LIMITED official-rule estimate for AY 2026-27 (FY 2025-26) only.
 * Scope: resident individual, salary plus ordinary-rate other income, no surcharge
 * (total income below ₹50 lakh), no special-rate income, and no complex reliefs.
 * Old-regime eligible deductions are a user-confirmed aggregate, not eligibility advice.
 * Rules/source reviewed 2026-10-24. Not a filing engine or professional advice.
 */
export const INDIA_RULES_AY2026_27 = {
  financialYear: 'FY 2025-26',
  assessmentYear: 'AY 2026-27',
  verifiedOn: '2026-10-24',
  source: 'https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr-2/itr-2-faqs',
  budgetSource: 'https://www.indiabudget.gov.in/budget2025-26/doc/Finance_Bill.pdf',
  regimes: {
    new: {
      id: 'IN-AY2026-27-NEW',
      slabs: [{ upTo: 400000, rate: 0 }, { upTo: 800000, rate: .05 }, { upTo: 1200000, rate: .10 }, { upTo: 1600000, rate: .15 }, { upTo: 2000000, rate: .20 }, { upTo: 2400000, rate: .25 }, { upTo: null, rate: .30 }],
      salaryStandardDeduction: 75000, rebateThreshold: 1200000, rebateMax: 60000,
    },
    old: {
      id: 'IN-AY2026-27-OLD',
      slabs: [{ upTo: 250000, rate: 0 }, { upTo: 500000, rate: .05 }, { upTo: 1000000, rate: .20 }, { upTo: null, rate: .30 }],
      salaryStandardDeduction: 50000, rebateThreshold: 500000, rebateMax: 12500,
    },
  },
  cessRate: .04,
} as const;

export type AgeBand = 'under60' | '60to79' | '80plus';
export interface IndiaTaxInput {
  salaryIncome: number;
  otherOrdinaryIncome?: number;
  /** Eligible old-regime deductions/exemptions already independently checked by the user. */
  oldRegimeEligibleDeductions?: number;
  residentIndividual: boolean;
  ageBand?: AgeBand;
}
export interface IndiaRegimeResult {
  ruleId: string;
  taxableIncome: number;
  slabTax: number;
  rebate: number;
  cess: number;
  totalTax: number;
  estimatedEffectiveRate: number;
  notes: string[];
}
export interface IndiaTaxComparison {
  financialYear: string;
  assessmentYear: string;
  verifiedOn: string;
  newRegime: IndiaRegimeResult;
  oldRegime: IndiaRegimeResult;
  lowerEstimate: 'new' | 'old' | 'equal';
  limitations: string[];
}
const round = (n: number) => Math.round(n);
function validNonNegative(name: string, n: number): void {
  if (!Number.isFinite(n) || n < 0) throw new Error(`${name} must be a finite, non-negative amount.`);
}
function slabTax(income: number, slabs: ReadonlyArray<{ upTo: number | null; rate: number }>): number {
  let lower = 0, tax = 0;
  for (const slab of slabs) {
    if (income <= lower) break;
    const upper = slab.upTo ?? Number.POSITIVE_INFINITY;
    tax += Math.max(0, Math.min(income, upper) - lower) * slab.rate;
    lower = upper;
  }
  return round(tax);
}
function oldSlabsFor(age: AgeBand | undefined) {
  if (age === '60to79') return [{ upTo: 300000, rate: 0 }, { upTo: 500000, rate: .05 }, { upTo: 1000000, rate: .20 }, { upTo: null, rate: .30 }] as const;
  if (age === '80plus') return [{ upTo: 500000, rate: 0 }, { upTo: 1000000, rate: .20 }, { upTo: null, rate: .30 }] as const;
  return INDIA_RULES_AY2026_27.regimes.old.slabs;
}
function calculateOne(input: IndiaTaxInput, regime: 'new' | 'old'): IndiaRegimeResult {
  const cfg = INDIA_RULES_AY2026_27.regimes[regime];
  const salaryDeduction = Math.min(input.salaryIncome, cfg.salaryStandardDeduction);
  const oldDeductions = regime === 'old' ? (input.oldRegimeEligibleDeductions ?? 0) : 0;
  const taxableIncome = Math.max(0, round(input.salaryIncome + (input.otherOrdinaryIncome ?? 0) - salaryDeduction - oldDeductions));
  if (taxableIncome >= 5000000) throw new Error('This prototype does not calculate surcharge or surcharge marginal relief. Use official tools/professional review for total income of ₹50 lakh or more.');
  const slabs = regime === 'old' ? oldSlabsFor(input.residentIndividual ? input.ageBand : 'under60') : cfg.slabs;
  const taxBeforeRebate = slabTax(taxableIncome, slabs);
  let rebate = 0;
  if (input.residentIndividual && taxableIncome <= cfg.rebateThreshold) {
    rebate = Math.min(taxBeforeRebate, cfg.rebateMax);
  } else if (regime === 'new' && input.residentIndividual && taxableIncome > cfg.rebateThreshold) {
    // Marginal relief: post-rebate tax should not exceed income above ₹12 lakh.
    rebate = Math.min(taxBeforeRebate, Math.max(0, taxBeforeRebate - (taxableIncome - cfg.rebateThreshold)));
  }
  const taxAfterRebate = Math.max(0, taxBeforeRebate - rebate);
  const cess = round(taxAfterRebate * INDIA_RULES_AY2026_27.cessRate);
  const totalTax = taxAfterRebate + cess;
  return {
    ruleId: cfg.id, taxableIncome, slabTax: taxBeforeRebate, rebate, cess, totalTax,
    estimatedEffectiveRate: taxableIncome > 0 ? totalTax / taxableIncome : 0,
    notes: [
      'Estimate assumes ordinary-rate income only and no surcharge.',
      regime === 'old' ? 'Old-regime deduction total is user-entered and not independently verified by this tool.' : 'Only the new-regime standard deduction is applied; other deductions/exemptions are not modelled.',
      'Rebate and marginal-relief eligibility depends on taxpayer and income conditions; verify before relying on this estimate.',
    ],
  };
}
export function compareIndiaRegimesAY2026_27(input: IndiaTaxInput): IndiaTaxComparison {
  validNonNegative('Salary income', input.salaryIncome);
  validNonNegative('Other ordinary income', input.otherOrdinaryIncome ?? 0);
  validNonNegative('Old-regime eligible deductions', input.oldRegimeEligibleDeductions ?? 0);
  if ((input.oldRegimeEligibleDeductions ?? 0) > input.salaryIncome + (input.otherOrdinaryIncome ?? 0)) {
    throw new Error('Old-regime deductions cannot exceed the entered income total. Verify the amounts before proceeding.');
  }
  const newRegime = calculateOne(input, 'new');
  const oldRegime = calculateOne(input, 'old');
  return {
    financialYear: INDIA_RULES_AY2026_27.financialYear,
    assessmentYear: INDIA_RULES_AY2026_27.assessmentYear,
    verifiedOn: INDIA_RULES_AY2026_27.verifiedOn,
    newRegime, oldRegime,
    lowerEstimate: newRegime.totalTax < oldRegime.totalTax ? 'new' : oldRegime.totalTax < newRegime.totalTax ? 'old' : 'equal',
    limitations: [
      'Scope is limited to AY 2026-27 (FY 2025-26), resident/non-resident individual assumptions supplied by user, salary and ordinary-rate other income.',
      'Special-rate income, surcharge and surcharge marginal relief, agricultural income integration, capital gains, business income, and detailed eligibility calculations are not supported.',
      'This is an educational estimate, not an official return or professional tax advice.',
    ],
  };
}
