import { avisarAsignacion, avisarGerenciaActa, programarCompromiso } from './avisos';
import { BUCKET_AUDIO, db } from './db';
import { deLima } from './fechas';
import { actaDesdeAudio, actaDesdeTexto, type CompromisoIA } from './gemini';
import type { Compromiso, EstadoCompromiso, Persona, Reunion } from './tipos';

// Si los subtítulos en vivo captaron menos palabras que esto, se usa el audio grabado como respaldo.
const MIN_PALABRAS_TEXTO = 40;

async function personasPorId(ids?: string[]) {
  let q = db().from('personas').select('*');
  if (ids) q = q.in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  const { data } = await q;
  return new Map(((data ?? []) as Persona[]).map((p) => [p.id, p]));
}

function plazoDesdeIA(c: CompromisoIA) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? c.fecha : '';
  const hora = /^\d{1,2}:\d{2}$/.test(c.hora) ? c.hora.padStart(5, '0') : '';
  if (!fecha) return { vence_en: null, hora_definida: false };
  // Sin hora: se toma el fin de la jornada (6 p. m.)
  return { vence_en: deLima(fecha, hora || '18:00').toISOString(), hora_definida: !!hora };
}

async function audioDeReunion(r: Reunion) {
  const partes: Buffer[] = [];
  for (let i = 0; i < r.audio_partes; i++) {
    const { data } = await db().storage.from(BUCKET_AUDIO).download(`${r.id}/${String(i).padStart(5, '0')}.webm`);
    if (data) partes.push(Buffer.from(await data.arrayBuffer()));
  }
  return Buffer.concat(partes);
}

/** Lo que pasa al apretar «Terminar reunión»: IA → compromisos → avisos. */
export async function procesarReunion(id: string) {
  const { data } = await db().from('reuniones').select('*').eq('id', id).single();
  const r = data as Reunion;
  await db().from('reuniones').update({ intentos: (r.intentos ?? 0) + 1, procesado_en: new Date().toISOString() }).eq('id', id);
  try {
    const todas = await personasPorId();
    const activos = [...todas.values()].filter((p) => p.activo);
    const participantes = r.participantes.length ? r.participantes.map((pid) => todas.get(pid)).filter(Boolean) as Persona[] : activos;
    // La IA también conoce al resto del equipo, por si se le asigna algo a alguien que no estuvo.
    const ausentes = activos.filter((p) => !participantes.some((x) => x.id === p.id));
    const lista = [...participantes, ...ausentes];
    const inicio = new Date(r.inicio);
    const fin = new Date(r.fin ?? Date.now());
    const palabras = r.transcripcion.trim().split(/\s+/).filter(Boolean).length;

    let resultado;
    let fuente: 'texto' | 'audio' = 'texto';
    if (palabras >= MIN_PALABRAS_TEXTO || r.audio_partes === 0) {
      if (palabras === 0) throw new Error('No se captó nada de la reunión (sin texto ni audio). Revisa el micrófono.');
      resultado = await actaDesdeTexto({ transcripcion: r.transcripcion, participantes: lista, inicio, fin, titulo: r.titulo });
    } else {
      fuente = 'audio';
      const audio = await audioDeReunion(r);
      if (!audio.length) throw new Error('No se encontró el audio de la reunión.');
      resultado = await actaDesdeAudio({ audio, mimeType: 'audio/webm', participantes: lista, inicio, fin, titulo: r.titulo });
    }
    const { acta, modelo } = resultado;

    // Por si se reprocesa: se quitan los compromisos que la IA creó antes para esta reunión
    const { data: previos } = await db().from('compromisos').select('id').eq('reunion_id', id);
    if (previos?.length) {
      await db().from('mensajes').update({ estado: 'cancelado' }).in('compromiso_id', previos.map((p) => p.id)).eq('estado', 'pendiente');
      await db().from('compromisos').delete().eq('reunion_id', id);
    }

    const filas = acta.compromisos
      .filter((c) => c.tarea?.trim())
      .map((c) => {
        const persona = todas.get(c.responsable_id);
        return {
          reunion_id: id,
          persona_id: persona ? persona.id : null,
          responsable_texto: persona ? null : c.responsable_nombre || null,
          descripcion: c.tarea.trim().slice(0, 300),
          cita: c.cita?.slice(0, 300) || null,
          ...plazoDesdeIA(c),
        };
      });
    const { data: creados, error } = filas.length
      ? await db().from('compromisos').insert(filas).select('*')
      : { data: [], error: null };
    if (error) throw new Error(error.message);
    const compromisos = (creados ?? []) as Compromiso[];

    const cambios: Partial<Reunion> = {
      estado: 'lista',
      resumen: acta.resumen,
      temas: acta.temas ?? [],
      acuerdos_generales: acta.acuerdos_generales ?? [],
      modelo,
      fuente,
      error: null,
    };
    if (fuente === 'audio' && acta.transcripcion) cambios.transcripcion = acta.transcripcion;
    await db().from('reuniones').update(cambios).eq('id', id);

    // Avisos: una lista por persona + recordatorios de cada compromiso + acta a gerencia
    const porPersona = new Map<string, Compromiso[]>();
    for (const c of compromisos) if (c.persona_id) porPersona.set(c.persona_id, [...(porPersona.get(c.persona_id) ?? []), c]);
    for (const [pid, lista] of porPersona) {
      const p = todas.get(pid)!;
      await avisarAsignacion(p, lista, r);
      for (const c of lista) await programarCompromiso(c, p);
    }
    await avisarGerenciaActa({ ...r, ...cambios } as Reunion, compromisos, todas);
    return { ok: true, compromisos: compromisos.length };
  } catch (e) {
    await db().from('reuniones').update({ estado: 'error', error: (e as Error).message.slice(0, 800) }).eq('id', id);
    return { ok: false, error: (e as Error).message };
  }
}

