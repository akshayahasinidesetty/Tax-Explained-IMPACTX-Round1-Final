import { sha256Hex } from './sha256';
export type MachineName = 'DEADLINE' | 'DRAFT' | 'DOCUMENT';
export type LedgerId = MachineName | 'OVERRIDE';
export const GENESIS_HASH = '0'.repeat(64);
export interface AuditEntry { seq:number; timestamp:string; machine:LedgerId; entityId:string; from:string; to:string; reason:string; sourceDocId:string|null; actor:string; hashPrev:string; hash:string; redactions:0; }
export interface AuditAppendInput { machine:LedgerId; entityId:string; from:string; to:string; reason:string; sourceDocId:string|null; actor:string; timestamp?:string; }
const STATES = new Set(['SAFE','AT_RISK_6D','CRITICAL','OVERDUE','DRAFT','VALIDATED','SUBMITTED_SIM','ACKNOWLEDGED_SIM','DEFECT_NOTICE','RESPONSE','UPLOADED','SCANNED','ACCEPTED_FOR_CALC','SUPERSEDED','OVERRIDE']);
const REASONS = new Set(['USER_CONFIRMED','SOURCE_CORRECTED','VALIDATION_PASSED','VALIDATION_FAILED','DEMO_TRANSITION','HUMAN_ESCALATION','VERSION_SUPERSEDED','CONFLICT_DETECTED']);
const SAFE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function safeState(s:string):string { return STATES.has(s) ? s : 'REDACTED_STATE'; }
function safeId(s:string):string { return SAFE_ID.test(s) ? s : 'REDACTED_REF'; }
function canonical(e:Omit<AuditEntry,'hash'|'redactions'>):string { return JSON.stringify({seq:e.seq,timestamp:e.timestamp,machine:e.machine,entityId:e.entityId,from:e.from,to:e.to,reason:e.reason,sourceDocId:e.sourceDocId,actor:e.actor,hashPrev:e.hashPrev}); }
export function redactFinancialFiguresInText(_text:string):{text:string;redactions:number} { return {text:'DETAILS_OMITTED',redactions:0}; }
export function verifyEntries(entries:readonly AuditEntry[]):{ok:boolean;brokenAt:number|null} {
 let prev=GENESIS_HASH;
 for(let i=0;i<entries.length;i++){ const e=entries[i]; if(e.seq!==i+1||e.hashPrev!==prev) return {ok:false,brokenAt:i}; const {hash,redactions,...body}=e; if(sha256Hex(canonical(body))!==hash)return {ok:false,brokenAt:i}; prev=hash; }
 return {ok:true,brokenAt:null};
}
export class AppendOnlyLedger {
 readonly id:LedgerId; private entries:AuditEntry[]=[]; private listeners=new Set<()=>void>();
 constructor(id:LedgerId){this.id=id;}
 append(input:AuditAppendInput):AuditEntry {
  const timestamp=input.timestamp??new Date().toISOString(); if(!Number.isFinite(Date.parse(timestamp))) throw new Error('Invalid audit timestamp');
  const prev=this.entries[this.entries.length-1]; const body={seq:this.entries.length+1,timestamp,machine:input.machine,entityId:safeId(input.entityId),from:safeState(input.from),to:safeState(input.to),reason:REASONS.has(input.reason)?input.reason:'DEMO_TRANSITION',sourceDocId:input.sourceDocId?safeId(input.sourceDocId):null,actor:['USER','SYSTEM','REVIEWER'].includes(input.actor)?input.actor:'USER',hashPrev:prev?.hash??GENESIS_HASH};
  const entry:AuditEntry=Object.freeze({...body,hash:sha256Hex(canonical(body)),redactions:0 as const}); this.entries.push(entry); this.listeners.forEach(fn=>fn()); return entry;
 }
 all():readonly AuditEntry[]{return this.entries;} latest():AuditEntry|null{return this.entries.at(-1)??null;} verify(){return verifyEntries(this.entries);} subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
}
export const auditLog=new AppendOnlyLedger('DEADLINE');
export const overrideLedger=new AppendOnlyLedger('OVERRIDE');
