# Synthetic dataset dictionary

All records are fictional and intended only to demonstrate data reconciliation.

- `employers.csv`: two fictional employers; Employer B has an original and corrected statement.
- `bank_interest.csv`: one fictional bank-interest entry.
- `prefilled_tax_data.csv`: synthetic comparison values for a prefilled summary.
- `corrected_documents.csv`: explicit relationship between the old and corrected Employer B statement.

Amounts are INR. Values intentionally differ in places to demonstrate that a discrepancy can be detected without assuming its cause. These CSVs are not automatically wired into the supplied Next.js UI by this patch bundle. Integration is still required.
