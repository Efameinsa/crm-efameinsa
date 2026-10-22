import type { createClient } from "@/lib/supabase/server";
import { sumarDias } from "@/lib/calendario";
import type { Tarea } from "@/lib/propuesta/cola-del-dia";

/**
 * EL DÍA DEL ALMACÉN (Santos, 21-10: «quiero ver las acciones que hizo al día,
 * algo así como lo que tiene postventa y comercial, pero enfocado a sus
 * actividades propias del área»).
 *
 * Lo que el almacén hace deja marca en el CRM sin que nadie escriba nada:
 * probó una máquina, registró la serie, confirmó que está listo, la sacó de
 * planta, la dejó en la agencia, tomó la llamada de postventa, subió el
 * informe, recibió un equipo que llegó, terminó un protocolo de stock. Acá se
 * juntan todas esas marcas de un día en una sola lista con hora y quién, para
 * la agenda («Lo que hizo el almacén hoy») y para el reporte del día.
 *
 * Son tareas DEL ÁREA (Santos, 21-10): la lista es de todo el almacén, con
 * el nombre de quien hizo cada cosa; no se filtra por persona.
 *
 * PERO NO SE MEZCLA CON OTRAS ÁREAS (Santos, 21-10 tarde: «el reporte de Diana
 * está mal por sus gestiones de Central»). Central y Lesly también registran
 * series en los pedidos; eso salía como «lo que hizo el almacén». Cada hecho
 * dice si lo hizo una cuenta del almacén (`delAlmacen`): el resumen y la lista
 * del almacén cuentan solo esos, y lo de otras áreas va aparte, sin sumar.
 */

export type TipoHecho = "prueba" | "serie" | "listo" | "salida" | "agencia" | "letras" | "llamada" | "informe" | "recepcion" | "stock" | "anotado";

export interface Hecho {
  id: string;
  tipo: TipoHecho;
  /** ISO, para ordenar. */
  cuando: string;
  /** «10:14»; null cuando el CRM solo guardó el día (la salida se graba al mediodía). */
  hora: string | null;
  que: string;
  cliente: string | null;
  detalle: string | null;
  quien: string | null;
  href: string | null;
  /** Lo hizo una cuenta del almacén. Lo de Central, Lesly u otras áreas va aparte. */
  delAlmacen: boolean;
}

export const ETIQUETA_HECHO: Record<TipoHecho, string> = {
  prueba: "Probó y embaló",
  serie: "Registró la serie",
  listo: "Confirmó que está listo",
  salida: "Salida de planta",
  agencia: "Dejó en la agencia",
  letras: "Recibió las letras",
  llamada: "Tomó la llamada de postventa",
  informe: "Subió el informe de la llamada",
  recepcion: "Equipo que llegó a planta",
  stock: "Protocolo de equipo en stock",
  anotado: "Otra gestión",
};

type Cliente = Awaited<ReturnType<typeof createClient>>;
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");
const primeraLinea = (s: string | null | undefined) => (s ?? "").split("\n")[0].trim();
const horaLima = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit" });
// La salida de planta se guarda como «ese día + 12 h» en UTC (0429): 12:00Z no es una hora real.
const horaReal = (iso: string) => (/T12:00:00(\.0+)?Z$/.test(new Date(iso).toISOString()) ? null : horaLima(iso));
const en = (iso: string | null, desde: string, hasta: string) => Boolean(iso && iso >= desde && iso < hasta);

