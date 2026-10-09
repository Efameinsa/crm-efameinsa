'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { fechaLima } from '@/lib/tasking/fechas';
import { estaVencido, type Compromiso } from '@/lib/tasking/tipos';
import TarjetaCompromiso, { useCambiarEstado, type PersonaMin } from './TarjetaCompromiso';

const COLUMNAS = [
  { clave: 'vencido', titulo: 'Vencidos', punto: 'bg-red-500', vacio: 'Nada vencido. ¡Bien!' },
  { clave: 'pendiente', titulo: 'Pendientes', punto: 'bg-slate-400', vacio: 'Sin pendientes.' },
  { clave: 'en_curso', titulo: 'En curso', punto: 'bg-amber-500', vacio: 'Nadie marcó «Empezar» todavía.' },
  { clave: 'hecho', titulo: 'Hechos (14 días)', punto: 'bg-emerald-500', vacio: 'Aún no hay cumplidos.' },
] as const;

function columnaDe(c: Compromiso) {
  if (c.estado === 'hecho') return 'hecho';
  if (estaVencido(c)) return 'vencido';
  return c.estado;
}

function ordenar(a: Compromiso, b: Compromiso) {
  if (a.estado === 'hecho') return (b.hecho_en ?? '').localeCompare(a.hecho_en ?? '');
  if (!a.vence_en) return 1;
  if (!b.vence_en) return -1;
  return a.vence_en.localeCompare(b.vence_en);
}

export default function Tablero({
  compromisos,
  personas,
  reuniones,
  admin,
  yo,
}: {
  compromisos: Compromiso[];
  personas: PersonaMin[];
  reuniones: Record<string, { titulo: string }>;
  admin: boolean;
  yo: string | null;
}) {
  const [filtro, setFiltro] = useState<string>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [ahora] = useState(() => Date.now());
  const { cambiar, ocupado } = useCambiarEstado();
  const porId = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas]);

  const visibles = compromisos.filter((c) => {
    if (filtro === 'sin' ? c.persona_id : filtro !== 'todos' && c.persona_id !== filtro) return false;
    if (busqueda && !c.descripcion.toLowerCase().includes(busqueda.toLowerCase())) return false;
    return true;
  });

  const hoy = fechaLima();
  const hace7 = new Date(ahora - 7 * 86400_000).toISOString();
  const kpi = {
    abiertos: visibles.filter((c) => c.estado === 'pendiente' || c.estado === 'en_curso').length,
    vencidos: visibles.filter((c) => estaVencido(c)).length,
    hoy: visibles.filter((c) => c.estado !== 'hecho' && !estaVencido(c) && c.vence_en && fechaLima(c.vence_en) === hoy).length,
    semana: visibles.filter((c) => c.estado === 'hecho' && (c.hecho_en ?? '') >= hace7).length,
  };
  const sinResponsable = compromisos.filter((c) => !c.persona_id && c.estado !== 'hecho').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Tablero de compromisos</h1>
          <p className="text-sm text-slate-500">Lo que se acordó en las reuniones y cómo va cada uno.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="tk-campo w-full sm:w-52">
            <option value="todos">Todo el equipo</option>
            {yo && <option value={yo}>Solo los míos</option>}
            {personas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            {sinResponsable > 0 && <option value="sin">Sin responsable ({sinResponsable})</option>}
          </select>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tarea…" className="tk-campo w-full sm:w-52" />
        </div>
      </div>

      {admin && sinResponsable > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Hay {sinResponsable} compromiso{sinResponsable > 1 ? 's' : ''} sin responsable reconocido. Asígnalo{sinResponsable > 1 ? 's' : ''} desde el acta de la reunión para que se le avise.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: 'Abiertos', v: kpi.abiertos, c: 'text-slate-900' },
          { t: 'Vencidos', v: kpi.vencidos, c: 'text-red-600' },
          { t: 'Vencen hoy', v: kpi.hoy, c: 'text-amber-600' },
          { t: 'Cumplidos (7 días)', v: kpi.semana, c: 'text-emerald-600' },
        ].map((k) => (
          <div key={k.t} className="tk-tarjeta px-4 py-3">
            <div className="text-xs font-medium text-slate-500">{k.t}</div>
            <div className={`mt-0.5 text-3xl font-bold tabular-nums ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>

      {compromisos.length === 0 ? (
        <div className="tk-tarjeta px-6 py-14 text-center">
          <p className="text-lg font-semibold text-slate-800">Todavía no hay compromisos</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Graba la primera reunión. Al terminar, Tasking saca los compromisos de cada persona y se los envía por WhatsApp y correo.
          </p>
          {admin && (
            <Link href="/tasking/reunion" className="tk-btn-primario mt-5">
              Grabar una reunión
            </Link>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNAS.map((col) => {
            const items = visibles.filter((c) => columnaDe(c) === col.clave).sort(ordenar);
            return (
              <section key={col.clave} className="rounded-2xl bg-slate-100/70 p-2.5">
                <h2 className="flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-sm font-semibold text-slate-700">
                  <span className={`size-2 rounded-full ${col.punto}`} />
                  {col.titulo}
                  <span className="ml-auto rounded-full bg-white px-2 text-xs text-slate-500 tabular-nums">{items.length}</span>
                </h2>
                <div className="space-y-2">
                  {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-slate-400">{col.vacio}</p>}
                  {items.map((c) => (
                    <TarjetaCompromiso
                      key={c.id}
                      c={c}
                      persona={c.persona_id ? porId.get(c.persona_id) : undefined}
                      reunion={c.reunion_id ? reuniones[c.reunion_id] : undefined}
                      puedeEditar={admin || (!!yo && c.persona_id === yo)}
                      cambiar={cambiar}
                      ocupado={ocupado === c.id}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
