import type { createClient } from "@/lib/supabase/server";
import { hoyLima } from "@/lib/periodo";
import { pruebaSinPedir, type ServicioPostventa } from "@/lib/postventa";
import { ETIQUETA_TIPO_APERTURA, estadoApertura, type TipoApertura } from "@/lib/aperturas-llamada";
import type { Perfil } from "@/types/database";

/**
 * LA COLA DEL DÍA (propuesta, 23-09).
 *
 * «Hoy» deja de ser un tablero de números para leer y pasa a ser una lista de
 * cosas por hacer: cada fila dice a quién, qué, por qué ahora, y lleva UN
 * botón que abre la pantalla donde se hace. Se ordena por urgencia —lo
 * atrasado primero— y al costado va la agenda con hora. Es la misma
 * información que El macro y Mi día, puesta en el orden en que se trabaja.
 */

export type Urgencia = "atrasado" | "hoy" | "semana";
export type TipoTarea = "pedido" | "apertura" | "atencion" | "caso" | "cliente" | "despacho";

export interface Tarea {
  id: string;
  urgencia: Urgencia;
  tipo: TipoTarea;
  cliente: string;
  que: string;
  porque: string;
  accion: { etiqueta: string; href: string };
}

export interface EventoAgenda {
  id: string;
  hora: string;
  titulo: string;
  detalle: string;
  href: string;
}

type Cliente = Awaited<ReturnType<typeof createClient>>;
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
const horaLima = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const diasEntre = (a: string, b: string) => Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / 86_400_000);

export async function colaDelDia(supabase: Cliente, perfil: Perfil, tipo: string): Promise<{ tareas: Tarea[]; agenda: EventoAgenda[] }> {
  if (tipo === "postventa") return colaPostventa(supabase);
  if (tipo === "almacen") return colaAlmacen(supabase);
  if (tipo === "comercial" || tipo === "preventivo") return colaComercial(supabase, perfil);
  return { tareas: [], agenda: [] };
}

