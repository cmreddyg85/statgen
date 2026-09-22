import type { Metadata, Viewport } from 'next';
import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'Secure Business Portal';

export const metadata: Metadata = {
  title: { default: appName, template: `%s · ${appName}` },
  description: 'Secure internal portal for business modules, users and student records.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2563eb',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
