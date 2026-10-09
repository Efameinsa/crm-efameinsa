import { appUrl, db } from './db';
import { fechaLima, partesLima, plazoTexto, sumarDias } from './fechas';
import { estaVencido, type Compromiso, type Persona, type Reunion } from './tipos';

// Arma los mensajes y los deja en la bandeja `mensajes` con su hora de envío.
// WhatsApp lo envía el worker local; el correo lo envía /api/cron (cada minuto).

type NuevoMensaje = {
  canal: 'whatsapp' | 'correo';
  tipo: string;
  persona_id?: string | null;
  compromiso_id?: string | null;
  reunion_id?: string | null;
  destino: string;
  asunto?: string;
  cuerpo: string;
  html?: string;
  enviar_en?: string;
};

const MIN = 60_000;

export function enlacePersonal(p: Pick<Persona, 'token'>) {
  return `${appUrl()}/t/${p.token}`;
}

function escapar(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Plantilla de correo sencilla y legible en cualquier cliente. */
function htmlCorreo(titulo: string, bloques: string[], enlace?: { texto: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f7;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<div style="font-weight:700;font-size:15px;color:#7E1210;letter-spacing:.3px">TASKING</div>
<div style="background:#fff;border-radius:14px;padding:22px 22px 18px;margin-top:10px;border:1px solid #e5e7eb">
<h1 style="font-size:19px;margin:0 0 14px">${escapar(titulo)}</h1>
${bloques.join('\n')}
${enlace ? `<p style="margin:22px 0 4px"><a href="${enlace.url}" style="background:#7E1210;color:#fff;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:600;display:inline-block">${escapar(enlace.texto)}</a></p>` : ''}
</div>
<p style="font-size:12px;color:#6b7280;margin-top:14px">Mensaje automático de Tasking, el sistema interno de actas y compromisos.</p>
</div></body></html>`;
}

function filaCompromiso(c: Compromiso, conPersona?: string) {
  const vencido = estaVencido(c);
  const plazo = plazoTexto(c.vence_en, c.hora_definida);
  return `<div style="padding:10px 12px;border:1px solid ${vencido ? '#fecaca' : '#e5e7eb'};background:${vencido ? '#fef2f2' : '#fafafa'};border-radius:10px;margin:8px 0">
<div style="font-size:15px">${conPersona ? `<b>${escapar(conPersona)}:</b> ` : ''}${escapar(c.descripcion)}</div>
<div style="font-size:13px;color:${vencido ? '#b91c1c' : '#6b7280'};margin-top:3px">${vencido ? 'Venció: ' : 'Plazo: '}${plazo} · #${c.numero}</div></div>`;
}

function lineaWa(c: Compromiso, i?: number) {
  const plazo = plazoTexto(c.vence_en, c.hora_definida);
  return `${i !== undefined ? `${i + 1}. ` : '• '}${c.descripcion}\n   ⏰ ${plazo} · #${c.numero}`;
}

async function encolar(mensajes: NuevoMensaje[]) {
  if (!mensajes.length) return;
  const { error } = await db().from('mensajes').insert(mensajes);
  if (error) throw new Error(`No se pudieron encolar los avisos: ${error.message}`);
}

/** Lista de compromisos nuevos para una persona (al terminar la reunión o al reasignar). */
export async function avisarAsignacion(persona: Persona, compromisos: Compromiso[], reunion: Pick<Reunion, 'id' | 'titulo'> | null) {
  if (!compromisos.length) return;
  const enlace = enlacePersonal(persona);
  const nombre = persona.nombre.split(' ')[0];
  const origen = reunion ? `de la reunión «${reunion.titulo}»` : 'nuevos';
  const msgs: NuevoMensaje[] = [];
  if (persona.whatsapp) {
    const ej = compromisos[0].numero;
    msgs.push({
      canal: 'whatsapp',
      tipo: 'asignacion',
      persona_id: persona.id,
      reunion_id: reunion?.id ?? null,
      destino: persona.whatsapp,
      cuerpo: `📋 *Tus compromisos ${origen}*\n\nHola ${nombre}, quedaste a cargo de:\n\n${compromisos.map(lineaWa).join('\n\n')}\n\nCuando termines uno, responde *listo ${ej}* (con su número) o márcalo aquí:\n${enlace}`,
    });
  }
  if (persona.correo) {
    msgs.push({
      canal: 'correo',
      tipo: 'asignacion',
      persona_id: persona.id,
      reunion_id: reunion?.id ?? null,
      destino: persona.correo,
      asunto: `Tus compromisos ${origen}`,
      cuerpo: `Hola ${nombre}, quedaste a cargo de:\n\n${compromisos.map((c) => `- ${c.descripcion} (${plazoTexto(c.vence_en, c.hora_definida)})`).join('\n')}\n\nMárcalos como hechos en: ${enlace}`,
      html: htmlCorreo(`Hola ${nombre}, estos son tus compromisos`, [
        reunion ? `<p style="margin:0 0 6px;color:#4b5563">Acordados en la reunión <b>${escapar(reunion.titulo)}</b>.</p>` : '',
        ...compromisos.map((c) => filaCompromiso(c)),
      ], { texto: 'Ver y marcar mis compromisos', url: enlace }),
    });
  }
  await encolar(msgs);
}

/** Recordatorios de un compromiso: 30 y 5 minutos antes, y aviso de vencido. Reemplaza los anteriores. */
export async function programarCompromiso(c: Compromiso, persona: Persona | null) {
  await db()
    .from('mensajes')
    .update({ estado: 'cancelado' })
    .eq('compromiso_id', c.id)
    .eq('estado', 'pendiente')
    .in('tipo', ['recordatorio', 'vencido']);

  if (!persona || !c.vence_en || (c.estado !== 'pendiente' && c.estado !== 'en_curso')) return;
  const vence = new Date(c.vence_en).getTime();
  const ahora = Date.now();
  const enlace = enlacePersonal(persona);
  const msgs: NuevoMensaje[] = [];
  const base = { persona_id: persona.id, compromiso_id: c.id, reunion_id: c.reunion_id };
  const canalRapido = persona.whatsapp
    ? { canal: 'whatsapp' as const, destino: persona.whatsapp }
    : persona.correo
      ? { canal: 'correo' as const, destino: persona.correo }
      : null;

  if (c.hora_definida && canalRapido) {
    for (const [minutos, icono, titulo] of [
      [30, '⏰', 'Faltan 30 minutos'],
      [5, '⚠️', 'Faltan 5 minutos'],
    ] as const) {
      const t = vence - minutos * MIN;
      if (t <= ahora + MIN) continue;
      msgs.push({
        ...base,
        ...canalRapido,
        tipo: 'recordatorio',
        enviar_en: new Date(t).toISOString(),
        asunto: `${titulo}: ${c.descripcion.slice(0, 60)}`,
        cuerpo: `${icono} *${titulo}*\n\n${c.descripcion}\nVence ${plazoTexto(c.vence_en, true)} · #${c.numero}\n\nSi ya lo hiciste, responde *listo ${c.numero}*.`,
        html: htmlCorreo(titulo, [filaCompromiso(c)], { texto: 'Marcar como hecho', url: enlace }),
      });
    }
  }

  const tVencido = c.hora_definida ? vence + MIN : vence;
  if (tVencido > ahora) {
    const texto = `🔴 *Se venció el plazo*\n\n${c.descripcion}\nVenció ${plazoTexto(c.vence_en, c.hora_definida)} · #${c.numero}\n\n¿Ya lo hiciste? Responde *listo ${c.numero}* o márcalo aquí:\n${enlace}\nSi necesitas más plazo, coordínalo con tu jefe.`;
    if (persona.whatsapp)
      msgs.push({ ...base, canal: 'whatsapp', destino: persona.whatsapp, tipo: 'vencido', enviar_en: new Date(tVencido).toISOString(), cuerpo: texto });
    if (persona.correo)
      msgs.push({
        ...base,
        canal: 'correo',
        destino: persona.correo,
        tipo: 'vencido',
        enviar_en: new Date(tVencido).toISOString(),
        asunto: `Venció: ${c.descripcion.slice(0, 70)}`,
        cuerpo: texto.replace(/\*/g, ''),
        html: htmlCorreo('Se venció el plazo de un compromiso', [
          `<p style="margin:0 0 6px;color:#4b5563">Si ya lo hiciste, márcalo como hecho. Si necesitas más plazo, coordínalo con tu jefe.</p>`,
          `<div style="padding:10px 12px;border:1px solid #fecaca;background:#fef2f2;border-radius:10px"><div style="font-size:15px">${escapar(c.descripcion)}</div><div style="font-size:13px;color:#b91c1c;margin-top:3px">Venció ${plazoTexto(c.vence_en, c.hora_definida)} · #${c.numero}</div></div>`,
        ], { texto: 'Marcar como hecho', url: enlace }),
      });
  }
  await encolar(msgs);
}

async function gerentes() {
  const { data } = await db().from('personas').select('*').eq('activo', true).eq('es_gerencia', true);
  return (data ?? []) as Persona[];
}

/** Acta resumida para gerencia al terminar cada reunión. */
export async function avisarGerenciaActa(reunion: Reunion, compromisos: Compromiso[], personas: Map<string, Persona>) {
  const destinatarios = await gerentes();
  if (!destinatarios.length) return;
  const url = `${appUrl()}/tasking/reuniones/${reunion.id}`;
  const nombre = (c: Compromiso) => (c.persona_id && personas.get(c.persona_id)?.nombre) || c.responsable_texto || 'Sin responsable';
  const lineas = compromisos.map((c) => `• *${nombre(c)}:* ${c.descripcion} (${plazoTexto(c.vence_en, c.hora_definida)})`);
  const msgs: NuevoMensaje[] = [];
  for (const g of destinatarios) {
    if (g.whatsapp)
      msgs.push({
        canal: 'whatsapp',
        tipo: 'reporte',
        persona_id: g.id,
        reunion_id: reunion.id,
        destino: g.whatsapp,
        cuerpo: `📊 *Acta: ${reunion.titulo}*\n\n${reunion.resumen ?? ''}\n\n*Compromisos (${compromisos.length}):*\n${lineas.join('\n') || 'Ninguno'}\n\nActa completa: ${url}`,
      });
    if (g.correo)
      msgs.push({
        canal: 'correo',
        tipo: 'reporte',
        persona_id: g.id,
        reunion_id: reunion.id,
        destino: g.correo,
        asunto: `Acta: ${reunion.titulo} (${compromisos.length} compromisos)`,
        cuerpo: `${reunion.resumen ?? ''}\n\n${lineas.join('\n').replace(/\*/g, '')}\n\n${url}`,
        html: htmlCorreo(`Acta: ${reunion.titulo}`, [
          `<p style="margin:0 0 12px;line-height:1.5">${escapar(reunion.resumen ?? '')}</p>`,
          reunion.acuerdos_generales?.length
            ? `<p style="margin:12px 0 4px;font-weight:600">Acuerdos generales</p><ul style="margin:0;padding-left:20px">${reunion.acuerdos_generales.map((a) => `<li>${escapar(a)}</li>`).join('')}</ul>`
            : '',
          `<p style="margin:16px 0 4px;font-weight:600">Compromisos (${compromisos.length})</p>`,
          ...compromisos.map((c) => filaCompromiso(c, nombre(c))),
        ], { texto: 'Ver el acta completa', url }),
      });
  }
  await encolar(msgs);
}

async function compromisosAbiertos() {
  const { data } = await db().from('compromisos').select('*').in('estado', ['pendiente', 'en_curso']).order('vence_en', { ascending: true, nullsFirst: false });
  return (data ?? []) as Compromiso[];
}

async function personasActivas() {
  const { data } = await db().from('personas').select('*').eq('activo', true);
  return (data ?? []) as Persona[];
}

/** 8:00 a. m.: cada trabajador recibe su agenda del día (vencidos + lo de hoy). */
async function agendaDiaria() {
  const hoy = fechaLima();
  const abiertos = await compromisosAbiertos();
  const msgs: NuevoMensaje[] = [];
  for (const p of await personasActivas()) {
    const mios = abiertos.filter((c) => c.persona_id === p.id);
    const vencidos = mios.filter((c) => estaVencido(c));
    const deHoy = mios.filter((c) => !estaVencido(c) && c.vence_en && fechaLima(c.vence_en) === hoy);
    const proximos = mios.filter((c) => !estaVencido(c) && c.vence_en && fechaLima(c.vence_en) > hoy && fechaLima(c.vence_en) <= sumarDias(hoy, 3));
    if (!vencidos.length && !deHoy.length) continue;
    const nombre = p.nombre.split(' ')[0];
    const secciones: string[] = [];
    if (vencidos.length) secciones.push(`🔴 *Vencidos (${vencidos.length})*\n${vencidos.map((c) => lineaWa(c)).join('\n')}`);
    if (deHoy.length) secciones.push(`📌 *Para hoy (${deHoy.length})*\n${deHoy.map((c) => lineaWa(c)).join('\n')}`);
    if (proximos.length) secciones.push(`🗓️ *Próximos días*\n${proximos.map((c) => lineaWa(c)).join('\n')}`);
    const enlace = enlacePersonal(p);
    if (p.whatsapp)
      msgs.push({ canal: 'whatsapp', tipo: 'agenda', persona_id: p.id, destino: p.whatsapp, cuerpo: `☀️ *Buenos días, ${nombre}. Tu agenda de hoy*\n\n${secciones.join('\n\n')}\n\nMarca lo que termines: ${enlace}` });
    else if (p.correo)
      msgs.push({
        canal: 'correo',
        tipo: 'agenda',
        persona_id: p.id,
        destino: p.correo,
        asunto: `Tu agenda de hoy: ${deHoy.length} para hoy, ${vencidos.length} vencidos`,
        cuerpo: secciones.join('\n\n').replace(/\*/g, ''),
        html: htmlCorreo(`Buenos días, ${nombre}. Tu agenda de hoy`, [...vencidos, ...deHoy, ...proximos].map((c) => filaCompromiso(c)), { texto: 'Ver mis compromisos', url: enlace }),
      });
  }
  await encolar(msgs);
}

/** Resumen de cumplimiento para gerencia: del día (18:00) o de la semana (lunes 8:00). */
async function reporteGerencia(tipo: 'cierre' | 'semanal') {
  const destinatarios = await gerentes();
  if (!destinatarios.length) return;
  const desde = new Date(Date.now() - (tipo === 'semanal' ? 7 : 1) * 24 * 3600_000).toISOString();
  const [{ data: hechos }, abiertos, personas] = await Promise.all([
    db().from('compromisos').select('*').eq('estado', 'hecho').gte('hecho_en', desde),
    compromisosAbiertos(),
    personasActivas(),
  ]);
  const vencidos = abiertos.filter((c) => estaVencido(c));
  const cumplidos = (hechos ?? []) as Compromiso[];
  if (tipo === 'cierre' && !vencidos.length && !cumplidos.length) return;
  const nombre = new Map(personas.map((p) => [p.id, p.nombre]));
  const porPersona = personas
    .map((p) => ({
      nombre: p.nombre,
      hechos: cumplidos.filter((c) => c.persona_id === p.id).length,
      vencidos: vencidos.filter((c) => c.persona_id === p.id).length,
      abiertos: abiertos.filter((c) => c.persona_id === p.id).length,
    }))
    .filter((x) => x.hechos || x.abiertos)
    .sort((a, b) => b.vencidos - a.vencidos || b.abiertos - a.abiertos);
  const titulo = tipo === 'semanal' ? 'Reporte semanal de compromisos' : 'Cierre del día';
  const periodo = tipo === 'semanal' ? 'en los últimos 7 días' : 'hoy';
  const url = `${appUrl()}/tasking/reportes`;
  const lineasVencidos = vencidos.slice(0, 15).map((c) => `• *${nombre.get(c.persona_id ?? '') ?? 'Sin responsable'}:* ${c.descripcion} (venció ${plazoTexto(c.vence_en, c.hora_definida)})`);
  const lineasPersona = porPersona.map((x) => `• ${x.nombre}: ${x.hechos} hechos, ${x.abiertos} abiertos${x.vencidos ? `, *${x.vencidos} vencidos*` : ''}`);
  const wa = `📈 *${titulo}*\n\n✅ Cumplidos ${periodo}: ${cumplidos.length}\n🔴 Vencidos sin cumplir: ${vencidos.length}\n📌 Abiertos en total: ${abiertos.length}\n\n*Por persona*\n${lineasPersona.join('\n') || '—'}${lineasVencidos.length ? `\n\n*Vencidos*\n${lineasVencidos.join('\n')}${vencidos.length > 15 ? `\n…y ${vencidos.length - 15} más` : ''}` : ''}\n\nDetalle: ${url}`;
  const msgs: NuevoMensaje[] = [];
  for (const g of destinatarios) {
    if (g.whatsapp) msgs.push({ canal: 'whatsapp', tipo: 'reporte', persona_id: g.id, destino: g.whatsapp, cuerpo: wa });
    if (g.correo)
      msgs.push({
        canal: 'correo',
        tipo: 'reporte',
        persona_id: g.id,
        destino: g.correo,
        asunto: `${titulo}: ${cumplidos.length} cumplidos, ${vencidos.length} vencidos`,
        cuerpo: wa.replace(/\*/g, ''),
        html: htmlCorreo(titulo, [
          `<table style="width:100%;border-collapse:collapse;margin-bottom:10px"><tr>
<td style="padding:10px;background:#ecfdf5;border-radius:10px;text-align:center"><div style="font-size:24px;font-weight:700;color:#047857">${cumplidos.length}</div><div style="font-size:12px;color:#065f46">cumplidos ${periodo}</div></td><td style="width:8px"></td>
<td style="padding:10px;background:#fef2f2;border-radius:10px;text-align:center"><div style="font-size:24px;font-weight:700;color:#b91c1c">${vencidos.length}</div><div style="font-size:12px;color:#991b1b">vencidos</div></td><td style="width:8px"></td>
<td style="padding:10px;background:#eef2ff;border-radius:10px;text-align:center"><div style="font-size:24px;font-weight:700;color:#4338ca">${abiertos.length}</div><div style="font-size:12px;color:#3730a3">abiertos</div></td></tr></table>`,
          `<p style="margin:14px 0 4px;font-weight:600">Por persona</p><table style="width:100%;border-collapse:collapse;font-size:14px">${porPersona
            .map((x) => `<tr><td style="padding:6px 0;border-bottom:1px solid #f0f0f0">${escapar(x.nombre)}</td><td style="text-align:right;border-bottom:1px solid #f0f0f0">${x.hechos} hechos · ${x.abiertos} abiertos${x.vencidos ? ` · <b style="color:#b91c1c">${x.vencidos} vencidos</b>` : ''}</td></tr>`)
            .join('')}</table>`,
          vencidos.length ? `<p style="margin:16px 0 4px;font-weight:600">Vencidos sin cumplir</p>${vencidos.slice(0, 25).map((c) => filaCompromiso(c, nombre.get(c.persona_id ?? '') ?? 'Sin responsable')).join('')}` : '',
        ], { texto: 'Abrir el tablero de reportes', url }),
      });
  }
  await encolar(msgs);
}

/** Reserva una tarea diaria (devuelve true solo la primera vez que se pide esa clave). */
async function reservar(clave: string) {
  const { data } = await db().from('ajustes').upsert({ clave, valor: { en: new Date().toISOString() } }, { onConflict: 'clave', ignoreDuplicates: true }).select('clave');
  return (data?.length ?? 0) > 0;
}

/** Lo que corre cada minuto. */
export async function tareasProgramadas() {
  const p = partesLima(Date.now());
  const hoy = fechaLima();
  const hechas: string[] = [];
  const laborable = p.diaSemana !== 0; // lunes a sábado
  if (laborable && p.hora >= 8 && p.hora < 12 && (await reservar(`agenda:${hoy}`))) {
    await agendaDiaria();
    hechas.push('agenda');
  }
  if (p.diaSemana === 1 && p.hora >= 8 && p.hora < 12 && (await reservar(`semanal:${hoy}`))) {
    await reporteGerencia('semanal');
    hechas.push('semanal');
  }
  if (laborable && p.hora >= 18 && p.hora < 22 && (await reservar(`cierre:${hoy}`))) {
    await reporteGerencia('cierre');
    hechas.push('cierre');
  }
  return hechas;
}

