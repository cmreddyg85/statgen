import type { Metadata } from 'next';
import { StudentDetail } from './StudentDetail';

export const metadata: Metadata = { title: 'Student' };

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StudentDetail studentId={id} />;
}
