import { compareIndiaRegimesAY2026_27 } from './indiaTaxAY2026_27';
import { parseReconciliationCsv } from './documentImport';
import { DocumentVersionRegistry, reconcileRecords, type ReconciliationRecord } from './reconciliationBatch';
import { compareAmounts } from './reconciliation';

export interface DemoTestResult { id: string; scenario: string; input: string; expected: string; actual: string; passed: boolean; }
const now = '2026-10-24T10:00:00+05:30';
const row = (id: string, source: string, amount: number, period = '2026-04'): ReconciliationRecord => ({
  id, source, employerOrPayer: 'Fictional Employer', reference: 'REF-1', period, category: 'SALARY', amount,
});
export function runDemoTests(): DemoTestResult[] {
  const results: DemoTestResult[] = [];
  const check = (id: string, scenario: string, input: string, expected: string, fn: () => string, matcher: (actual: string) => boolean) => {
    try { const actual = fn(); results.push({ id, scenario, input, expected, actual, passed: matcher(actual) }); }
    catch (e) { const actual = `ERROR: ${e instanceof Error ? e.message : 'Unknown error'}`; results.push({ id, scenario, input, expected, actual, passed: matcher(actual) }); }
  };
  check('TC-01','Exact match','₹50,000 vs ₹50,000','No finding',()=>String(reconcileRecords([row('a','Source A',50000)],[row('b','Source B',50000)],now).length),v=>v==='0');
  check('TC-02','Amount mismatch','₹50,000 vs ₹48,000','Mismatch delta ₹2,000',()=>{const f=reconcileRecords([row('a','A',50000)],[row('b','B',48000)],now);return `${f[0]?.type}; delta ₹${f[0]?.delta}`;},v=>v==='AMOUNT_MISMATCH; delta ₹2000');
  check('TC-03','Missing source record','One source has ₹12,000','MISSING_RECORD',()=>reconcileRecords([row('a','A',12000)],[],now)[0].type,v=>v==='MISSING_RECORD');
  check('TC-04','Unmatched source record','Only comparison source has a row','UNMATCHED',()=>reconcileRecords([],[row('b','B',12000)],now)[0].type,v=>v==='UNMATCHED');
  check('TC-05','Duplicate-looking rows','Two identical rows in one source','Potential duplicate warning',()=>reconcileRecords([row('a','A',100),row('a2','A',100)],[],now).some(f=>f.type==='POTENTIAL_DUPLICATE')?'Detected':'Not detected',v=>v==='Detected');
  check('TC-06','Reporting period conflict','Same payer/category/amount; different month','PERIOD_CONFLICT',()=>reconcileRecords([row('a','A',100,'2026-04')],[row('b','B',100,'2026-05')],now)[0].type,v=>v==='PERIOD_CONFLICT');
  check('TC-07','Corrected statement','₹8,40,000 replaced by ₹8,25,000','Both versions preserved; corrected version active',()=>{const r=new DocumentVersionRegistry<number>();r.add('employer','v1',840000,now);r.add('employer','v2',825000,now,'v1');const x=r.list('employer');return `${x.length} versions; active=${x.find(v=>v.active)?.content}`;},v=>v==='2 versions; active=825000');
  check('TC-08','Restore prior document','Restore original after correction','Original becomes active',()=>{const r=new DocumentVersionRegistry<number>();r.add('d','v1',1,now);r.add('d','v2',2,now,'v1');r.restore('v1');return String(r.list('d').find(v=>v.active)?.id);},v=>v==='v1');
  check('TC-09','Invalid negative amount','Amount = -1','Rejected',()=>{try{reconcileRecords([row('a','A',-1)],[],now);return 'Accepted';}catch{return 'Rejected';}},v=>v==='Rejected');
  check('TC-10','Invalid timestamp','Timestamp = invalid','Rejected',()=>{try{reconcileRecords([],[],'invalid');return 'Accepted';}catch{return 'Rejected';}},v=>v==='Rejected');
  check('TC-11','Tolerance handling','₹100 vs ₹99.50; tolerance ₹1','No finding',()=>String(reconcileRecords([row('a','A',100)],[row('b','B',99.5)],now,1).length),v=>v==='0');
  check('TC-12','CSV import','One valid salary row','One record imported',()=>String(parseReconciliationCsv('id,employer,period,category,amount\nx,Example,2026-04,SALARY,50000','demo.csv').records.length),v=>v==='1');
  check('TC-13','Malformed CSV header','Required amount header absent','Rejected',()=>{try{parseReconciliationCsv('name,value\nx,1','demo.csv');return 'Accepted';}catch{return 'Rejected';}},v=>v==='Rejected');
  check('TC-14','CSV negative row','Negative amount row','Skipped with warning',()=>{const r=parseReconciliationCsv('id,employer,period,category,amount\nx,Example,2026-04,SALARY,-1\ny,Example,2026-04,SALARY,1','demo.csv');return `${r.records.length} valid; ${r.warnings.length} warning`;},v=>v==='1 valid; 1 warning');
  check('TC-15','Zero-income calculation','Salary ₹0','Zero estimated liability',()=>String(compareIndiaRegimesAY2026_27({salaryIncome:0,residentIndividual:true}).newRegime.totalTax),v=>v==='0');
  check('TC-16','New-regime rebate boundary','Salary ₹12,75,000; ₹75,000 standard deduction','Taxable ₹12 lakh; tax ₹0',()=>{const r=compareIndiaRegimesAY2026_27({salaryIncome:1275000,residentIndividual:true}).newRegime;return `taxable ₹${r.taxableIncome}; tax ₹${r.totalTax}`;},v=>v==='taxable ₹1200000; tax ₹0');
  check('TC-17','Negative income validation','Salary = -₹1','Rejected',()=>{try{compareIndiaRegimesAY2026_27({salaryIncome:-1,residentIndividual:true});return 'Accepted';}catch{return 'Rejected';}},v=>v==='Rejected');
  check('TC-18','Original example difference','₹8,40,000 vs ₹8,25,000','Difference ₹15,000; source not selected',()=>{const d=compareAmounts(840000,825000,{now,source:'synthetic demo'});return `₹${Math.abs(d?.delta??0)}; autoAccepted=${d?.autoAccepted}`;},v=>v==='₹15000; autoAccepted=false');
  check('TC-19','Rule version provenance','Calculate with official AY 2026-27 limited engine','Rule version attached',()=>compareIndiaRegimesAY2026_27({salaryIncome:800000,residentIndividual:true}).newRegime.ruleId,v=>v==='IN-AY2026-27-NEW');
  check('TC-20','Reconciliation review state','Mismatch should require human review','NEEDS_REVIEW',()=>reconcileRecords([row('a','A',100)],[row('b','B',90)],now)[0].status,v=>v==='NEEDS_REVIEW');
  return results;
}
