# TaxClarity — 4-minute judge demo

Use fictional records only. If a screen or integration is not configured, say so plainly instead of implying it ran.

## 0:00–0:25 — Problem and safety
“TaxClarity helps people review differences between tax-related records. It does not decide which source is legally correct, accuse anyone of wrongdoing, or file returns.”

## 0:25–1:05 — Income discrepancy
Open the guest workspace and retain the illustrative values ₹8,40,000 and ₹8,25,000. Show the ₹15,000 delta. Explain that the difference is a prompt to compare reporting periods and source evidence—not proof that either figure is wrong.

## 1:05–1:45 — Reconciliation engine
Show the structured reconciliation engine/test-centre checks for exact matches, amount mismatch, missing/unmatched records, period conflicts, and potential duplicates. Explain the deterministic match fields: payer, reference, reporting period, and category.

## 1:45–2:20 — Corrected statement
Use the synthetic original/corrected-document scenario. Explain that the in-memory registry preserves both versions and marks the latest as active, with a restore path. Explicitly state that persistence across users/restarts is not implemented in this demo registry.

## 2:20–3:05 — Tax estimate and rule version
Show the limited AY 2026-27 estimator and the synthetic Rule Update Simulator. Separate the scoped Indian estimate from hypothetical synthetic rule sets. Explain the supported income scope and the exclusions (such as surcharge and special-rate income).

## 3:05–3:40 — Tests
Open `/test-centre`, run the browser demo checks, and show actual pass/fail results. For automated evidence, run `npm test` locally and show the real terminal output. Do not claim test results unless they have completed successfully.

## 3:40–4:00 — Close
“Our differentiator is explainable reconciliation, version-aware review, and honest boundaries. The next production step is durable user-scoped storage, reviewed access policies, and end-to-end integration tests.”