async function colaPostventa(supabase: Cliente) {
  const hoy = hoyLima();
  const [{ data: pedidos }, { data: aperturas }, { data: atenciones }, { data: casos }, { data: visitas }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("*")
      .eq("completado", false)
      .is("cerrado_at", null)
      .limit(2000),
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, programada_para, equipos, tomada_at, informe_at, revisada_at, enviada_cliente_at, anulada_at, faltantes, cuentas(razon_social)")
      .is("anulada_at", null)
      .is("enviada_cliente_at", null)
      .limit(300),
    supabase
      .from("atenciones")
      .select("id, tipo, etapa, tomada_at, solicitado_at, programada_at, cliente_texto, cuentas(razon_social)")
      .is("cerrado_at", null)
      .limit(1000),
    supabase
      .from("oportunidades")
      .select("id, tipo_postventa, proxima_accion, proxima_accion_at, cuentas(razon_social)")
      .not("tipo_postventa", "is", null)
      .is("cerrada_at", null)
      .not("etapa", "in", '("venta","rechazada","derivada","historico")')
      .lte("proxima_accion_at", hoy)
      .limit(1000),
    supabase.from("visitas_planta").select("id, empresa, persona, motivo, hora").eq("fecha", hoy).is("cancelada_at", null),
  ]);

  const tareas: Tarea[] = [];
  const agenda: EventoAgenda[] = [];
  const vivos = ((pedidos ?? []) as unknown as ServicioPostventa[]).filter((s) => !s.informe_cierre_id || s.pedido_ejecutado_at);

  for (const s of vivos) {
    const cliente = sinRuc(s.cliente_texto);
    const equipo = primeraLinea(s.equipo) || "Pedido";
    if (s.informe_cierre_id && !s.aprobado_at) {
      tareas.push({ id: `apr-${s.id}`, urgencia: "hoy", tipo: "pedido", cliente, que: `Aprobar el pedido · ${equipo}`, porque: "Central ya lo lanzó y el área todavía no lo tomó.", accion: { etiqueta: "Aprobar", href: `/postventa/pedidos/${s.id}` } });
    }
    if (s.fecha_despacho && !s.despachado_at && s.fecha_despacho < hoy) {
      tareas.push({ id: `atr-${s.id}`, urgencia: "atrasado", tipo: "despacho", cliente, que: `Despacho atrasado · ${equipo}`, porque: `Tenía fecha el ${s.fecha_despacho.split("-").reverse().join("/")} y no salió (${diasEntre(s.fecha_despacho, hoy)} días).`, accion: { etiqueta: "Reprogramar", href: `/postventa/pedidos/${s.id}` } });
    } else if (pruebaSinPedir(s)) {
      tareas.push({ id: `pru-${s.id}`, urgencia: "hoy", tipo: "pedido", cliente, que: `Pedir prueba y embalaje · ${equipo}`, porque: "Nadie se lo pidió al almacén. No espera al pago.", accion: { etiqueta: "Pedir la prueba", href: `/postventa/pedidos/${s.id}` } });
    }
    if (s.fecha_despacho === hoy && !s.despachado_at) {
      agenda.push({ id: `desp-${s.id}`, hora: s.despacho_hora ? String(s.despacho_hora).slice(0, 5) : "—", titulo: `Despacho · ${cliente}`, detalle: equipo, href: `/postventa/pedidos/${s.id}` });
    }
  }

  for (const a of (aperturas ?? []) as unknown as {
    id: string; tipo: TipoApertura; programada_para: string; equipos: string; tomada_at: string | null; informe_at: string | null;
    revisada_at: string | null; enviada_cliente_at: string | null; anulada_at: string | null; faltantes: string | null; cuentas: { razon_social: string } | null;
  }[]) {
    const e = estadoApertura(a);
    const cliente = sinRuc(a.cuentas?.razon_social);
    if (e === "informe_almacen") {
      tareas.push({ id: `ap-${a.id}`, urgencia: "hoy", tipo: "apertura", cliente, que: `Revisar el informe del almacén · ${ETIQUETA_TIPO_APERTURA[a.tipo]}`, porque: a.faltantes ? "Encontraron cosas que le faltan al cliente: hay algo para cotizar." : "Falta la versión para el cliente.", accion: { etiqueta: "Revisar", href: `/aperturas/${a.id}` } });
    } else if (e === "revisada") {
      tareas.push({ id: `ap-${a.id}`, urgencia: "hoy", tipo: "apertura", cliente, que: "Mandar el informe al cliente", porque: "Ya está revisado; falta enviarlo.", accion: { etiqueta: "Abrir", href: `/aperturas/${a.id}` } });
    } else if (e === "enviada" && diaLima(a.programada_para) <= hoy) {
      tareas.push({ id: `ap-${a.id}`, urgencia: diaLima(a.programada_para) < hoy ? "atrasado" : "hoy", tipo: "apertura", cliente, que: `El almacén no tomó la apertura · ${ETIQUETA_TIPO_APERTURA[a.tipo]}`, porque: `Era para las ${horaLima(a.programada_para)} y nadie le dio el check.`, accion: { etiqueta: "Ver", href: `/aperturas/${a.id}` } });
    }
    if (diaLima(a.programada_para) === hoy) {
      agenda.push({ id: `ag-${a.id}`, hora: horaLima(a.programada_para), titulo: `${ETIQUETA_TIPO_APERTURA[a.tipo]} · ${cliente}`, detalle: primeraLinea(a.equipos), href: `/aperturas/${a.id}` });
    }
  }

  for (const t of (atenciones ?? []) as unknown as { id: string; etapa: string; tomada_at: string | null; solicitado_at: string; programada_at: string | null; cliente_texto: string | null; cuentas: { razon_social: string } | null }[]) {
    const cliente = sinRuc(t.cuentas?.razon_social ?? t.cliente_texto);
    if (t.etapa === "registro" && !t.tomada_at) {
      const dias = diasEntre(diaLima(t.solicitado_at), hoy);
      tareas.push({ id: `at-${t.id}`, urgencia: dias >= 1 ? "atrasado" : "hoy", tipo: "atencion", cliente, que: "Tomar el caso técnico", porque: dias >= 1 ? `Central lo devolvió hace ${dias} día${dias === 1 ? "" : "s"} y nadie lo tomó.` : "Central lo devolvió hoy.", accion: { etiqueta: "Tomarlo", href: `/postventa/atenciones/${t.id}` } });
    }
    if (t.programada_at && diaLima(t.programada_at) === hoy) {
      agenda.push({ id: `atg-${t.id}`, hora: horaLima(t.programada_at), titulo: `Atención técnica · ${cliente}`, detalle: "Programada", href: `/postventa/atenciones/${t.id}` });
    }
  }

  for (const c of (casos ?? []) as unknown as { id: string; proxima_accion: string | null; proxima_accion_at: string; cuentas: { razon_social: string } | null }[]) {
    const atrasado = c.proxima_accion_at < hoy;
    tareas.push({ id: `cs-${c.id}`, urgencia: atrasado ? "atrasado" : "hoy", tipo: "caso", cliente: sinRuc(c.cuentas?.razon_social), que: c.proxima_accion || "Seguimiento del caso", porque: atrasado ? `Quedó para el ${c.proxima_accion_at.split("-").reverse().join("/")}.` : "Quedó para hoy.", accion: { etiqueta: "Abrir", href: `/comercial/oportunidades/${c.id}` } });
  }

  for (const v of (visitas ?? []) as { id: string; empresa: string; persona: string; motivo: string; hora: string | null }[]) {
    agenda.push({ id: `vis-${v.id}`, hora: v.hora ? v.hora.slice(0, 5) : "—", titulo: `Viene a la planta · ${v.empresa}`, detalle: `${v.persona} · ${v.motivo}`, href: "/postventa/visitas" });
  }
  return { tareas, agenda: agenda.sort((a, b) => a.hora.localeCompare(b.hora)) };
}

