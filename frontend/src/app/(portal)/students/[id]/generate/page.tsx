import type { Metadata } from 'next';
import { GenerateRecordForm } from './GenerateRecordForm';

export const metadata: Metadata = { title: 'Generate record' };

export default async function GenerateRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ record?: string }>;
}) {
  const { id } = await params;
  const { record } = await searchParams;
  return <GenerateRecordForm studentId={id} recordId={record} />;
}
