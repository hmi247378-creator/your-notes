'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppLayout } from '@/components/AppLayout';

export default function AppLayoutWrapper({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('yn_token');
    if (!token) {
      router.replace('/login');
    }
  }, [router]);

  return <AppLayout>{children}</AppLayout>;
}
