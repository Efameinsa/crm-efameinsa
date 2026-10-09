'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { deLima, fechaLarga, fechaLima, partesLima } from '@/lib/tasking/fechas';
import { estaVencido, type Compromiso, type Mensaje, type Reunion } from '@/lib/tasking/tipos';
import { ChipPlazo, type PersonaMin } from './TarjetaCompromiso';

const dos = (n: number) => String(n).padStart(2, '0');
function horaLima(iso: string) {
  const p = partesLima(iso);
  return `${dos(p.hora)}:${dos(p.minuto)}`;
}

const ESTADOS = [
  ['pendiente', 'Pendiente'],
  ['en_curso', 'En curso'],
  ['hecho', 'Hecho'],
  ['anulado', 'Anulado'],
] as const;

function FilaCompromiso({ c, personas }: { c: Compromiso; personas: PersonaMin[] }) {
  const router = useRouter();
  const inicial = {
    persona_id: c.persona_id ?? '',
    descripcion: c.descripcion,
    fecha: c.vence_en ? fechaLima(c.vence_en) : '',
    hora: c.vence_en && c.hora_definida ? horaLima(c.vence_en) : '',
    estado: c.estado,
  };
  const [f, setF] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const cambiado = JSON.stringify(f) !== JSON.stringify(inicial);

  async function guardar() {
    setGuardando(true);
    setError('');
    const cuerpo: Record<string, unknown> = {};
    if (f.persona_id !== inicial.persona_id) cuerpo.persona_id = f.persona_id || null;
    if (f.descripcion !== inicial.descripcion) cuerpo.descripcion = f.descripcion;
    if (f.fecha !== inicial.fecha || f.hora !== inicial.hora) {
      cuerpo.vence_en = f.fecha ? deLima(f.fecha, f.hora || '18:00').toISOString() : null;
      cuerpo.hora_definida = !!(f.fecha && f.hora);
    }
    if (f.estado !== inicial.estado) cuerpo.estado = f.estado;
    const r = await fetch(`/api/tasking/compromisos/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
    setGuardando(false);
    if (!r.ok) return setError((await r.json().catch(() => ({}))).error || 'No se pudo guardar.');
    router.refresh();
  }

  const anulado = c.estado === 'anulado';
  return (
    <div className={`rounded-xl border p-3 ${anulado ? 'border-slate-100 bg-slate-50 opacity-60' : estaVencido(c) ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="font-mono">#{c.numero}</span>
        <ChipPlazo c={c} />
        {!c.persona_id && c.responsable_texto && <span className="tk-chip bg-amber-50 text-amber-800">La IA escuchó «{c.responsable_texto}»: elige a quién corresponde</span>}
      </div>
      <div className="mt-2 grid gap-2 md:grid-cols-[180px_1fr_150px_110px_130px]">
        <select value={f.persona_id} onChange={(e) => setF({ ...f, persona_id: e.target.value })} className={`tk-campo ${!f.persona_id ? 'border-amber-300' : ''}`}>
          <option value="">— Responsable —</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="tk-campo" />
        <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className="tk-campo" title="Fecha límite" />
        <input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} className="tk-campo" title="Hora (vacío = durante el día)" />
        <select value={f.estado} onChange={(e) => setF({ ...f, estado: e.target.value as Compromiso['estado'] })} className="tk-campo">
          {ESTADOS.map(([v, t]) => (
            <option key={v} value={v}>{t}</option>
          ))}
        </select>
      </div>
      {c.cita && <p className="mt-2 text-xs text-slate-400 italic">«{c.cita}»</p>}
      {(cambiado || error) && (
        <div className="mt-2 flex items-center gap-2">
          {cambiado && (
            <>
              <button onClick={guardar} disabled={guardando} className="tk-btn-primario tk-btn-chico">{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
              <button onClick={() => setF(inicial)} className="tk-btn-claro tk-btn-chico">Deshacer</button>
              <span className="text-xs text-slate-400">Los recordatorios se reprograman solos.{f.persona_id !== inicial.persona_id && f.persona_id ? ' Se avisará al nuevo responsable.' : ''}</span>
            </>
          )}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

function NuevoCompromiso({ reunionId, personas }: { reunionId: string; personas: PersonaMin[] }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [f, setF] = useState({ persona_id: '', descripcion: '', fecha: '', hora: '' });
  const [guardando, setGuardando] = useState(false);
  if (!abierto) return <button onClick={() => setAbierto(true)} className="tk-btn-claro">+ Agregar compromiso</button>;
  return (
    <form
      className="rounded-xl border border-dashed border-tk-300 bg-tk-50/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setGuardando(true);
        await fetch('/api/tasking/compromisos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reunion_id: reunionId, persona_id: f.persona_id, descripcion: f.descripcion, vence_en: f.fecha ? deLima(f.fecha, f.hora || '18:00').toISOString() : null, hora_definida: !!(f.fecha && f.hora) }),
        });
        setGuardando(false);
        setF({ persona_id: '', descripcion: '', fecha: '', hora: '' });
        setAbierto(false);
        router.refresh();
      }}
    >
      <div className="grid gap-2 md:grid-cols-[180px_1fr_150px_110px]">
        <select required value={f.persona_id} onChange={(e) => setF({ ...f, persona_id: e.target.value })} className="tk-campo">
          <option value="">— Responsable —</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
        <input required placeholder="Qué tiene que hacer" value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} className="tk-campo" />
        <input type="date" value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} className="tk-campo" />
        <input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} className="tk-campo" />
      </div>
      <div className="mt-2 flex gap-2">
        <button disabled={guardando} className="tk-btn-primario tk-btn-chico">{guardando ? 'Guardando…' : 'Agregar y avisar'}</button>
        <button type="button" onClick={() => setAbierto(false)} className="tk-btn-claro tk-btn-chico">Cancelar</button>
      </div>
    </form>
  );
}

