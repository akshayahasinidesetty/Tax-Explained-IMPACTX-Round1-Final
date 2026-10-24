 'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const [name,setName]=useState(''), [email,setEmail]=useState(''), [password,setPassword]=useState(''), [confirm,setConfirm]=useState('');
  const [error,setError]=useState(''), [busy,setBusy]=useState(false);
  const router=useRouter();
  async function submit(e:FormEvent) {
    e.preventDefault(); setError('');
    if (name.trim().length < 2) return setError('Enter your full name.');
    if (password.length < 10) return setError('Use a password with at least 10 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const supabase=createClient();
      const {error}=await supabase.auth.signUp({email:email.trim().toLowerCase(),password,options:{data:{full_name:name.trim()},emailRedirectTo:`${location.origin}/verify-email`}});
      if(error) throw error;
      sessionStorage.setItem('taxclarity_pending_email',email.trim().toLowerCase());
      router.push('/verify-email');
    } catch(e) { setError(e instanceof Error ? e.message : 'Registration failed. Check your configuration and try again.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-card"><Link href="/" aria-label="TaxClarity home">← TaxClarity</Link><h1>Create your account</h1><p>Create a private account to manage your tax-review workspace. Use fictional data for demos.</p>
    <form className="auth-form" onSubmit={submit}><label>Full name<input required autoComplete="name" value={name} onChange={e=>setName(e.target.value)} maxLength={100}/></label><label>Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} minLength={10}/></label><label>Confirm password<input required type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><p className="auth-notice">Password strength guidance: use 10+ characters. Email confirmation must be enabled in your Supabase project. Never use your real tax identifiers in this prototype.</p>{error&&<div role="alert" className="auth-error">{error}</div>}<button className="auth-button" disabled={busy}>{busy?'Creating account…':'Create account'}</button></form>
    <div className="auth-links"><Link href="/login">Already have an account? Sign in</Link><Link href="/">Guest demo</Link></div></section></main>;
}
