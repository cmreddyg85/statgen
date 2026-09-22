import type { Metadata } from 'next';
import { GenerateClient } from './GenerateClient';

export const metadata: Metadata = { title: 'Generate records' };

export default async function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GenerateClient studentId={id} />;
}
