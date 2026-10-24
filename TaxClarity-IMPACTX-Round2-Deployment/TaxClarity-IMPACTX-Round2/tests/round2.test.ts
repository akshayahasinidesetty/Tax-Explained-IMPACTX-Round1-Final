import assert from 'node:assert/strict';
import { computeLiability, compareRuleVersions, SYNTH_RULES_V1, SYNTH_RULES_V2, validateRuleSet } from '../src/engine/rules';
import { reconcileRecords, DocumentVersionRegistry } from '../src/engine/reconciliationBatch';
import { parseReconciliationCsv } from '../src/engine/documentImport';
import { compareIndiaRegimesAY2026_27 } from '../src/engine/indiaTaxAY2026_27';

let passed = 0;
function test(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`PASS ${String(passed).padStart(2, '0')} ${name}`); }
  catch (error) { console.error(`FAIL ${name}:`, error); throw error; }
}
const now = '2026-10-24T10:00:00+05:30';
const rec = (id: string, source: string, amount: number, period = '2026-04', reference = 'PAY-1') => ({
  id, source, employerOrPayer: 'Fictional Example Employer', reference, period, category: 'SALARY', amount,
});

test('zero income produces zero liability', () => assert.equal(computeLiability(0, SYNTH_RULES_V1).total, 0));
test('negative gross income is rejected', () => assert.throws(() => computeLiability(-1, SYNTH_RULES_V1)));
test('NaN gross income is rejected', () => assert.throws(() => computeLiability(Number.NaN, SYNTH_RULES_V1)));
test('infinite gross income is rejected', () => assert.throws(() => computeLiability(Infinity, SYNTH_RULES_V1)));
test('synthetic rule set validates', () => assert.equal(validateRuleSet(SYNTH_RULES_V1), undefined));
test('descending slab thresholds are rejected', () => assert.throws(() => validateRuleSet({ ...SYNTH_RULES_V1, slabs: [{ upTo: 500000, rate: .1 }, { upTo: 400000, rate: .2 }, { upTo: null, rate: .3 }] })));
test('open-ended slab must be last', () => assert.throws(() => validateRuleSet({ ...SYNTH_RULES_V1, slabs: [{ upTo: null, rate: .2 }, { upTo: 500000, rate: .3 }] })));
test('negative rebate is rejected', () => assert.throws(() => validateRuleSet({ ...SYNTH_RULES_V1, rebateMax: -1 })));
test('cess rate above 100 percent is rejected', () => assert.throws(() => validateRuleSet({ ...SYNTH_RULES_V1, cessRate: 1.2 })));
test('rule comparison returns both rule IDs', () => { const r = compareRuleVersions(900000, SYNTH_RULES_V1, SYNTH_RULES_V2); assert.equal(r.before.ruleId, 'SYNTH-V1'); assert.equal(r.after.ruleId, 'SYNTH-V2'); });
test('rule comparison carries synthetic disclaimer', () => assert.match(compareRuleVersions(900000, SYNTH_RULES_V1, SYNTH_RULES_V2).notice, /not official/i));
test('exactly matching records produce no findings', () => assert.deepEqual(reconcileRecords([rec('a', 'Form 16', 50000)], [rec('b', 'AIS', 50000)], now), []));
test('mismatched amount creates a finding with correct delta', () => { const f = reconcileRecords([rec('a', 'Form 16', 50000)], [rec('b', 'AIS', 48000)], now); assert.equal(f[0].type, 'AMOUNT_MISMATCH'); assert.equal(f[0].delta, 2000); });
test('mismatch is never automatically resolved', () => assert.equal(reconcileRecords([rec('a', 'A', 100)], [rec('b', 'B', 90)], now)[0].status, 'NEEDS_REVIEW'));
test('missing counterpart is identified', () => assert.equal(reconcileRecords([rec('a', 'A', 100)], [], now)[0].type, 'MISSING_RECORD'));
test('unmatched right-side record is identified', () => assert.equal(reconcileRecords([], [rec('b', 'B', 100)], now)[0].type, 'UNMATCHED'));
test('equal amount under another period raises period conflict', () => assert.equal(reconcileRecords([rec('a', 'A', 100, '2026-04')], [rec('b', 'B', 100, '2026-05')], now)[0].type, 'PERIOD_CONFLICT'));
test('duplicate-looking source rows are flagged', () => assert.ok(reconcileRecords([rec('a', 'A', 100), rec('a2', 'A', 100)], [], now).some(f => f.type === 'POTENTIAL_DUPLICATE')));
test('negative record amount is rejected', () => assert.throws(() => reconcileRecords([rec('a', 'A', -2)], [], now)));
test('non-finite record amount is rejected', () => assert.throws(() => reconcileRecords([rec('a', 'A', Number.NaN)], [], now)));
test('missing required record fields are rejected', () => assert.throws(() => reconcileRecords([{ ...rec('a', 'A', 1), source: '' }], [], now)));
test('invalid reference timestamp is rejected', () => assert.throws(() => reconcileRecords([], [], 'not-a-date')));
test('negative tolerance is rejected', () => assert.throws(() => reconcileRecords([], [], now, -1)));
test('tolerance can suppress a small difference', () => assert.deepEqual(reconcileRecords([rec('a', 'A', 100)], [rec('b', 'B', 99.5)], now, 1), []));
test('corrected version preserves prior version and activates replacement', () => {
  const r = new DocumentVersionRegistry<{ amount: number }>();
  r.add('employer-1', 'v1', { amount: 840000 }, now);
  r.add('employer-1', 'v2', { amount: 825000 }, now, 'v1');
  const list = r.list('employer-1');
  assert.equal(list.length, 2); assert.equal(list.find(v => v.id === 'v1')?.active, false); assert.equal(list.find(v => v.id === 'v2')?.active, true);
});
test('prior version can be restored', () => {
  const r = new DocumentVersionRegistry<number>(); r.add('d', 'v1', 1, now); r.add('d', 'v2', 2, now, 'v1'); r.restore('v1');
  assert.equal(r.list('d').find(v => v.id === 'v1')?.active, true); assert.equal(r.list('d').find(v => v.id === 'v2')?.active, false);
});
test('duplicate version ID is rejected', () => { const r = new DocumentVersionRegistry<number>(); r.add('d', 'v1', 1, now); assert.throws(() => r.add('d', 'v1', 2, now)); });
test('unknown superseded version is rejected', () => { const r = new DocumentVersionRegistry<number>(); assert.throws(() => r.add('d', 'v2', 2, now, 'missing')); });
test('invalid upload timestamp is rejected', () => { const r = new DocumentVersionRegistry<number>(); assert.throws(() => r.add('d', 'v1', 1, 'bad-date')); });


