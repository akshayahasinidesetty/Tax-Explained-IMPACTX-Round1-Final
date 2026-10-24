 'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(e:FormEvent) {
    e.preventDefault();setError('');setBusy(true);
    try { const supabase=createClient();const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});if(error)throw error;router.replace('/account');router.refresh(); }
    catch(e){setError(e instanceof Error?e.message:'Sign-in failed. Check your credentials and configuration.');}
    finally{setBusy(false);}
  }
  async function reset() {
    setError(''); if(!email.includes('@'))return setError('Enter your email address first.');
    try { const supabase=createClient();const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${location.origin}/reset-password`});if(error)throw error;setError('If this email is registered, password-reset instructions have been sent.');}
    catch(e){setError(e instanceof Error?e.message:'Password reset is not configured.');}
  }
  return <main className="auth-shell"><section className="auth-card"><Link href="/">← TaxClarity</Link><h1>Welcome back</h1><p>Sign in to your TaxClarity account.</p><form className="auth-form" onSubmit={submit}><label>Email address<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<div role="status" className="auth-error">{error}</div>}<button className="auth-button" disabled={busy}>{busy?'Signing in…':'Sign in'}</button></form><div className="auth-links"><button type="button" onClick={reset}>Forgot password?</button><Link href="/register">Create account</Link><Link href="/">Guest demo</Link></div><p className="auth-notice">Authentication uses your configured Supabase project; no account can be created until the backend is configured.</p></section></main>;
}