export async function hechosDelAlmacen(supabase: Cliente, fecha: string): Promise<Hecho[]> {
  const desde = new Date(`${fecha}T00:00:00-05:00`).toISOString();
  const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();
  const rango = (col: string) => ({ col, desde, hasta });

  const [{ data: maquinas }, { data: series }, { data: pedidos }, { data: llamadas }, { data: recepciones }, { data: stock }, { data: anotado }] = await Promise.all([
    supabase
      .from("pedido_equipos")
      .select("id, servicio_id, descripcion, serie, parte_nombre, prueba_lista_at, prueba_lista_por, servicios_postventa(cliente_texto)")
      .gte("prueba_lista_at", desde)
      .lt("prueba_lista_at", hasta)
      .limit(300),
    supabase
      .from("pedido_equipos")
      .select("id, servicio_id, descripcion, serie, serie_registrada_at, serie_registrada_por, servicios_postventa(cliente_texto)")
      .gte("serie_registrada_at", desde)
      .lt("serie_registrada_at", hasta)
      .limit(300),
    // Un solo viaje por los pedidos tocados hoy: cada marca del almacén es una columna.
    supabase
      .from("servicios_postventa")
      .select("id, cliente_texto, equipo, almacen_listo_at, almacen_listo_por, despachado_at, despachado_por, agencia_at, agencia_por, agencia_destino, letras_recibidas_almacen_at, letras_recibidas_almacen_por")
      .or(
        [rango("almacen_listo_at"), rango("despachado_at"), rango("agencia_at"), rango("letras_recibidas_almacen_at")]
          .map((r) => `and(${r.col}.gte.${r.desde},${r.col}.lt.${r.hasta})`)
          .join(","),
      )
      .limit(300),
    supabase
      .from("aperturas_llamada")
      .select("id, tipo, equipos, tomada_at, tomada_por, informe_at, informe_por, cuentas(razon_social)")
      .or(`and(tomada_at.gte.${desde},tomada_at.lt.${hasta}),and(informe_at.gte.${desde},informe_at.lt.${hasta})`)
      .limit(200),
    supabase
      .from("recepciones_equipo")
      .select("id, codigo, equipo_texto, recibido_at, recibido_por, revisado_at, revisado_por, listo_at, listo_por, cuentas(razon_social)")
      .or(
        `and(recibido_at.gte.${desde},recibido_at.lt.${hasta}),and(revisado_at.gte.${desde},revisado_at.lt.${hasta}),and(listo_at.gte.${desde},listo_at.lt.${hasta})`,
      )
      .limit(200),
    supabase.from("protocolos_stock").select("id, descripcion, serie, terminado_at, terminado_por").gte("terminado_at", desde).lt("terminado_at", hasta).limit(200),
    // Lo anotado a mano por la gente del almacén («Otras gestiones de hoy»).
    supabase.from("bitacora_dia").select("id, perfil_id, orden, texto, created_at, perfiles!inner(nombre, es_almacen)").eq("fecha", fecha).eq("perfiles.es_almacen", true).order("orden").limit(200),
  ]);

  const hechos: Hecho[] = [];
  const quienes = new Set<string>();
  const poner = (h: Omit<Hecho, "hora" | "quien" | "delAlmacen"> & { quien: string | null }) => {
    if (h.quien) quienes.add(h.quien);
    // Sin autor (salidas viejas sin «despachado_por») se da por del almacén.
    hechos.push({ ...h, hora: horaReal(h.cuando), delAlmacen: true });
  };

  type Maq = { id: string; servicio_id: string; descripcion: string; serie: string | null; parte_nombre?: string | null; prueba_lista_at?: string; prueba_lista_por?: string | null; serie_registrada_at?: string; serie_registrada_por?: string | null; servicios_postventa: { cliente_texto: string | null } | null };
  for (const m of (maquinas ?? []) as unknown as Maq[]) {
    poner({ id: `pr-${m.id}`, tipo: "prueba", cuando: m.prueba_lista_at!, que: ETIQUETA_HECHO.prueba, cliente: sinRuc(m.servicios_postventa?.cliente_texto), detalle: `${m.parte_nombre ? `${m.parte_nombre} · ` : ""}${primeraLinea(m.descripcion)}${m.serie ? ` · serie ${m.serie}` : ""}`, quien: m.prueba_lista_por ?? null, href: `/almacen/pedidos/${m.servicio_id}` });
  }
  for (const m of (series ?? []) as unknown as Maq[]) {
    poner({ id: `se-${m.id}`, tipo: "serie", cuando: m.serie_registrada_at!, que: `${ETIQUETA_HECHO.serie}${m.serie ? ` ${m.serie}` : ""}`, cliente: sinRuc(m.servicios_postventa?.cliente_texto), detalle: primeraLinea(m.descripcion), quien: m.serie_registrada_por ?? null, href: `/almacen/pedidos/${m.servicio_id}` });
  }
  type Ped = { id: string; cliente_texto: string | null; equipo: string | null; almacen_listo_at: string | null; almacen_listo_por: string | null; despachado_at: string | null; despachado_por: string | null; agencia_at: string | null; agencia_por: string | null; agencia_destino: string | null; letras_recibidas_almacen_at: string | null; letras_recibidas_almacen_por: string | null };
  for (const s of (pedidos ?? []) as unknown as Ped[]) {
    const base = { cliente: sinRuc(s.cliente_texto), detalle: primeraLinea(s.equipo) || null, href: `/almacen/pedidos/${s.id}` };
    if (en(s.almacen_listo_at, desde, hasta)) poner({ id: `li-${s.id}`, tipo: "listo", cuando: s.almacen_listo_at!, que: ETIQUETA_HECHO.listo, quien: s.almacen_listo_por, ...base });
    if (en(s.despachado_at, desde, hasta)) poner({ id: `sa-${s.id}`, tipo: "salida", cuando: s.despachado_at!, que: ETIQUETA_HECHO.salida, quien: s.despachado_por, ...base });
    if (en(s.agencia_at, desde, hasta)) poner({ id: `ag-${s.id}`, tipo: "agencia", cuando: s.agencia_at!, que: ETIQUETA_HECHO.agencia, quien: s.agencia_por, ...base, detalle: [base.detalle, s.agencia_destino].filter(Boolean).join(" · ") || null });
    if (en(s.letras_recibidas_almacen_at, desde, hasta)) poner({ id: `le-${s.id}`, tipo: "letras", cuando: s.letras_recibidas_almacen_at!, que: ETIQUETA_HECHO.letras, quien: s.letras_recibidas_almacen_por, ...base });
  }
  type Ll = { id: string; tipo: string; equipos: string | null; tomada_at: string | null; tomada_por: string | null; informe_at: string | null; informe_por: string | null; cuentas: { razon_social: string } | null };
  for (const a of (llamadas ?? []) as unknown as Ll[]) {
    const base = { cliente: sinRuc(a.cuentas?.razon_social), detalle: primeraLinea(a.equipos) || null, href: `/aperturas/${a.id}` };
    if (en(a.tomada_at, desde, hasta)) poner({ id: `lt-${a.id}`, tipo: "llamada", cuando: a.tomada_at!, que: ETIQUETA_HECHO.llamada, quien: a.tomada_por, ...base });
    if (en(a.informe_at, desde, hasta)) poner({ id: `lf-${a.id}`, tipo: "informe", cuando: a.informe_at!, que: ETIQUETA_HECHO.informe, quien: a.informe_por, ...base });
  }
  type Rec = { id: string; codigo: string; equipo_texto: string; recibido_at: string | null; recibido_por: string | null; revisado_at: string | null; revisado_por: string | null; listo_at: string | null; listo_por: string | null; cuentas: { razon_social: string } | null };
  for (const r of (recepciones ?? []) as unknown as Rec[]) {
    const base = { cliente: sinRuc(r.cuentas?.razon_social), detalle: `${r.codigo} · ${primeraLinea(r.equipo_texto)}`, href: `/recepciones/${r.id}` };
    if (en(r.recibido_at, desde, hasta)) poner({ id: `rr-${r.id}`, tipo: "recepcion", cuando: r.recibido_at!, que: "Recibió el equipo que llegó a planta", quien: r.recibido_por, ...base });
    if (en(r.revisado_at, desde, hasta)) poner({ id: `rv-${r.id}`, tipo: "recepcion", cuando: r.revisado_at!, que: "Revisó el equipo con el técnico", quien: r.revisado_por, ...base });
    if (en(r.listo_at, desde, hasta)) poner({ id: `rl-${r.id}`, tipo: "recepcion", cuando: r.listo_at!, que: "Dejó listo el equipo recibido (informe)", quien: r.listo_por, ...base });
  }
  for (const p of (stock ?? []) as { id: string; descripcion: string; serie: string | null; terminado_at: string; terminado_por: string | null }[]) {
    poner({ id: `st-${p.id}`, tipo: "stock", cuando: p.terminado_at, que: "Terminó el protocolo de un equipo en stock", cliente: null, detalle: `${primeraLinea(p.descripcion)}${p.serie ? ` · serie ${p.serie}` : ""}`, quien: p.terminado_por, href: `/almacen/protocolos/stock/${p.id}` });
  }
  for (const b of (anotado ?? []) as unknown as { id: string; perfil_id: string; orden: number; texto: string; created_at: string | null; perfiles: { nombre: string } }[]) {
    // Lo anotado va con la hora en que se anotó (Santos 22-10: «Registrar actividad»,
    // embalajes y despachos sin pedido); si no hay hora, al final del día.
    const cuando = b.created_at && en(b.created_at, desde, hasta) ? b.created_at : `${hasta.slice(0, 10)}T04:${String(Math.min(b.orden, 59)).padStart(2, "0")}:00.000Z`;
    hechos.push({ id: `bi-${b.id}`, tipo: "anotado", cuando, hora: b.created_at && en(b.created_at, desde, hasta) ? horaReal(b.created_at) : null, que: b.texto, cliente: null, detalle: null, quien: b.perfiles?.nombre ?? null, href: null, delAlmacen: true });
  }

  // Los nombres, de una vez.
  if (quienes.size > 0) {
    const { data: perfiles } = await supabase.from("perfiles").select("id, nombre, es_almacen").in("id", [...quienes]);
    const porId = new Map(((perfiles ?? []) as { id: string; nombre: string; es_almacen: boolean | null }[]).map((p) => [p.id, p]));
    for (const h of hechos) {
      if (h.tipo === "anotado" || !h.quien) continue;
      const p = porId.get(h.quien);
      if (!p) continue;
      h.delAlmacen = !!p.es_almacen;
      h.quien = p.nombre;
    }
  }
  return hechos.sort((a, b) => a.cuando.localeCompare(b.cuando));
}

