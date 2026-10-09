'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Vuelve a pedir los datos del servidor cada cierto tiempo (sin recargar la página). */
export default function Refrescar({ cada }: { cada: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), cada);
    return () => clearInterval(t);
  }, [cada, router]);
  return null;
}
