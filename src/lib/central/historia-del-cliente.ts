import type { SupabaseClient } from "@supabase/supabase-js";
import { traerPorLotes } from "@/lib/lotes";

/**
 * LA HISTORIA DEL CLIENTE, PARA DECIDIR LA DERIVACIÓN SIN SALIR DE LA BANDEJA.
 *
 * Carlos, 10-09, mirando a Central derivar a «Diego Armando, del Grupo Xiomas»
 * con el único dato de que la ficha es de C1:
 *
 *   «acá solamente te arroja una recomendación del histórico […] lo mínimo que
 *    podría hacer ella es… no hay dónde. Yo lo que he hecho, me he ido a
 *    clientes, he ingresado, y ahí al menos me da la información de que este
 *    comercial tiene dos cotizaciones del 10 de marzo […] debería de poder
 *    hacer un triangulito que se despliegue la vista que usted me acaba de
 *    mostrar, por lo menos la parte de gestión, cotizaciones, quién lo hizo».
 *
 * POR QUÉ NO ALCANZA LA REGLA DE LOS SEIS MESES. La regla existe y es clara —si
 * la cuenta se movió dentro de los últimos seis meses es de su dueño, si no, se
 * puede redirigir—, pero se aplica sobre una fecha sola y eso deja pasar el
 * caso que duele: «vamos a suponer que está dentro de los seis meses pero no
 * hay ninguna acción… o al revés, hoy cumple el sexto mes pero va a cerrar
 * mañana. ¿Cómo lo voy a saber?». Ya costó un cliente grande (Minera Los
 * Quenuales) y una derivación mal hecha hace una semana.
 *
 * Lo que se muestra es lo que contesta esa pregunta y nada más: qué se le
 * cotizó y cuándo, quién habló con él por última vez, y qué quedó pendiente de
 * hacer. Con eso Central decide; sin eso solo tiene una fecha.
 *
 * Se pide para las cuentas que están EN PANTALLA (una por contacto con
 * coincidencia, y la bandeja tiene tope), no para la base entera.
 */

export interface CotizacionDelCliente {
  codigo: string | null;
  fecha: string | null;
  estado: string | null;
  total: number | null;
  moneda: string | null;
  quien: string | null;
}

export interface GestionDelCliente {
  fecha: string;
  tipo: string;
  quien: string | null;
  nota: string | null;
}

export interface PendienteDelCliente {
  oportunidadId: string;
  etapa: string;
  accion: string | null;
  fecha: string | null;
  quien: string | null;
}

export interface HistoriaDelCliente {
  cotizaciones: CotizacionDelCliente[];
  gestiones: GestionDelCliente[];
  pendientes: PendienteDelCliente[];
  /** Cuántas oportunidades tiene en total, para decir «y 4 más». */
  oportunidades: number;
}

/** Cuánto se muestra de cada cosa: lo justo para decidir, no un expediente. */
const TOPE = 4;

const etiquetaPerfil = (p: { nombre: string; codigo_comercial: string | null } | null) =>
  p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : null;

export async function historiaDeCuentas(
  supabase: SupabaseClient,
  cuentaIds: string[],
): Promise<Map<string, HistoriaDelCliente>> {
  const historia = new Map<string, HistoriaDelCliente>();
  if (cuentaIds.length === 0) return historia;

  // UN SOLO VIAJE. Las cotizaciones y las gestiones cuelgan de la oportunidad,
  // así que viajan embebidas y ya recortadas por la base: pedirlas aparte eran
  // tres idas y vueltas para armar un desplegable que casi siempre se mira
  // cerrado. La bandeja de Central se abre cien veces al día.
  const { data: ops } = await traerPorLotes(cuentaIds, (lote) =>
    supabase
      .from("oportunidades")
      .select(
        `id, cuenta_id, etapa, proxima_accion, proxima_accion_at, created_at,
         perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial),
         cotizaciones!cotizaciones_oportunidad_id_fkey(codigo, estado, total, moneda, enviada_at, created_at, perfiles!cotizaciones_creada_por_fkey(nombre, codigo_comercial)),
         actividades(tipo, nota, realizada_at, perfiles!actividades_realizada_por_fkey(nombre, codigo_comercial))`,
      )
      .in("cuenta_id", lote)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "cotizaciones", ascending: false })
      .order("realizada_at", { referencedTable: "actividades", ascending: false })
      .limit(TOPE, { referencedTable: "cotizaciones" })
      .limit(TOPE, { referencedTable: "actividades" })
      .limit(400),
  );

  type Perfil = { nombre: string; codigo_comercial: string | null } | null;
  type Op = {
    id: string;
    cuenta_id: string | null;
    etapa: string;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    created_at: string;
    perfiles: Perfil;
    cotizaciones: {
      codigo: string | null;
      estado: string | null;
      total: number | null;
      moneda: string | null;
      enviada_at: string | null;
      created_at: string;
      perfiles: Perfil;
    }[];
    actividades: { tipo: string; nota: string | null; realizada_at: string; perfiles: Perfil }[];
  };

  for (const o of (ops ?? []) as unknown as Op[]) {
    if (!o.cuenta_id) continue;
    const h = historia.get(o.cuenta_id) ?? { cotizaciones: [], gestiones: [], pendientes: [], oportunidades: 0 };
    h.oportunidades += 1;

    // «Qué quedó pendiente» es lo que contesta «¿va a cerrar mañana?». Solo lo
    // que sigue vivo: una acción agendada sobre algo ya vendido o rechazado no
    // dice nada.
    if (
      o.proxima_accion &&
      !["venta", "rechazada", "derivada", "historico"].includes(o.etapa) &&
      h.pendientes.length < TOPE
    ) {
      h.pendientes.push({
        oportunidadId: o.id,
        etapa: o.etapa,
        accion: o.proxima_accion,
        fecha: o.proxima_accion_at,
        quien: etiquetaPerfil(o.perfiles),
      });
    }

    for (const c of o.cotizaciones ?? []) {
      if (h.cotizaciones.length >= TOPE) break;
      h.cotizaciones.push({
        codigo: c.codigo,
        fecha: c.enviada_at ?? c.created_at,
        estado: c.estado,
        total: c.total,
        moneda: c.moneda,
        quien: etiquetaPerfil(c.perfiles),
      });
    }

    for (const a of o.actividades ?? []) {
      if (h.gestiones.length >= TOPE) break;
      h.gestiones.push({
        fecha: a.realizada_at,
        tipo: a.tipo,
        quien: etiquetaPerfil(a.perfiles),
        nota: a.nota,
      });
    }

    historia.set(o.cuenta_id, h);
  }

  // La oportunidad más nueva manda, pero la gestión más nueva puede estar en
  // una vieja: se ordena al final, que es como se lee.
  for (const h of historia.values()) {
    h.gestiones.sort((a, b) => b.fecha.localeCompare(a.fecha));
    h.gestiones.length = Math.min(h.gestiones.length, TOPE);
    h.cotizaciones.sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    h.cotizaciones.length = Math.min(h.cotizaciones.length, TOPE);
  }

  return historia;
}
