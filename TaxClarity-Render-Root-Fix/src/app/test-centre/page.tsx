 'use client';
import { useState } from 'react';
import Link from 'next/link';
import { runDemoTests, type DemoTestResult } from '@/engine/demoTests';

export default function TestCentrePage(){
 const [results,setResults]=useState<DemoTestResult[]|null>(null);
 const passed=results?.filter(r=>r.passed).length??0;
 return <main className="auth-shell"><section className="auth-card" style={{width:'min(100%,1000px)'}}><Link href="/">← TaxClarity</Link><h1>Round 2 test centre</h1><p>These checks execute the actual local tax, CSV import, and reconciliation functions in this browser session. They use fictional data only. This is not a substitute for the Node test suite or production integration tests.</p><button className="auth-button" onClick={()=>setResults(runDemoTests())}>Run 20 deterministic checks</button>{results&&<><div className={passed===results.length?'auth-success':'auth-error'} role="status" style={{marginTop:16}}>{passed}/{results.length} checks passed · {results.length-passed} failed</div><div style={{overflowX:'auto',marginTop:18}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}><thead><tr>{['ID','Scenario','Input','Expected','Actual','Result'].map(h=><th key={h} style={{textAlign:'left',padding:9,borderBottom:'2px solid var(--line)'}}>{h}</th>)}</tr></thead><tbody>{results.map(r=><tr key={r.id}><td style={{padding:9,borderBottom:'1px solid var(--line)'}}>{r.id}</td><td style={{padding:9,borderBottom:'1px solid var(--line)'}}>{r.scenario}</td><td style={{padding:9,borderBottom:'1px solid var(--line)'}}>{r.input}</td><td style={{padding:9,borderBottom:'1px solid var(--line)'}}>{r.expected}</td><td style={{padding:9,borderBottom:'1px solid var(--line)'}}>{r.actual}</td><td style={{padding:9,borderBottom:'1px solid var(--line)',fontWeight:700}}>{r.passed?'PASS':'FAIL'}</td></tr>)}</tbody></table></div><button style={{marginTop:16}} onClick={()=>setResults(null)}>Clear results</button></>}</section></main>;
}
