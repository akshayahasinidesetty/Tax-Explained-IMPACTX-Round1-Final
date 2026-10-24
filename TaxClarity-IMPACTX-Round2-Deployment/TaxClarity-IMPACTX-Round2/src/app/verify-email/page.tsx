 'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function VerifyEmailPage(){
 const [email,setEmail]=useState(''),[token,setToken]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);const router=useRouter();
 useEffect(()=>{setEmail(sessionStorage.getItem('taxclarity_pending_email')??'');},[]);
 async function submit(e:FormEvent){e.preventDefault();setError('');if(!/^\d{6}$/.test(token))return setError('Enter the six-digit code from your email.');setBusy(true);
 try{const supabase=createClient();const {error}=await supabase.auth.verifyOtp({email:email.trim().toLowerCase(),token,type:'signup'});if(error)throw error;sessionStorage.removeItem('taxclarity_pending_email');router.replace('/account');router.refresh();}
 catch(e){setError(e instanceof Error?e.message:'Verification failed. The code may be invalid or expired.');}finally{setBusy(false);}}
 async function resend(){setError('');try{const supabase=createClient();const {error}=await supabase.auth.resend({type:'signup',email:email.trim().toLowerCase()});if(error)throw error;setError('A new confirmation email was requested. Check your inbox and spam folder.');}catch(e){setError(e instanceof Error?e.message:'Could not request a new code.');}}
 return <main className="auth-shell"><section className="auth-card"><Link href="/">← TaxClarity</Link><h1>Verify your email</h1><p>Enter the six-digit code sent by your configured authentication provider. A code is not a password.</p><form className="auth-form" onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Six-digit verification code<input inputMode="numeric" autoComplete="one-time-code" required pattern="[0-9]{6}" maxLength={6} value={token} onChange={e=>setToken(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>{error&&<div role="status" className="auth-error">{error}</div>}<button className="auth-button" disabled={busy}>{busy?'Verifying…':'Verify email'}</button></form><div className="auth-links"><button type="button" onClick={resend}>Resend confirmation</button><Link href="/login">Back to sign in</Link></div><p className="auth-notice">Supabase email confirmation templates and OTP expiry must be configured in the project dashboard. This app does not invent or display verification codes.</p></section></main>;
}
