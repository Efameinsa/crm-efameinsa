import { db } from './db';
import type { Compromiso, Persona, Reunion } from './tipos';

export async function personasActivas() {
  const { data } = await db().from('personas').select('*').eq('activo', true).order('nombre');
  return (data ?? []) as Persona[];
}

/** Abiertos + hechos de los últimos `diasHechos` días (lo que muestra el tablero). */
export async function compromisosTablero(o: { personaId?: string; diasHechos?: number } = {}) {
  const desde = new Date(Date.now() - (o.diasHechos ?? 14) * 86400_000).toISOString();
  let abiertos = db().from('compromisos').select('*').in('estado', ['pendiente', 'en_curso']);
  let hechos = db().from('compromisos').select('*').eq('estado', 'hecho').gte('hecho_en', desde);
  if (o.personaId) {
    abiertos = abiertos.eq('persona_id', o.personaId);
    hechos = hechos.eq('persona_id', o.personaId);
  }
  const [a, h] = await Promise.all([abiertos, hechos]);
  return [...((a.data ?? []) as Compromiso[]), ...((h.data ?? []) as Compromiso[])];
}

export async function titulosReuniones(ids: (string | null)[]) {
  const unicos = [...new Set(ids.filter(Boolean))] as string[];
  if (!unicos.length) return {} as Record<string, { titulo: string; inicio: string }>;
  const { data } = await db().from('reuniones').select('id,titulo,inicio').in('id', unicos);
  return Object.fromEntries(((data ?? []) as Pick<Reunion, 'id' | 'titulo' | 'inicio'>[]).map((r) => [r.id, { titulo: r.titulo, inicio: r.inicio }]));
}