async function colaAlmacen(supabase: Cliente) {
  const hoy = hoyLima();
  const [{ data: pedidos }, { data: aperturas }, { data: atenciones }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, fecha_despacho, despacho_hora, despachado_at, apertura_despacho_at, prueba_solicitada_at, prueba_lista_at, prueba_embalaje, almacen_listo_at, guia, agencia_at, salida_fotos, informe_cierre_id, pedido_ejecutado_at")
      .eq("completado", false)
      .is("cerrado_at", null)
      .or("informe_cierre_id.is.null,pedido_ejecutado_at.not.is.null")
      .limit(2000),
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, programada_para, equipos, tomada_at, informe_at, revisada_at, enviada_cliente_at, anulada_at, cuentas(razon_social)")
      .is("anulada_at", null)
      .is("informe_at", null)
      .limit(300),
    supabase
      .from("atenciones")
      .select("id, tipo, programada_at, tecnico, cliente_texto, cuentas(razon_social)")
      .is("cerrado_at", null)
      .gte("programada_at", `${hoy}T00:00:00-05:00`)
      .lt("programada_at", `${hoy}T23:59:59-05:00`),
  ]);
  const tareas: Tarea[] = [];
  const agenda: EventoAgenda[] = [];
  for (const s of (pedidos ?? []) as unknown as ServicioPostventa[]) {
    const cliente = sinRuc(s.cliente_texto);
    const equipo = primeraLinea(s.equipo) || "Pedido";
    const probado = s.prueba_lista_at != null || String(s.prueba_embalaje ?? "").toUpperCase() === "SI";
    if (s.prueba_solicitada_at && !probado) {
      const dias = diasEntre(diaLima(s.prueba_solicitada_at), hoy);
      tareas.push({ id: `pr-${s.id}`, urgencia: dias >= 2 ? "atrasado" : "hoy", tipo: "pedido", cliente, que: `Probar y embalar · ${equipo}`, porque: dias >= 1 ? `Postventa lo pidió hace ${dias} día${dias === 1 ? "" : "s"}.` : "Postventa lo pidió hoy.", accion: { etiqueta: "Registrar la prueba", href: `/almacen/pedidos/${s.id}` } });
    }
    if (s.fecha_despacho && !s.despachado_at) {
      // Sin apertura no es trabajo del almacén (Carlos, 22-09: «si no ha
      // cumplido, no puedo hacer nada»): ese atraso está en la cola de postventa.
      if (s.fecha_despacho < hoy && s.apertura_despacho_at) {
        tareas.push({ id: `at-${s.id}`, urgencia: "atrasado", tipo: "despacho", cliente, que: `Despachar · ${equipo}`, porque: `Tenía fecha el ${s.fecha_despacho.split("-").reverse().join("/")} y ya tiene apertura: se puede despachar.`, accion: { etiqueta: "Despachar", href: `/almacen/pedidos/${s.id}` } });
      } else if (s.fecha_despacho === hoy) {
        agenda.push({ id: `d-${s.id}`, hora: s.despacho_hora ? String(s.despacho_hora).slice(0, 5) : "—", titulo: `Despacho · ${cliente}`, detalle: `${equipo}${s.apertura_despacho_at ? "" : " · sin apertura"}`, href: `/almacen/pedidos/${s.id}` });
        if (!s.almacen_listo_at) tareas.push({ id: `li-${s.id}`, urgencia: "hoy", tipo: "despacho", cliente, que: `Confirmar que está listo · ${equipo}`, porque: "Sale hoy y el almacén no confirmó.", accion: { etiqueta: "Confirmar", href: `/almacen/pedidos/${s.id}` } });
      }
    }
    if (s.despachado_at && !s.guia && !s.agencia_at && (s.salida_fotos?.length ?? 0) > 0) {
      tareas.push({ id: `gu-${s.id}`, urgencia: "hoy", tipo: "despacho", cliente, que: "Subir la guía", porque: "Salió y falta la foto de la guía en la agencia.", accion: { etiqueta: "Subir guía", href: `/almacen/pedidos/${s.id}` } });
    }
  }
  for (const a of (aperturas ?? []) as unknown as { id: string; tipo: TipoApertura; programada_para: string; equipos: string; tomada_at: string | null; informe_at: string | null; revisada_at: string | null; enviada_cliente_at: string | null; anulada_at: string | null; cuentas: { razon_social: string } | null }[]) {
    const cliente = sinRuc(a.cuentas?.razon_social);
    const dia = diaLima(a.programada_para);
    if (!a.tomada_at) {
      tareas.push({ id: `apt-${a.id}`, urgencia: dia < hoy ? "atrasado" : dia === hoy ? "hoy" : "semana", tipo: "apertura", cliente, que: `Tomar la apertura · ${ETIQUETA_TIPO_APERTURA[a.tipo]}`, porque: `Para el ${new Date(a.programada_para).toLocaleString("es-PE", { timeZone: "America/Lima", weekday: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}. Postventa espera el check.`, accion: { etiqueta: "Tomarla", href: `/aperturas/${a.id}` } });
    } else if (dia <= hoy) {
      tareas.push({ id: `api-${a.id}`, urgencia: dia < hoy ? "atrasado" : "hoy", tipo: "apertura", cliente, que: "Subir el informe de la llamada", porque: "Ya se hizo (o toca hoy): postventa necesita lo que se vio.", accion: { etiqueta: "Subir informe", href: `/aperturas/${a.id}` } });
    }
    if (dia === hoy) agenda.push({ id: `apg-${a.id}`, hora: horaLima(a.programada_para), titulo: `${ETIQUETA_TIPO_APERTURA[a.tipo]} · ${cliente}`, detalle: primeraLinea(a.equipos), href: `/aperturas/${a.id}` });
  }
  for (const t of (atenciones ?? []) as unknown as { id: string; programada_at: string; tecnico: string | null; cliente_texto: string | null; cuentas: { razon_social: string } | null }[]) {
    agenda.push({ id: `at-${t.id}`, hora: horaLima(t.programada_at), titulo: `Atención técnica · ${sinRuc(t.cuentas?.razon_social ?? t.cliente_texto)}`, detalle: t.tecnico ?? "Técnico por asignar", href: `/almacen/atenciones` });
  }
  return { tareas, agenda: agenda.sort((a, b) => a.hora.localeCompare(b.hora)) };
}

