import Link from 'next/link';
import { db } from '@/lib/tasking/db';
import { fechaLarga } from '@/lib/tasking/fechas';
import type { Reunion } from '@/lib/tasking/tipos';

export const metadata = { title: 'Reuniones' };

const ESTADO = {
  grabando: ['Grabando', 'bg-red-50 text-red-700'],
  procesando: ['Procesando', 'bg-amber-50 text-amber-800'],
  lista: ['Acta lista', 'bg-emerald-50 text-emerald-700'],
  error: ['Con error', 'bg-red-50 text-red-700'],
} as const;

export default async function Pagina() {
  const { data } = await db().from('reuniones').select('id,titulo,inicio,fin,estado,resumen').order('inicio', { ascending: false }).limit(100);
  const reuniones = (data ?? []) as Reunion[];
  const ids = reuniones.map((r) => r.id);
  const { data: cs } = ids.length ? await db().from('compromisos').select('reunion_id,estado').in('reunion_id', ids) : { data: [] };
  const conteo = new Map<string, { total: number; hechos: number }>();
  for (const c of cs ?? []) {
    const x = conteo.get(c.reunion_id) ?? { total: 0, hechos: 0 };
    if (c.estado !== 'anulado') x.total++;
    if (c.estado === 'hecho') x.hechos++;
    conteo.set(c.reunion_id, x);
  }
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reuniones</h1>
          <p className="text-sm text-slate-500">Cada reunión con su acta, sus compromisos y cuánto se ha cumplido.</p>
        </div>
        <Link href="/tasking/reunion" className="tk-btn-primario">Nueva reunión</Link>
      </div>
      {reuniones.length === 0 && <div className="tk-tarjeta px-6 py-12 text-center text-sm text-slate-500">Todavía no se grabó ninguna reunión.</div>}
      <div className="space-y-2.5">
        {reuniones.map((r) => {
          const x = conteo.get(r.id) ?? { total: 0, hechos: 0 };
          const [txt, clase] = ESTADO[r.estado];
          const min = r.fin ? Math.max(1, Math.round((+new Date(r.fin) - +new Date(r.inicio)) / 60000)) : null;
          return (
            <Link key={r.id} href={`/tasking/reuniones/${r.id}`} className="tk-tarjeta flex flex-col gap-3 p-4 transition hover:border-tk-200 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.titulo}</span>
                  <span className={`tk-chip ${clase}`}>{txt}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {fechaLarga(r.inicio)}
                  {min ? ` · ${min} min` : ''}
                </div>
                {r.resumen && <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{r.resumen}</p>}
              </div>
              {x.total > 0 && (
                <div className="w-full shrink-0 sm:w-44">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{x.hechos} de {x.total} cumplidos</span>
                    <span>{Math.round((x.hechos / x.total) * 100)}%</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(x.hechos / x.total) * 100}%` }} />
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
