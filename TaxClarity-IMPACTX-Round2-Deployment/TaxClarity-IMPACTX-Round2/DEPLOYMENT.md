# TaxClarity deployment guide

## Fastest option: Netlify

This is a **Next.js application**, not a static HTML export. Keep the Next.js runtime enabled.

1. Push this project folder to your GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project** and select the repository.
3. Set the base directory to the folder containing `package.json` (the project root when this ZIP is extracted).
4. Build command: `npm run build`. The included `netlify.toml` sets Node.js 22 and the Next.js publish output.
5. Deploy. If the build fails, open the deploy log and read the first actual error, not only the final summary.

### Guest demo

The landing-page guest demo is designed to run without Supabase credentials. Use fictional data only. Document selection in the main demo tracks filenames in the browser session; it does **not** parse those selected files. The separate CSV import utility can parse supported structured CSV records when used by the relevant workflow/test code.

### Enable account authentication

1. Create a Supabase project.
2. In Supabase Authentication, configure email confirmation and the email template to provide a six-digit OTP compatible with the app's `verifyOtp` flow.
3. Configure the project's Site URL and redirect URLs for your deployed Netlify domain, including `/verify-email` and `/reset-password`.
4. In Netlify site environment variables, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Redeploy after setting the variables.

Only use the Supabase anon/publishable key in `NEXT_PUBLIC_*`. Never expose a service-role key. OTP behavior depends on the configured Supabase email template/provider; this project does not implement a separate custom OTP mail service.

### Local setup

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, copy the environment template with:

```powershell
Copy-Item .env.example .env.local
```

The placeholders in `.env.example` are not real credentials. Leave Supabase values unconfigured if you only want to explore the guest demo.

### Checks before presenting

```bash
npm run typecheck
npm test
npm run build
```

Do not claim the build/tests passed unless these commands complete successfully. Dependency installation requires access to the npm registry.

## Known limitations to disclose

- The authenticated account page currently displays identity details and sign-out; it does not yet provide full database CRUD for tax records and documents.
- The main landing-page file picker records filenames only; it does not claim successful document parsing. CSV parsing and OCR helpers are separate capabilities and must be explicitly invoked by a workflow.
- The version registry used by reconciliation tests is in-memory, not persistent multi-user document storage.
- The migration is a schema starting point. Review/apply it in Supabase and verify row-level security policies and private storage policies before handling any user data.
- The tax engine is deliberately scoped to the supported AY 2026-27 cases. It is not a complete ITR preparation or filing system; see README for unsupported cases.
- The test centre runs deterministic browser-side demo checks. It is not a substitute for the automated Node test suite or integration tests.