async function colaComercial(supabase: Cliente, perfil: Perfil) {
  const hoy = hoyLima();
  const enUnaSemana = new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const { data } = await supabase
    .from("oportunidades")
    .select("id, etapa, proxima_accion, proxima_accion_at, proxima_accion_hora, created_at, cuentas(razon_social), actividades(count)")
    .eq("comercial_id", perfil.id)
    .is("cerrada_at", null)
    .not("etapa", "in", '("venta","rechazada","derivada","historico")')
    .limit(2000);
  const tareas: Tarea[] = [];
  const agenda: EventoAgenda[] = [];
  for (const o of (data ?? []) as unknown as { id: string; etapa: string; proxima_accion: string | null; proxima_accion_at: string | null; proxima_accion_hora: string | null; created_at: string; cuentas: { razon_social: string } | null; actividades: { count: number }[] | null }[]) {
    const cliente = sinRuc(o.cuentas?.razon_social);
    const href = `/comercial/oportunidades/${o.id}`;
    // «Sin gestión» solo si de verdad no hay ninguna: una marca de WhatsApp
    // «no contesta» deja la etapa en asignada, pero SÍ es gestión.
    const gestiones = o.actividades?.[0]?.count ?? 0;
    if (o.etapa === "asignada" && gestiones === 0) {
      tareas.push({ id: `n-${o.id}`, urgencia: diaLima(o.created_at) < hoy ? "atrasado" : "hoy", tipo: "cliente", cliente, que: "Primer contacto", porque: `Central se lo derivó el ${new Date(o.created_at).toLocaleDateString("es-PE", { timeZone: "America/Lima" })} y todavía no tiene gestión.`, accion: { etiqueta: "Llamar", href } });
      continue;
    }
    if (o.etapa === "asignada" && !o.proxima_accion_at) {
      tareas.push({ id: `r-${o.id}`, urgencia: "hoy", tipo: "cliente", cliente, que: "Volver a intentar el contacto", porque: `Tiene ${gestiones} intento${gestiones === 1 ? "" : "s"} y ninguna respuesta todavía.`, accion: { etiqueta: "Gestionar", href } });
      continue;
    }
    if (!o.proxima_accion_at) continue;
    if (o.proxima_accion_at < hoy) {
      tareas.push({ id: `v-${o.id}`, urgencia: "atrasado", tipo: "cliente", cliente, que: o.proxima_accion || "Seguimiento", porque: `Quedó para el ${o.proxima_accion_at.split("-").reverse().join("/")} (${diasEntre(o.proxima_accion_at, hoy)} días).`, accion: { etiqueta: "Gestionar", href } });
    } else if (o.proxima_accion_at === hoy) {
      tareas.push({ id: `h-${o.id}`, urgencia: "hoy", tipo: "cliente", cliente, que: o.proxima_accion || "Seguimiento", porque: o.proxima_accion_hora ? `Hoy a las ${o.proxima_accion_hora.slice(0, 5)}.` : "Quedó para hoy.", accion: { etiqueta: "Gestionar", href } });
      if (o.proxima_accion_hora) agenda.push({ id: `a-${o.id}`, hora: o.proxima_accion_hora.slice(0, 5), titulo: cliente, detalle: o.proxima_accion || "Seguimiento", href });
    } else if (o.proxima_accion_at <= enUnaSemana) {
      tareas.push({ id: `s-${o.id}`, urgencia: "semana", tipo: "cliente", cliente, que: o.proxima_accion || "Seguimiento", porque: `Para el ${o.proxima_accion_at.split("-").reverse().join("/")}.`, accion: { etiqueta: "Abrir", href } });
    }
  }
  return { tareas, agenda: agenda.sort((a, b) => a.hora.localeCompare(b.hora)) };
}