const MAX_INTENTOS_AUTOMATICOS = 4;

/** Vuelve a procesar sola una reunión que falló por saturación de Gemini (la llama el cron). */
export async function reintentarFallidas() {
  const hace3min = new Date(Date.now() - 3 * 60_000).toISOString();
  const hace12h = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data } = await db()
    .from('reuniones')
    .select('id')
    .eq('estado', 'error')
    .like('error', 'Gemini no respondió%')
    .lt('intentos', MAX_INTENTOS_AUTOMATICOS)
    .lt('procesado_en', hace3min)
    .gt('inicio', hace12h)
    .limit(1);
  const r = data?.[0];
  if (!r) return null;
  // Se marca «procesando» antes, para que dos cron seguidos no la tomen a la vez
  const { data: tomada } = await db().from('reuniones').update({ estado: 'procesando' }).eq('id', r.id).eq('estado', 'error').select('id');
  if (!tomada?.length) return null;
  return r.id as string;
}

export interface CambioCompromiso {
  estado?: EstadoCompromiso;
  descripcion?: string;
  persona_id?: string | null;
  vence_en?: string | null;
  hora_definida?: boolean;
}

/** Aplica un cambio, reprograma los recordatorios y avisa al nuevo responsable si se reasignó. */
export async function actualizarCompromiso(id: string, cambio: CambioCompromiso) {
  const { data: antes } = await db().from('compromisos').select('*').eq('id', id).single();
  if (!antes) throw new Error('No existe ese compromiso.');
  const fila: Record<string, unknown> = { ...cambio, actualizado_en: new Date().toISOString() };
  if (cambio.estado) fila.hecho_en = cambio.estado === 'hecho' ? new Date().toISOString() : null;
  if (cambio.persona_id) fila.responsable_texto = null;
  const { data: despues, error } = await db().from('compromisos').update(fila).eq('id', id).select('*').single();
  if (error) throw new Error(error.message);
  const c = despues as Compromiso;
  const personas = c.persona_id ? await personasPorId([c.persona_id]) : new Map();
  const persona = (c.persona_id && personas.get(c.persona_id)) || null;

  const reprogramar = 'vence_en' in cambio || 'hora_definida' in cambio || 'estado' in cambio || 'persona_id' in cambio || 'descripcion' in cambio;
  if (reprogramar) await programarCompromiso(c, persona);
  if (persona && cambio.persona_id && cambio.persona_id !== antes.persona_id) {
    const { data: r } = c.reunion_id ? await db().from('reuniones').select('id,titulo').eq('id', c.reunion_id).single() : { data: null };
    await avisarAsignacion(persona, [c], r);
  }
  return c;
}

export async function crearCompromiso(o: { reunion_id?: string | null; persona_id: string; descripcion: string; vence_en: string | null; hora_definida: boolean }) {
  const { data, error } = await db()
    .from('compromisos')
    .insert({ reunion_id: o.reunion_id ?? null, persona_id: o.persona_id, descripcion: o.descripcion.trim(), vence_en: o.vence_en, hora_definida: o.hora_definida })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const c = data as Compromiso;
  const persona = (await personasPorId([o.persona_id])).get(o.persona_id)!;
  const { data: r } = c.reunion_id ? await db().from('reuniones').select('id,titulo').eq('id', c.reunion_id).single() : { data: null };
  await avisarAsignacion(persona, [c], r);
  await programarCompromiso(c, persona);
  return c;
}
