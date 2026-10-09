import { correoConfigurado } from '@/lib/tasking/correo';
import { db } from '@/lib/tasking/db';
import { ahoraMs, fechaLarga, plazoTexto } from '@/lib/tasking/fechas';
import type { Mensaje, Persona } from '@/lib/tasking/tipos';
import Refrescar from '@/components/tasking/Refrescar';
import BotonReintentar from '@/components/tasking/BotonReintentar';
import ControlWhatsapp from '@/components/tasking/ControlWhatsapp';

export const metadata = { title: 'WhatsApp y correo' };

type EstadoWa = { conectado: boolean; qr: string | null; numero: string | null; nombre: string | null; detalle: string | null; latido: string };

const ESTADO_MSG: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600',
  enviando: 'bg-amber-50 text-amber-800',
  enviado: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-700',
  cancelado: 'bg-slate-50 text-slate-400',
};

const TIPO: Record<string, string> = { sugerencia: "Sugerencia lista", asignacion: 'Compromisos', recordatorio: 'Recordatorio', vencido: 'Vencido', agenda: 'Agenda diaria', reporte: 'Reporte', prueba: 'Prueba' };

export default async function Pagina() {
  const ahora = new Date().toISOString();
  const [{ data: aj }, { data: recientes }, { data: proximos }, { data: ps }, errores] = await Promise.all([
    db().from('ajustes').select('valor').eq('clave', 'whatsapp').maybeSingle(),
    db().from('mensajes').select('*').lte('enviar_en', ahora).neq('estado', 'cancelado').order('enviar_en', { ascending: false }).limit(40),
    db().from('mensajes').select('*').gt('enviar_en', ahora).eq('estado', 'pendiente').order('enviar_en').limit(20),
    db().from('personas').select('id,nombre'),
    db().from('mensajes').select('id', { count: 'exact', head: true }).eq('estado', 'error'),
  ]);
  const wa = (aj?.valor ?? null) as EstadoWa | null;
  const vivo = !!wa && ahoraMs() - new Date(wa.latido).getTime() < 60_000;
  const nombre = new Map(((ps ?? []) as Pick<Persona, 'id' | 'nombre'>[]).map((p) => [p.id, p.nombre]));
  const correoOk = await correoConfigurado();

  const fila = (m: Mensaje, futuro: boolean) => (
    <li key={m.id} className="grid grid-cols-[80px_1fr_auto] items-start gap-x-3 gap-y-0.5 py-2.5 text-sm">
      <span className="text-xs font-medium text-slate-500">{m.canal === 'whatsapp' ? 'WhatsApp' : 'Correo'}</span>
      <div className="min-w-0">
        <div className="truncate text-slate-800">
          {(m.persona_id && nombre.get(m.persona_id)) || m.destino} <span className="text-slate-400">· {TIPO[m.tipo] ?? m.tipo}</span>
        </div>
        <div className="truncate text-xs text-slate-400">{m.cuerpo.replace(/\*/g, '').split('\n').filter(Boolean).slice(0, 2).join(' · ')}</div>
        {m.error && <div className="text-xs text-red-600">{m.error}</div>}
      </div>
      <div className="text-right">
        <span className={`tk-chip ${ESTADO_MSG[m.estado]}`}>{m.estado}</span>
        <div className="mt-0.5 text-[11px] text-slate-400">{futuro ? plazoTexto(m.enviar_en, true) : fechaLarga(m.enviado_en ?? m.enviar_en).split(', ').slice(-1)[0]}</div>
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <Refrescar cada={vivo && wa?.conectado ? 15000 : 3000} />
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">WhatsApp y correo</h1>
        <p className="text-sm text-slate-500">Estado de los canales de envío y la cola de avisos.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tk-tarjeta p-5">
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${vivo && wa?.conectado ? 'bg-emerald-500' : vivo ? 'bg-amber-500' : 'bg-slate-300'}`} />
            <h2 className="font-semibold text-slate-800">WhatsApp</h2>
            <span className="ml-auto text-sm text-slate-500">
              {vivo && wa?.conectado ? `Conectado${wa.numero ? ` · +${wa.numero}` : ''}` : vivo ? 'Esperando que escanees el QR' : 'Programa de envío apagado'}
            </span>
          </div>
          {vivo && !wa?.conectado && (
            <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {wa?.qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={wa.qr} alt="Código QR para vincular WhatsApp" className="size-60 rounded-xl border border-slate-200" />
              ) : (
                <div className="grid size-60 place-items-center rounded-xl border border-dashed border-slate-300 text-center text-sm text-slate-400">Preparando el QR…</div>
              )}
              <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                <li>Abre WhatsApp en el celular cuyo número enviará los avisos.</li>
                <li>Toca <b>⋮</b> o <b>Configuración</b> → <b>Dispositivos vinculados</b> → <b>Vincular un dispositivo</b>.</li>
                <li>Apunta la cámara a este código. Se renueva solo cada pocos segundos.</li>
              </ol>
            </div>
          )}
          {!vivo && (
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>{wa?.latido ? "El programa de envío de la máquina virtual no está respondiendo (servicio tasking-whatsapp). Los mensajes esperan en cola y salen apenas vuelva." : "El programa de envío todavía no arrancó en la máquina virtual (servicio tasking-whatsapp)."}</p>
              {wa?.latido && <p className="text-xs text-slate-400">Última señal: {fechaLarga(wa.latido)}</p>}
            </div>
          )}
          {vivo && wa?.conectado && <p className="mt-3 text-sm text-slate-600">Listo. Los compromisos y recordatorios salen desde {wa.nombre ? `«${wa.nombre}»` : 'este número'}. Si alguien responde «listo 154», se marca solo.</p>}
          {wa?.detalle && !wa.conectado && vivo && <p className="mt-2 text-xs text-amber-700">{wa.detalle}</p>}
          {vivo && <ControlWhatsapp conectado={!!wa?.conectado} />}
        </section>

        <section className="tk-tarjeta p-5">
          <div className="flex items-center gap-2">
            <span className={`size-2.5 rounded-full ${correoOk ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <h2 className="font-semibold text-slate-800">Correo</h2>
            <span className="ml-auto text-sm text-slate-500">{correoOk ? 'Configurado' : 'Falta configurar'}</span>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {correoOk
              ? 'Los correos salen solos cada minuto desde gestion1@, como el resto del CRM.'
              : 'El correo del CRM (gestion1@) no está configurado en este entorno. Mientras tanto los correos quedan en cola.'}
          </p>
          {(errores.count ?? 0) > 0 && (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              <span className="flex-1">{errores.count} mensajes con error.</span>
              <BotonReintentar />
            </div>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="tk-tarjeta p-5">
          <h2 className="font-semibold text-slate-800">Últimos envíos</h2>
          {(recientes ?? []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Todavía no hay envíos.</p> : <ul className="mt-2 divide-y divide-slate-100">{(recientes as Mensaje[]).map((m) => fila(m, false))}</ul>}
        </section>
        <section className="tk-tarjeta p-5">
          <h2 className="font-semibold text-slate-800">Próximos recordatorios</h2>
          {(proximos ?? []).length === 0 ? <p className="mt-2 text-sm text-slate-500">No hay recordatorios programados.</p> : <ul className="mt-2 divide-y divide-slate-100">{(proximos as Mensaje[]).map((m) => fila(m, true))}</ul>}
        </section>
      </div>
    </div>
  );
}