test('official AY 2026-27 configuration identifies its source year', () => {
  const r = compareIndiaRegimesAY2026_27({ salaryIncome: 800000, residentIndividual: true });
  assert.equal(r.assessmentYear, 'AY 2026-27'); assert.equal(r.financialYear, 'FY 2025-26');
});
test('new regime resident rebate can reduce tax to zero at ₹12 lakh taxable income', () => {
  const r = compareIndiaRegimesAY2026_27({ salaryIncome: 1275000, residentIndividual: true });
  assert.equal(r.newRegime.taxableIncome, 1200000); assert.equal(r.newRegime.totalTax, 0);
});
test('new regime marginal relief limits tax just above ₹12 lakh taxable income', () => {
  const r = compareIndiaRegimesAY2026_27({ salaryIncome: 1275001, residentIndividual: true });
  assert.ok(r.newRegime.totalTax <= 1.04);
});
test('non-resident is not given section 87A rebate', () => {
  const r = compareIndiaRegimesAY2026_27({ salaryIncome: 800000, residentIndividual: false });
  assert.ok(r.newRegime.totalTax > 0);
});
test('negative salary is rejected by the limited official engine', () => assert.throws(() => compareIndiaRegimesAY2026_27({ salaryIncome: -1, residentIndividual: true })));
test('income at ₹50 lakh threshold is rejected because surcharge is unsupported', () => assert.throws(() => compareIndiaRegimesAY2026_27({ salaryIncome: 5075000, residentIndividual: true })));
test('comparison reports a lower regime or equality, never a fake label', () => {
  const r = compareIndiaRegimesAY2026_27({ salaryIncome: 900000, oldRegimeEligibleDeductions: 150000, residentIndividual: true });
  assert.ok(['new', 'old', 'equal'].includes(r.lowerEstimate));
});
test('CSV parser imports a valid structured record', () => {
  const r = parseReconciliationCsv('id,employer,reference,period,category,amount\na,Example,PAY-1,2026-04,SALARY,50000', 'Synthetic CSV');
  assert.equal(r.records.length, 1); assert.equal(r.records[0].amount, 50000);
});
test('CSV parser handles quoted comma in employer name', () => {
  const r = parseReconciliationCsv('id,employer,reference,period,category,amount\na,"Example, Inc.",PAY-1,2026-04,SALARY,50000', 'CSV');
  assert.equal(r.records[0].employerOrPayer, 'Example, Inc.');
});
test('CSV parser rejects missing required header', () => assert.throws(() => parseReconciliationCsv('name,amount\na,1', 'CSV')));
test('CSV parser rejects unclosed quote', () => assert.throws(() => parseReconciliationCsv('id,employer,period,category,amount\na,"bad,2026-04,SALARY,10', 'CSV')));
test('CSV parser skips negative amount with warning', () => {
  const r = parseReconciliationCsv('id,employer,period,category,amount\na,Example,2026-04,SALARY,-10\nb,Example,2026-04,SALARY,10', 'CSV');
  assert.equal(r.records.length, 1); assert.equal(r.warnings.length, 1);
});
test('CSV parser rejects empty file', () => assert.throws(() => parseReconciliationCsv('', 'CSV')));
test('CSV parser rejects oversized text', () => assert.throws(() => parseReconciliationCsv('x'.repeat(5000001), 'CSV')));
test('CSV parser skips malformed column count', () => {
  const r = parseReconciliationCsv('id,employer,period,category,amount\na,Example,2026-04,SALARY,10,EXTRA\nb,Example,2026-04,SALARY,20', 'CSV');
  assert.equal(r.records.length, 1); assert.equal(r.warnings.length, 1);
});
console.log(`Round 2 deterministic suite: ${passed} tests passed (this line is emitted only if all assertions succeed).`);