const ESTADO_MSG: Record<string, string> = {
  pendiente: 'bg-slate-100 text-slate-600',
  enviando: 'bg-amber-50 text-amber-800',
  enviado: 'bg-emerald-50 text-emerald-700',
  error: 'bg-red-50 text-red-700',
  cancelado: 'bg-slate-50 text-slate-400',
};

export default function Acta({ reunion: r, compromisos, mensajes, personas }: { reunion: Reunion; compromisos: Compromiso[]; mensajes: Mensaje[]; personas: PersonaMin[] }) {
  const router = useRouter();
  const [accion, setAccion] = useState<'' | 'procesar' | 'eliminar'>('');
  const [ocupado, setOcupado] = useState(false);
  const reintentoAuto = r.estado === 'error' && !!r.error?.startsWith('Gemini no respondió') && (r.intentos ?? 0) < 4;
  const enCurso = r.estado === 'procesando' || reintentoAuto;

  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => router.refresh(), 3000);
    return () => clearInterval(t);
  }, [enCurso, router]);

  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const minutos = r.fin ? Math.max(1, Math.round((+new Date(r.fin) - +new Date(r.inicio)) / 60000)) : null;
  const activos = compromisos.filter((c) => c.estado !== 'anulado');
  const hechos = activos.filter((c) => c.estado === 'hecho').length;

  async function procesar() {
    setOcupado(true);
    await fetch(`/api/tasking/reuniones/${r.id}/terminar`, { method: 'POST' });
    setOcupado(false);
    setAccion('');
    router.refresh();
  }
  async function eliminar() {
    setOcupado(true);
    await fetch(`/api/tasking/reuniones/${r.id}`, { method: 'DELETE' });
    router.push('/tasking/reuniones');
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/tasking/reuniones" className="text-sm text-slate-500 hover:text-slate-800">← Reuniones</Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{r.titulo}</h1>
          <p className="text-sm text-slate-500">
            {fechaLarga(r.inicio)}
            {minutos ? ` · ${minutos} min` : ''}
            {r.fuente ? ` · ${r.fuente === 'audio' ? 'transcrito del audio' : 'subtítulos en vivo'}` : ''}
          </p>
        </div>
        {activos.length > 0 && (
          <div className="tk-tarjeta px-4 py-2.5 text-right">
            <div className="text-xs text-slate-500">Cumplimiento</div>
            <div className="text-xl font-bold text-slate-900 tabular-nums">{hechos}/{activos.length} <span className="text-sm font-medium text-emerald-600">{Math.round((hechos / activos.length) * 100)}%</span></div>
          </div>
        )}
      </div>

      {(r.estado === 'procesando' || r.estado === 'grabando') && (
        <div className="tk-tarjeta flex items-center gap-4 p-5">
          {r.estado === 'procesando' && <div className="size-8 shrink-0 animate-spin rounded-full border-4 border-tk-100 border-t-tk-600" />}
          <div className="flex-1">
            <p className="font-semibold text-slate-800">{r.estado === 'procesando' ? 'Armando el acta con IA…' : 'Esta reunión quedó abierta (se cerró la pestaña sin terminar).'}</p>
            <p className="text-sm text-slate-500">{r.estado === 'procesando' ? 'Esta página se actualiza sola.' : 'Puedes cerrarla y procesar lo que se alcanzó a grabar.'}</p>
          </div>
          {r.estado === 'grabando' && <button onClick={procesar} disabled={ocupado} className="tk-btn-primario">Cerrar y procesar</button>}
        </div>
      )}

      {r.estado === 'error' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5">
          <p className="font-semibold text-red-800">No se pudo armar el acta</p>
          <p className="mt-1 text-sm text-red-700">{r.error}</p>
          {reintentoAuto && <p className="mt-2 text-sm font-medium text-red-800">Se volverá a intentar solo en unos minutos (intento {r.intentos} de 4). Esta página se actualiza sola.</p>}
          <button onClick={procesar} disabled={ocupado} className="tk-btn-primario mt-3">{ocupado ? 'Enviando…' : 'Volver a intentar'}</button>
        </div>
      )}

      {r.resumen && (
        <section className="tk-tarjeta p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase">Resumen</h2>
          <p className="mt-2 leading-relaxed text-slate-800">{r.resumen}</p>
          {r.temas?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.temas.map((t) => <span key={t} className="tk-chip bg-tk-50 text-tk-700">{t}</span>)}
            </div>
          )}
          {r.acuerdos_generales?.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-slate-700">Acuerdos generales</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {r.acuerdos_generales.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      {r.estado === 'lista' && (
        <section className="space-y-2.5">
          <h2 className="text-lg font-semibold text-slate-900">Compromisos ({activos.length})</h2>
          {compromisos.length === 0 && <p className="text-sm text-slate-500">La IA no encontró compromisos en esta reunión. Puedes agregarlos a mano.</p>}
          {compromisos.map((c) => <FilaCompromiso key={c.id + c.actualizado_en} c={c} personas={personas} />)}
          <NuevoCompromiso reunionId={r.id} personas={personas} />
        </section>
      )}

      {mensajes.length > 0 && (
        <section className="tk-tarjeta p-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase">Envíos de esta reunión</h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {mensajes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="w-20 text-xs font-medium text-slate-500">{m.canal === 'whatsapp' ? 'WhatsApp' : 'Correo'}</span>
                <span className="flex-1 text-slate-700">{(m.persona_id && nombre.get(m.persona_id)) || m.destino}{m.tipo === 'reporte' ? ' (gerencia)' : ''}</span>
                <span className={`tk-chip ${ESTADO_MSG[m.estado]}`}>{m.estado}</span>
                {m.error && <span className="w-full text-xs text-red-600">{m.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.transcripcion && (
        <details className="tk-tarjeta p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-700">Ver transcripción ({r.transcripcion.split(/\s+/).length} palabras)</summary>
          <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-600">{r.transcripcion}</p>
        </details>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
        {accion === '' && (
          <>
            {(r.estado === 'lista' || r.estado === 'error') && <button onClick={() => setAccion('procesar')} className="tk-btn-claro tk-btn-chico">Volver a procesar con IA</button>}
            <button onClick={() => setAccion('eliminar')} className="tk-btn-claro tk-btn-chico text-red-600">Eliminar reunión</button>
          </>
        )}
        {accion === 'procesar' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Se reemplazarán los compromisos de esta reunión y se volverán a enviar. ¿Seguro?</span>
            <button onClick={procesar} disabled={ocupado} className="tk-btn-primario tk-btn-chico">Sí, reprocesar</button>
            <button onClick={() => setAccion('')} className="tk-btn-claro tk-btn-chico">No</button>
          </div>
        )}
        {accion === 'eliminar' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Se borrará la reunión, sus compromisos y sus recordatorios pendientes. ¿Seguro?</span>
            <button onClick={eliminar} disabled={ocupado} className="tk-btn-peligro tk-btn-chico">Sí, eliminar</button>
            <button onClick={() => setAccion('')} className="tk-btn-claro tk-btn-chico">No</button>
          </div>
        )}
      </div>
    </div>
  );
}
