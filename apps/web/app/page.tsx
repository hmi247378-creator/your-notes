'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage(): React.JSX.Element {
  const router = useRouter();

  useEffect(() => {
    router.replace('/login');
  }, [router]);

  return (
    <div style={{ visibility: 'hidden' }}>
      Redirecting to login...
    </div>
  );
}

