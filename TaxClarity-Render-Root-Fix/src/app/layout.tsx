import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaxClarity — Clearer records. Smarter tax decisions.',
  description: 'An IMPACTX 2026 student prototype for explainable tax-document reconciliation, version-aware records, and educational tax estimates.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body className="min-h-screen antialiased">{children}</body></html>;
}
