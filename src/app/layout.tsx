import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Noto_Sans_KR } from 'next/font/google';
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration';
import './globals.css';

const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: '스미싱/피싱 확인 서비스',
  description: '문자와 이메일이 사기인지 AI로 확인하세요.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
};

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="ko" className={notoSansKr.variable}>
      <body className="antialiased">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
};

export default RootLayout;
