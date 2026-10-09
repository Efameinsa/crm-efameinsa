import Link from 'next/link';
import { personasActivas } from '@/lib/tasking/consultas';
import { db } from '@/lib/tasking/db';
import { ahoraMs, plazoTexto } from '@/lib/tasking/fechas';
import { estaVencido, type Compromiso } from '@/lib/tasking/tipos';
import { Avatar } from '@/components/tasking/TarjetaCompromiso';

export const metadata = { title: 'Reportes' };

const PERIODOS = [7, 30, 90];

function Barra({ valor, color }: { valor: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(valor * 100)}%` }} />
    </div>
  );
}

export default async function Pagina({ searchParams }: PageProps<'/tasking/reportes'>) {
  const sp = await searchParams;
  const dias = PERIODOS.includes(Number(sp.dias)) ? Number(sp.dias) : 30;
  const ahora = ahoraMs();
  const desde = new Date(ahora - dias * 86400_000).toISOString();

  const [personas, { data: delPeriodo }, { data: abiertos }] = await Promise.all([
    personasActivas(),
    db().from('compromisos').select('*').gte('creado_en', desde).neq('estado', 'anulado'),
    db().from('compromisos').select('*').in('estado', ['pendiente', 'en_curso']),
  ]);
  const periodo = (delPeriodo ?? []) as Compromiso[];
  const abiertosTodos = (abiertos ?? []) as Compromiso[];
  const vencidos = abiertosTodos.filter((c) => estaVencido(c, ahora)).sort((a, b) => a.vence_en!.localeCompare(b.vence_en!));

  const filas = personas
    .map((p) => {
      const suyos = periodo.filter((c) => c.persona_id === p.id);
      const hechos = suyos.filter((c) => c.estado === 'hecho');
      const aTiempo = hechos.filter((c) => !c.vence_en || (c.hecho_en && c.hecho_en <= c.vence_en));
      return {
        p,
        asignados: suyos.length,
        hechos: hechos.length,
        aTiempo: aTiempo.length,
        abiertos: abiertosTodos.filter((c) => c.persona_id === p.id).length,
        vencidos: vencidos.filter((c) => c.persona_id === p.id).length,
      };
    })
    .filter((f) => f.asignados || f.abiertos)
    .sort((a, b) => b.vencidos - a.vencidos || a.hechos / (a.asignados || 1) - b.hechos / (b.asignados || 1));

  const tot = {
    asignados: periodo.length,
    hechos: periodo.filter((c) => c.estado === 'hecho').length,
    aTiempo: periodo.filter((c) => c.estado === 'hecho' && (!c.vence_en || (c.hecho_en && c.hecho_en <= c.vence_en))).length,
  };
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reportes de cumplimiento</h1>
          <p className="text-sm text-slate-500">Compromisos asignados en los últimos {dias} días y lo que sigue vencido hoy.</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {PERIODOS.map((d) => (
            <Link key={d} href={`/tasking/reportes?dias=${d}`} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${d === dias ? 'bg-tk-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
              {d} días
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { t: 'Asignados', v: String(tot.asignados), c: 'text-slate-900' },
          { t: 'Cumplimiento', v: `${pct(tot.hechos, tot.asignados)}%`, c: 'text-emerald-600' },
          { t: 'Cumplidos a tiempo', v: `${pct(tot.aTiempo, tot.hechos)}%`, c: 'text-tk-600' },
          { t: 'Vencidos hoy', v: String(vencidos.length), c: 'text-red-600' },
        ].map((k) => (
          <div key={k.t} className="tk-tarjeta px-4 py-3">
            <div className="text-xs font-medium text-slate-500">{k.t}</div>
            <div className={`mt-0.5 text-3xl font-bold tabular-nums ${k.c}`}>{k.v}</div>
          </div>
        ))}
      </div>

      <section className="tk-tarjeta overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase">
              <th className="px-5 py-3 font-semibold">Persona</th>
              <th className="px-3 py-3 text-right font-semibold">Asignados</th>
              <th className="w-44 px-3 py-3 font-semibold">Cumplimiento</th>
              <th className="px-3 py-3 text-right font-semibold">A tiempo</th>
              <th className="px-3 py-3 text-right font-semibold">Abiertos</th>
              <th className="px-5 py-3 text-right font-semibold">Vencidos</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-10 text-center text-slate-500">Sin datos en este periodo.</td>
              </tr>
            )}
            {filas.map((f) => (
              <tr key={f.p.id} className="border-b border-slate-50 last:border-0">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={f.p.nombre} id={f.p.id} chico />
                    <span className="font-medium text-slate-800">{f.p.nombre}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{f.asignados}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <Barra valor={f.asignados ? f.hechos / f.asignados : 0} color="bg-emerald-500" />
                    <span className="w-10 text-right text-xs tabular-nums text-slate-600">{pct(f.hechos, f.asignados)}%</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums text-slate-600">{f.hechos ? `${pct(f.aTiempo, f.hechos)}%` : '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{f.abiertos}</td>
                <td className={`px-5 py-3 text-right font-semibold tabular-nums ${f.vencidos ? 'text-red-600' : 'text-slate-300'}`}>{f.vencidos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tk-tarjeta p-5">
        <h2 className="font-semibold text-slate-800">Vencidos sin cumplir ({vencidos.length})</h2>
        {vencidos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">No hay compromisos vencidos. 🎉</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {vencidos.map((c) => {
              const diasTarde = Math.floor((ahora - new Date(c.vence_en!).getTime()) / 86400_000);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                  <span className="w-36 shrink-0 font-medium text-slate-800">{(c.persona_id && nombre.get(c.persona_id)) || c.responsable_texto || 'Sin responsable'}</span>
                  <span className="min-w-0 flex-1 text-slate-700">{c.descripcion}</span>
                  <span className="tk-chip bg-red-50 text-red-700">
                    venció {plazoTexto(c.vence_en, c.hora_definida)}
                    {diasTarde > 0 ? ` · ${diasTarde} d de atraso` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
