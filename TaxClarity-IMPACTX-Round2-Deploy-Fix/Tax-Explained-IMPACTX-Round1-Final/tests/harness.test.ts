import assert from 'node:assert/strict';
import { getDeadlineInfo } from '../src/lib/deadline';
import { compareAmounts, explainPossibleTimingMatch } from '../src/engine/reconciliation';
import { AppendOnlyLedger, verifyEntries } from '../src/lib/audit';

const context={now:'2026-10-24T10:00:00+05:30',source:'Synthetic test records'};
assert.equal(compareAmounts(100,100,context),null,'equal values should have no discrepancy');
const diff=compareAmounts(100000,99995,context);
assert.ok(diff,'a small mismatch must remain visible');
assert.equal(diff?.autoAccepted,false,'differences must never be auto-accepted');
assert.throws(()=>compareAmounts(Number.NaN,1,context),'NaN must be rejected');
assert.throws(()=>compareAmounts(-1,1,context),'negative comparison inputs must be rejected');
const timing= explainPossibleTimingMatch(
 {id:'a',label:'Salary',amount:50000,period:'2026-04',category:'SALARY'},
 {id:'b',label:'Salary',amount:50000,period:'2026-05',category:'SALARY'},context.now,'Synthetic records');
assert.equal(timing?.type,'TIMING'); assert.equal(timing?.confidence,0.4); assert.equal(timing?.autoAccepted,false);
const due=getDeadlineInfo('2026-10-24T10:00:00+05:30','2026-10-25T10:00:00+05:30');
assert.equal(due.state,'CRITICAL'); assert.match(due.explanation,/synthetic demo deadline/i);
assert.throws(()=>getDeadlineInfo('not-a-date','2026-10-25T10:00:00Z'));
const ledger=new AppendOnlyLedger('OVERRIDE');
ledger.append({machine:'OVERRIDE',entityId:'case-1',from:'DRAFT',to:'VALIDATED',reason:'income was ₹987654 and PAN ABCDE1234F',sourceDocId:'doc-1',actor:'USER',timestamp:'2026-10-24T10:00:00Z'});
const entry=ledger.all()[0];
assert.equal(entry.reason,'DEMO_TRANSITION');
assert.equal(entry.actor,'USER');
assert.equal(verifyEntries(ledger.all()).ok,true);
assert.equal(ledger.all()[0].entityId,'case-1');
console.log('PASS: 13 assertions covering mismatch safety, timing uncertainty, date validation, and audit allowlisting.');
