'use client';
import { fechaLima } from '@/lib/tasking/fechas';
import { estaVencido, type Compromiso } from '@/lib/tasking/tipos';
import TarjetaCompromiso, { useCambiarEstado, type PersonaMin } from './TarjetaCompromiso';

export default function MisCompromisos({ persona, compromisos, reuniones }: { persona: PersonaMin; compromisos: Compromiso[]; reuniones: Record<string, { titulo: string }> }) {
  const { cambiar, ocupado } = useCambiarEstado();
  const hoy = fechaLima();
  const abiertos = compromisos.filter((c) => c.estado !== 'hecho').sort((a, b) => (a.vence_en ?? '9').localeCompare(b.vence_en ?? '9'));
  const grupos = [
    { t: 'Vencidos', items: abiertos.filter((c) => estaVencido(c)), color: 'text-red-600' },
    { t: 'Para hoy', items: abiertos.filter((c) => !estaVencido(c) && c.vence_en && fechaLima(c.vence_en) === hoy), color: 'text-amber-600' },
    { t: 'Próximos', items: abiertos.filter((c) => !estaVencido(c) && c.vence_en && fechaLima(c.vence_en) > hoy), color: 'text-slate-800' },
    { t: 'Sin fecha', items: abiertos.filter((c) => !c.vence_en), color: 'text-slate-500' },
    { t: 'Hechos (30 días)', items: compromisos.filter((c) => c.estado === 'hecho').sort((a, b) => (b.hecho_en ?? '').localeCompare(a.hecho_en ?? '')), color: 'text-emerald-600' },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Hola, {persona.nombre.split(' ')[0]}</h1>
        <p className="text-sm text-slate-500">
          {abiertos.length ? `Tienes ${abiertos.length} compromiso${abiertos.length > 1 ? 's' : ''} abierto${abiertos.length > 1 ? 's' : ''}.` : 'No tienes compromisos pendientes. 🎉'} Márcalos al terminarlos, o responde «listo» y el número por WhatsApp.
        </p>
      </div>
      {grupos
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.t}>
            <h2 className={`mb-2 text-sm font-semibold ${g.color}`}>
              {g.t} · {g.items.length}
            </h2>
            <div className="space-y-2">
              {g.items.map((c) => (
                <TarjetaCompromiso key={c.id} c={c} persona={persona} reunion={c.reunion_id ? reuniones[c.reunion_id] : undefined} puedeEditar cambiar={cambiar} ocupado={ocupado === c.id} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
