# TaxClarity — IMPACTX 2026 Round 2 Enhancement

**Tagline:** Clearer records. Smarter tax decisions. Greater confidence.  
**Team:** CodePulse — Akshaya Hasini Desetty (25BCE8286) and Snehitha Marella (25BCA7653)  
**Live Round 1 site:** https://tax-clarity.netlify.app/  
**Repository:** https://github.com/akshayahasinidesetty/taxclarity  
**Demo:** https://new.express.adobe.com/publishedV2/urn:aaid:sc:AP:3d32d6f9-089e-5242-a2f0-9f007a005050

TaxClarity is an independent educational prototype. It is not affiliated with the Income Tax Department, does not automatically file tax returns, and does not replace professional tax advice.

## Current implementation status

This ZIP preserves the existing Next.js application and adds deployment documentation/configuration. It is a **hackathon prototype**, not a completed production tax platform. Before using real taxpayer data, implement and verify persistent user-owned data workflows, storage/RLS policies, and the remaining security controls described below.

- **Working code areas:** scoped AY 2026-27 estimate engine, deterministic structured-record reconciliation, CSV parsing utilities, synthetic rule-update simulator, in-memory document-version registry, audit helpers, and a deterministic test centre.
- **Important distinction:** the home-page upload control records selected file names only. It does not parse the file. Do not describe that control as full document extraction.
- **Authentication:** registration/login/OTP confirmation use Supabase when configured. Email delivery and OTP format depend on the Supabase project configuration; this is not a separate custom email service.
- **Persistence:** the account page is not yet a full tax-profile/document/calculation CRUD workspace. The in-memory version registry is for demo/tests only.
- **Verification status:** package installation timed out in the packaging environment because dependency access was unavailable. The automated test suite and production build therefore have **not been run here**. Run the commands below in an environment with npm registry access and fix any reported errors before the event.

## Run locally

Requirements: Node.js 22 and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. The public guest demo runs without Supabase configuration. Real account authentication requires a configured Supabase project and the environment variables described below.

## Verification commands

```bash
npm run typecheck
npm test
npm run test:round2
npm run build
npm run start
```

**Verification honesty:** these commands are included, but the test suite and production build have not been executed in the packaging environment. Do not claim a pass until you run them and inspect the exit codes. `npm test` runs the existing Round 1 harness and the Round 2 TypeScript tests. The Round 2 suite has 45 deterministic test cases; it prints a final passed count only if every assertion succeeds.

## Round 2 improvements in this source package

### 1. Versioned, scoped Indian tax estimator

`src/engine/indiaTaxAY2026_27.ts` adds a separately scoped estimate for AY 2026-27 (FY 2025-26), using official Income Tax Department slab/rebate references and the Finance Act 2025 source. It compares the new and old regimes, includes the salary standard deduction, age-band slab handling for resident individuals under the old regime, Section 87A rebate logic, new-regime marginal relief around the ₹12 lakh taxable-income threshold, and 4% Health and Education Cess.

**Important limitations:** this is not a general tax-return calculator. It supports salary income plus ordinary-rate other income, user-confirmed aggregate old-regime deductions, and income below the ₹50 lakh surcharge threshold. It does not calculate surcharge or surcharge marginal relief, capital gains or other special-rate income, business income, agricultural-income integration, full HRA/home-loan/80C/80D eligibility, or every taxpayer category. It is an estimate, not a verified filing figure. Verify details for the user's facts with official tools or a qualified professional.

