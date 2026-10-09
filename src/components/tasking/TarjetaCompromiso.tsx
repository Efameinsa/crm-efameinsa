'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fechaLima, plazoTexto } from '@/lib/tasking/fechas';
import { estaVencido, type Compromiso, type EstadoCompromiso } from '@/lib/tasking/tipos';

export type PersonaMin = { id: string; nombre: string; cargo?: string };

const COLORES = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-800', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700', 'bg-orange-100 text-orange-700'];

export function Avatar({ nombre, id, chico }: { nombre: string; id: string; chico?: boolean }) {
  const ini = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const color = COLORES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORES.length];
  return <span className={`grid shrink-0 place-items-center rounded-full font-semibold ${color} ${chico ? 'size-6 text-[10px]' : 'size-8 text-xs'}`}>{ini || '?'}</span>;
}

export function ChipPlazo({ c }: { c: Pick<Compromiso, 'estado' | 'vence_en' | 'hora_definida'> }) {
  const vencido = estaVencido(c);
  const esHoy = !!c.vence_en && fechaLima(c.vence_en) === fechaLima();
  const clase =
    c.estado === 'hecho'
      ? 'bg-emerald-50 text-emerald-700'
      : vencido
        ? 'bg-red-50 text-red-700'
        : esHoy
          ? 'bg-amber-50 text-amber-800'
          : c.vence_en
            ? 'bg-slate-100 text-slate-600'
            : 'bg-slate-50 text-slate-400';
  return (
    <span className={`tk-chip ${clase}`} suppressHydrationWarning>
      <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      {vencido ? 'venció ' : ''}
      {plazoTexto(c.vence_en, c.hora_definida)}
    </span>
  );
}

/** Cambia el estado con PATCH y refresca la página. */
export function useCambiarEstado() {
  const router = useRouter();
  const [ocupado, setOcupado] = useState<string | null>(null);
  async function cambiar(id: string, estado: EstadoCompromiso) {
    setOcupado(id);
    const r = await fetch(`/api/tasking/compromisos/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ estado }) });
    if (!r.ok) alertaSuave((await r.json().catch(() => ({}))).error || 'No se pudo guardar.');
    router.refresh();
    setOcupado(null);
  }
  return { cambiar, ocupado };
}

function alertaSuave(texto: string) {
  const el = document.createElement('div');
  el.textContent = texto;
  el.className = 'fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

export default function TarjetaCompromiso({
  c,
  persona,
  reunion,
  puedeEditar,
  cambiar,
  ocupado,
}: {
  c: Compromiso;
  persona?: PersonaMin;
  reunion?: { titulo: string };
  puedeEditar: boolean;
  cambiar: (id: string, e: EstadoCompromiso) => void;
  ocupado: boolean;
}) {
  const vencido = estaVencido(c);
  return (
    <article className={`tk-tarjeta p-3.5 ${vencido ? 'border-red-200' : ''} ${ocupado ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2.5">
        {persona ? <Avatar nombre={persona.nombre} id={persona.id} /> : <Avatar nombre="?" id="x" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="truncate font-medium text-slate-700">{persona?.nombre ?? c.responsable_texto ?? 'Sin responsable'}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] text-slate-400">#{c.numero}</span>
          </div>
          <p className={`mt-1 text-sm leading-snug ${c.estado === 'hecho' ? 'text-slate-400 line-through' : 'text-slate-800'}`}>{c.descripcion}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ChipPlazo c={c} />
            {reunion && <span className="truncate text-[11px] text-slate-400">· {reunion.titulo}</span>}
          </div>
          {puedeEditar && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {c.estado === 'pendiente' && (
                <button disabled={ocupado} onClick={() => cambiar(c.id, 'en_curso')} className="tk-btn-claro tk-btn-chico">
                  Empezar
                </button>
              )}
              {c.estado !== 'hecho' && (
                <button disabled={ocupado} onClick={() => cambiar(c.id, 'hecho')} className="tk-btn-chico tk-btn bg-emerald-600 text-white hover:bg-emerald-700">
                  ✓ Hecho
                </button>
              )}
              {c.estado === 'hecho' && (
                <button disabled={ocupado} onClick={() => cambiar(c.id, 'pendiente')} className="tk-btn-claro tk-btn-chico">
                  Reabrir
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
