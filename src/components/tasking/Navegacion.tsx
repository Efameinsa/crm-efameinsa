'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navegacion({ enlaces }: { enlaces: { href: string; texto: string }[] }) {
  const ruta = usePathname();
  return (
    <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto">
      {enlaces.map((e) => {
        const activo = ruta === e.href || ruta.startsWith(`${e.href}/`);
        return (
          <Link
            key={e.href}
            href={e.href}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap transition ${activo ? 'bg-tk-50 text-tk-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {e.texto}
          </Link>
        );
      })}
    </nav>
  );
}
