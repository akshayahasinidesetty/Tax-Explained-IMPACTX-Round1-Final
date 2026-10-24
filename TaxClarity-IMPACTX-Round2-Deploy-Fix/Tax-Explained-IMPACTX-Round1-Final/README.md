# TaxClarity — IMPACTX 2026 Round 2 Enhancement

**Tagline:** Clearer records. Smarter tax decisions. Greater confidence.  
**Team:** CodePulse — Akshaya Hasini Desetty (25BCE8286) and Snehitha Marella (25BCA7653)  
**Live Round 1 site:** https://tax-clarity.netlify.app/  
**Repository:** https://github.com/akshayahasinidesetty/taxclarity  
**Demo:** https://new.express.adobe.com/publishedV2/urn:aaid:sc:AP:3d32d6f9-089e-5242-a2f0-9f007a005050

TaxClarity is an independent educational prototype. It is not affiliated with the Income Tax Department, does not automatically file tax returns, and does not replace professional tax advice.

## Run locally

Requirements: Node.js 20.9+ (Node 22 recommended) and npm.

```bash
npm install
cp .env.example .env.local
npm run dev
```

On Windows PowerShell, use `Copy-Item .env.example .env.local` instead of `cp`. The public guest demo runs without Supabase configuration. Real account authentication requires a configured Supabase project and the environment variables described below.

## Deploying to Netlify

The repository includes `netlify.toml` with the Next.js build command and Node 22 runtime. Netlify's built-in Next.js adapter is detected automatically; do not configure this as a plain static site or add a catch-all `/* /index.html 200` rewrite. In Netlify, set the base directory to the folder containing this `package.json`, use `npm run build`, and let the Next.js integration handle server-rendered routes. If the dashboard forces a publish directory, use `.next`.

The guest demo does not require Supabase. To activate account/auth routes, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the site's environment variables, configure the Supabase Auth redirect URLs for the deployed domain, and trigger a fresh deploy. These are public client settings, not a service-role secret.

## Verification commands

```bash
npm run typecheck
npm test
npm run test:round2
npm run build
npm run start
```

**Verification honesty:** the full dependency-backed Next.js build could not be run in the packaging environment because the npm registry was unreachable. Do not claim a production build is verified until `npm run build` completes successfully. `npm test` runs the existing Round 1 harness and the Round 2 TypeScript tests. The Round 2 suite has 48 deterministic test cases; it prints a final passed count only if every assertion succeeds.

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

`src/engine/documentImport.ts` parses CSV rows with quoted fields, checks required headers and size, skips invalid rows with warnings, and provides local image OCR. `src/engine/documentPipeline.ts` adds local extraction for text-based PDFs, the first worksheet of XLS/XLSX files, TXT, CSV, and image OCR. The `/documents` page connects those inputs to a review/edit workflow, structured rows, source A/B reconciliation, and exports. PDF text extraction uses PDF.js; spreadsheet parsing uses SheetJS (`xlsx`). Scanned PDFs without a text layer are not OCRed automatically; upload page images or use a text-based PDF. PDF tables and OCR output frequently need manual correction before they can be structured.

### 4. PDF and CSV report generation

`src/engine/pdfReport.ts` produces a dependency-free printable PDF with record counts, finding types/severity/status, evidence, timestamps, and limitations. The document workflow also exports finding and structured-record CSVs. These are local downloads and are not persisted or uploaded. The report is an evidence summary, not an audit opinion or tax filing.

### 5. Corrected-document version handling

`DocumentVersionRegistry` in `src/engine/reconciliationBatch.ts` preserves earlier versions, marks one version active, validates supersession references, and supports restoring a previous version. It is an in-memory test/demo implementation; it is not durable multi-user storage. The existing `TaxDocument` model also retains its version lineage and diff support.

### 6. Visible Round 2 test centre

Open `/test-centre` in the local app. It runs 20 deterministic checks against the actual tax, CSV, and reconciliation functions in the browser and displays input, expected result, actual result, and pass/fail. The Node suite contains additional unit tests. The browser test centre is not a substitute for server integration tests.

### 7. Supabase authentication and database foundation

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
- `src/engine/documentPipeline.ts` — local CSV/XLSX/text-PDF/TXT/image import pipeline.
- `src/engine/pdfReport.ts` — PDF report and CSV export generation.
- `src/app/documents/page.tsx` — import/review/reconcile/export workflow.
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
- The `/documents` workflow is a browser-session prototype; it does not persist imported files/rows, versions, findings, or reports to Supabase.
- PDF extraction is text-layer only; scanned PDF pages are not OCRed automatically. XLS/XLSX imports only the first worksheet, and complex PDF tables may require manual entry.
- The PDF report currently uses a fixed section set and does not offer user-selected report sections.
- Individual imported fields are not edited directly in a record grid; users can edit extracted text/re-parse CSV or add corrected structured records manually.
- Full audit-log write/read/filter UI is not wired to the database.
- Account data export/deletion workflows are not complete.
- The existing guest dashboard remains a prototype and does not become production authentication merely because the new auth routes exist.
- The official tax engine is deliberately limited to the scope above; do not use it for complex cases or filing.
- Automated tests and production build still need to be run in an environment with dependencies installed.

## Judge-facing demonstration script (3–4 minutes)

1. Open the original dashboard and explain that Round 1 functionality and the ₹8,40,000 / ₹8,25,000 example are retained.
2. Open `/documents`, import fictional CSV/XLSX/text-based PDF/image files into Source A and Source B, review extracted text/rows, run reconciliation, and download PDF/CSV reports.
3. Open `/test-centre` and run the 20 live deterministic checks. Show actual results; do not claim they passed unless the displayed output says so.
4. Explain the difference and the human-review warning.
5. Show missing-record, mismatch, duplicate, and period-conflict categories.
6. Show corrected-document version history and restoration.
7. Open the limited AY 2026-27 estimator and state its scope and exclusions.
8. If Supabase is configured, demonstrate email OTP verification and account sign-in. Otherwise clearly identify authentication as awaiting configuration.
9. Finish by stating the limitations honestly: persistent dashboard/document CRUD and audit trails, automatic OCR for scanned PDFs, advanced table extraction, configurable report sections, and the full-scope tax engine remain unfinished.

TaxClarity does not connect to government portals and does not file returns.
