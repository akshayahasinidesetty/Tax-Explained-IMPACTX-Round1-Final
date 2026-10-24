import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function AccountPage(){
 let supabase;
 try{supabase=await createClient();}catch{return <main className="auth-shell"><section className="auth-card"><h1>Account setup required</h1><p>Supabase is not configured yet. Add the environment variables in `.env.local` and configure email confirmation before using authenticated features.</p><Link href="/">Return to guest demo</Link></section></main>;}
 const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/login');
 async function signOut(){'use server';const client=await createClient();await client.auth.signOut();redirect('/login');}
 return <main className="auth-shell"><section className="auth-card"><Link href="/">← TaxClarity workspace</Link><h1>Your account</h1><p>Account information returned by the configured authentication provider.</p><div className="auth-form"><label>Name<input readOnly value={String(user.user_metadata?.full_name??'')}/></label><label>Email<input readOnly value={user.email??''}/></label><p className="auth-notice">Email verified: {user.email_confirmed_at?'Yes':'No'}. This page currently displays account identity only; tax records and documents are not yet wired to database CRUD screens.</p><form action={signOut}><button className="auth-button">Sign out</button></form><Link href="/">Open guest demo</Link></div></section></main>;
}
