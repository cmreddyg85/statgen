import type { Metadata } from 'next';
import { StudentsClient } from './StudentsClient';

export const metadata: Metadata = { title: 'Students' };

/** Students are available to both roles (PRD section 5). */
export default function StudentsPage() {
  return <StudentsClient />;
}
