import type { Metadata } from 'next';
import './style.css';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'DentalRisk · Control de la clínica',
  description: 'Control operativo y productividad de la clínica dental',
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
