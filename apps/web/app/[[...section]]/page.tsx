import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import Workspace from '../../components/workspace';
import { modules } from '../../lib/workspaces';

export default async function Page({ params }: { params: Promise<{ section?: string[] }> }) {
  const { section } = await params;
  if (section && !modules.some((m) => m.path === '/' + section.join('/'))) notFound();
  return (
    <Suspense fallback={<main className="loading">Preparando DentalRisk…</main>}>
      <Workspace />
    </Suspense>
  );
}