/** Lo del almacén y lo que hicieron otras áreas (Central, Lesly) en sus pedidos. */
export function separarHechos(hechos: Hecho[]): { propios: Hecho[]; otros: Hecho[] } {
  return { propios: hechos.filter((h) => h.delAlmacen), otros: hechos.filter((h) => !h.delAlmacen) };
}

/** Cuántos hechos de cada tipo: las tarjetas del resumen. */
export function resumenDeHechos(hechos: Hecho[]) {
  const n = (t: TipoHecho | TipoHecho[]) => hechos.filter((h) => (Array.isArray(t) ? t.includes(h.tipo) : h.tipo === t)).length;
  return {
    pruebas: n("prueba"),
    series: n("serie"),
    salidas: n("salida"),
    agencias: n("agencia"),
    listos: n("listo"),
    llamadas: n(["llamada", "informe"]),
    recepciones: n("recepcion"),
    stock: n("stock"),
    anotados: n("anotado"),
    total: hechos.length,
  };
}

/**
 * LA META DEL ALMACÉN NO ES UNA CANTIDAD, ES CERO COLGADOS (Santos, 21-10):
 * ninguna prueba esperando más de 2 días, ningún despacho atrasado, ninguna
 * salida sin su foto de agencia o su guía al día siguiente. Sale de la misma
 * cola del día que arma la lista de tareas.
 */