Official references:
- [Income Tax Department — ITR-2 FAQs (AY 2026-27 slab rates and rebate)](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/itr-2/itr-2-faqs)
- [India Budget — Finance Act 2025 PDF (Section 87A amendments)](https://www.indiabudget.gov.in/budget2025-26/doc/Finance_Bill.pdf)
- [Income Tax Department — New Act effective-date explanation](https://www.incometax.gov.in/iec/foportal/help/all-topics/e-filing-services/objective-and-scope-new-act)

The earlier `src/engine/rules.ts` remains as a **synthetic rule-update simulator** and must not be presented as official law.

### 2. Structured multi-record reconciliation

`src/engine/reconciliationBatch.ts` adds deterministic matching by payer, reference, reporting period, and category. It raises findings for:
- amount mismatches,
- missing counterpart records,
- unmatched comparison-source records,
- potential duplicate rows,
- conflicting reporting periods.

Every finding contains evidence strings, source records, a confidence basis, and a `NEEDS_REVIEW` state. A difference is never automatically classified as fraud, evasion, a confirmed error, or legal liability.

### 3. CSV import and local image OCR

`src/engine/documentImport.ts`:
- parses structured CSV rows with quoted fields,
- checks required headers and file size,
- skips invalid rows with warnings rather than silently accepting them,
- offers `extractImageTextLocally()` using Tesseract.js for local browser-side OCR on image files.

OCR output is untrusted text. The user must review and correct extracted values before reconciliation. The helper does not upload image bytes by itself. PDF text extraction, spreadsheet import, extraction confirmation UI, and a full document-upload workflow remain incomplete.

### 4. Corrected-document version handling

`DocumentVersionRegistry` in `src/engine/reconciliationBatch.ts` preserves earlier versions, marks one version active, validates supersession references, and supports restoring a previous version. It is an in-memory test/demo implementation; it is not durable multi-user storage. The existing `TaxDocument` model also retains its version lineage and diff support.

### 5. Visible Round 2 test centre

Open `/test-centre` in the local app. It runs 20 deterministic checks against the actual tax, CSV, and reconciliation functions in the browser and displays input, expected result, actual result, and pass/fail. The Node suite contains additional unit tests. The browser test centre is not a substitute for server integration tests.

### 6. Supabase authentication and database foundation

The source includes:
- `/register`, `/login`, `/verify-email`, `/reset-password`, and `/account` routes,
- Supabase browser/server client helpers and middleware,
- a Postgres migration with profile, calculation, document metadata, reconciliation run, finding, audit event, and report metadata tables,
- row-level security policies,
- a private storage bucket with user-folder ownership policies,
- a profile-creation trigger.

These routes require your own Supabase project configuration. No real account can be created or email sent without it. Configure Supabase Auth email confirmation and use an email template that delivers the six-digit `{{ .Token }}` code for signup; configure Site URL and Redirect URLs for your deployed domain. Do not put a service-role key in a frontend environment variable.

**Backend integration is partial:** the auth routes use Supabase Auth when configured, and the migration provides a secure schema foundation, but the current dashboard is not yet wired to durable CRUD operations for calculations, documents, findings, reports, or audit events. The account page displays identity and verification status; it is not a complete account-management center.

## Supabase setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from project API settings.
4. In Supabase Auth, enable email confirmation and configure the signup email template to show the six-digit token.
5. Add local and production redirect URLs for `/verify-email` and `/reset-password`.
6. Apply `supabase/migrations/202610240001_taxclarity_core.sql` after reviewing it in your project's SQL migration workflow.
7. Confirm row-level security and private bucket policies before using any real personal data.

Use fictional data for demonstrations. Never commit `.env.local`, private files, or service-role secrets.

## Demo scenarios

`docs/demo/round2-scenarios.json` defines the eight judge scenarios:
A. Matching records  
B. ₹8,40,000 versus ₹8,25,000 (₹15,000 difference)  
C. Corrected employer statement  
D. Missing deduction evidence  
E. Invalid or duplicate data  
F. Tax-regime comparison  
G. Synthetic rule update  
H. Failure recovery

The ₹15,000 difference does not establish which source is correct.

## Architecture map

- `src/app/page.tsx` — existing Round 1 landing page and workspace.
- `src/app/login`, `register`, `verify-email`, `reset-password`, `account` — Supabase Auth UI.
- `src/app/test-centre/page.tsx` — live deterministic demo checks.
- `src/engine/rules.ts` — synthetic rule simulator.
- `src/engine/indiaTaxAY2026_27.ts` — limited, source-referenced AY 2026-27 estimate.
- `src/engine/reconciliation.ts` — original single comparison and document validation.
- `src/engine/reconciliationBatch.ts` — structured matching and version registry.
- `src/engine/documentImport.ts` — CSV parser and local image OCR helper.
- `src/engine/demoTests.ts` — 20 visible deterministic checks.
- `src/models/Document.ts` — document model, lineage and diffing.
- `src/lib/supabase/` — browser and server Supabase clients.
- `middleware.ts` — configured-session checks for account/auth routes.
- `supabase/migrations/` — schema, RLS and private-storage setup.
- `tests/harness.test.ts` — original Round 1 tests.
- `tests/round2.test.ts` — Round 2 unit tests.
- `data/` — fictional CSV fixtures.
- `docs/demo/round2-scenarios.json` — judge demo scenarios.

## Current limitations — do not present these as completed

- The full dashboard workflow is not yet connected to Supabase CRUD.
- PDF parsing, XLSX parsing, and OCR extraction-review UI are not implemented; image OCR is available as a helper only.
- PDF report generation and user-selected report sections are not implemented.
- Full audit-log write/read/filter UI is not wired to the database.
- Account data export/deletion workflows are not complete.
- The existing guest dashboard remains a prototype and does not become production authentication merely because the new auth routes exist.
- The official tax engine is deliberately limited to the scope above; do not use it for complex cases or filing.
- Automated tests and production build still need to be run in an environment with dependencies installed.

## Judge-facing demonstration script (3–4 minutes)

1. Open the original dashboard and explain that Round 1 functionality and the ₹8,40,000 / ₹8,25,000 example are retained.
2. Open `/test-centre` and run the 20 live deterministic checks. Show actual results; do not claim they passed unless the displayed output says so.
3. Explain the ₹15,000 difference and the human-review warning.
4. Show the batch reconciliation function and its missing-record, mismatch, duplicate, and period-conflict categories.
5. Show corrected-document version history and restoration.
6. Open the limited AY 2026-27 estimator and state its scope and exclusions.
7. If Supabase is configured, demonstrate email OTP verification and account sign-in. Otherwise clearly identify authentication as awaiting configuration.
8. Finish by stating the limitations honestly: the complete persistent dashboard CRUD, PDF/XLSX processing, report generation, and full-scope tax engine remain future work.

TaxClarity does not connect to government portals and does not file returns.
