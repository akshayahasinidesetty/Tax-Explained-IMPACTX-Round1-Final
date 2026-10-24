# Round 1 scope and judge-facing notes

## Core user problem
People may see different amounts across payslips, annual information statements, and pre-filled records. Raw differences are hard to interpret and can prompt unsafe guessing.

## Prototype response
Tax, Explained compares two values, describes the mismatch in plain language, shows the arithmetic evidence, gives a next step, and requires human review. It also makes deadline status configurable and labels the example date as synthetic.

## Design principles
- Explain the discrepancy; do not silently decide which record is correct.
- Never auto-accept a mismatch.
- Keep source, reporting period, and correction history visible as questions to investigate.
- Mark synthetic examples clearly.
- Do not claim a government connection or authoritative tax determination.

## Known gaps to disclose
- No real document upload/OCR.
- No verified tax-rule engine or official deadline feed.
- No authentication, persistent database, or cross-device sync.
- No filing or government API integration.