export interface IndicadorAlmacen {
  clave: "pruebas" | "despachos" | "colgados";
  titulo: string;
  numero: number;
  ayuda: string;
  href: string;
}

export function indicadoresDelAlmacen(tareas: Tarea[]): IndicadorAlmacen[] {
  const pruebas = tareas.filter((t) => t.id.startsWith("pr-") && t.urgencia === "atrasado").length;
  const despachos = tareas.filter((t) => t.id.startsWith("at-")).length;
  const colgados = tareas.filter((t) => /^(fc|fa|gu)-/.test(t.id)).length;
  return [
    { clave: "pruebas", titulo: "Pruebas esperando 2 días o más", numero: pruebas, ayuda: "Postventa pidió la prueba y la máquina sigue sin probar. La meta es cero.", href: "/almacen/pedidos?ver=probar" },
    { clave: "despachos", titulo: "Despachos atrasados", numero: despachos, ayuda: "Tenían fecha, tienen apertura y no salieron. La meta es cero.", href: "/almacen/pedidos?ver=atrasados" },
    { clave: "colgados", titulo: "Salidas sin cerrar", numero: colgados, ayuda: "Salieron y falta la foto de la carga, la de la agencia o la guía. La meta es cero.", href: "/almacen/pedidos?ver=guia" },
  ];
}

/** El orden de ataque del día (Santos, 21-10): primero lo que sale hoy, después lo que espera. */
export const GRUPOS_DEL_DIA: { clave: string; titulo: string; prefijos: RegExp; ayuda: string }[] = [
  { clave: "urgente", titulo: "Urgente de gerencia", prefijos: /^NUNCA$/, ayuda: "Aperturas urgentes autorizadas con código." },
  { clave: "despachos", titulo: "Despachos: lo que sale hoy y lo atrasado", prefijos: /^(at|li)-/, ayuda: "Con apertura: preparar, confirmar que está listo y sacar." },
  { clave: "pruebas", titulo: "Pruebas pedidas por postventa", prefijos: /^pr-/, ayuda: "Protocolo: fotos, ficha del informe y hoja de chequeo." },
  { clave: "llamadas", titulo: "Llamadas de postventa", prefijos: /^ap[ti]-/, ayuda: "Tomar la llamada y subir el informe." },
  { clave: "colgados", titulo: "Salidas por cerrar", prefijos: /^(fc|fa|gu)-/, ayuda: "Lo que salió y le falta la foto de la carga, de la agencia o la guía." },
  { clave: "recepciones", titulo: "Equipos que llegan a planta", prefijos: /^re[cv]-/, ayuda: "Recibir con fotos y revisar con el técnico." },
  { clave: "series", titulo: "Series que pidió Central", prefijos: /^se-/, ayuda: "Se leen en la placa y quedan fijas." },
];

export function agruparTareas(tareas: Tarea[]) {
  const grupos = GRUPOS_DEL_DIA.map((g) => ({ ...g, tareas: [] as Tarea[] }));
  const otras: Tarea[] = [];
  for (const t of tareas) {
    const urgente = t.que.startsWith("URGENTE");
    const g = urgente ? grupos[0] : grupos.find((g) => g.prefijos.test(t.id));
    (g ? g.tareas : otras).push(t);
  }
  if (otras.length) grupos.push({ clave: "otras", titulo: "Otras tareas", prefijos: /./, ayuda: "", tareas: otras });
  const peso = { atrasado: 0, hoy: 1, semana: 2 };
  for (const g of grupos) g.tareas.sort((a, b) => peso[a.urgencia] - peso[b.urgencia]);
  return grupos.filter((g) => g.tareas.length > 0);
}
