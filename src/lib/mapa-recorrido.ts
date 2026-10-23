import { PASOS_VISIBLES, SELLO_DE_ETAPA, pasoDe, queLeFalta, reglaDeLaCasilla, type Atencion, type EtapaAtencion } from "@/lib/atenciones";
import { bloquesPedido, circuitoDe, type ResponsablePaso, type ServicioPostventa } from "@/lib/postventa";

/**
 * EL MAPA DEL RECORRIDO (Santos, 23-10-2026): «para caso de cliente se muestre
 * en postventa una sección que diga mapa… todo lo avanzado en verde suave, la
 * ruta que falta en rojo y palpitando la etapa donde se encuentra atascada, y
 * ahí un botón que diga apurar al área donde está atorado». Lo ven también el
 * comercial (si nace de una venta suya), Finanzas, Facturación / Contabilidad,
 * el almacén y operaciones.
 *
 * EL MAPA NO GUARDA ESTADO: lee los pasos que ya existen (la regla del
 * Recorrido del 02-10: «el árbol LEE los pasos reales, nunca estado
 * paralelo»). El pedido sale de `bloquesPedido` —los mismos pasos, dueños y
 * trabas que la ficha del pedido— y la etapa atascada es la misma que dice
 * `queLoFrena` en la cabecera: el primer paso sin hacer. El caso sale de la
 * tira del circuito (`PASOS_VISIBLES`) y la recepción en planta de sus sellos.
 */

export type AreaMapa = "comercial" | "central" | "almacen" | "finanzas" | "contabilidad" | "postventa" | "tecnico" | "cliente";

export const ETIQUETA_AREA: Record<AreaMapa, string> = {
  comercial: "Comercial",
  central: "Central",
  almacen: "Almacén",
  finanzas: "Finanzas",
  contabilidad: "Contabilidad / Facturación",
  postventa: "Postventa",
  tecnico: "Técnico",
  cliente: "El cliente",
};

/** A qué área le llega el «Apurar» de una etapa. El técnico lo programa postventa; al cliente se lo llama. */
export function areaQueSeApura(area: AreaMapa): "central" | "almacen" | "finanzas" | "contabilidad" | "postventa" | null {
  if (area === "tecnico") return "postventa";
  if (area === "cliente" || area === "comercial") return null;
  return area;
}

export interface EtapaMapa {
  clave: string;
  etiqueta: string;
  area: AreaMapa;
  hecho: boolean;
  /** No corresponde a este recorrido o se pasó sin él: ni verde ni rojo. */
  noAplica?: string;
  cuando: string | null;
  quien?: string | null;
  detalle?: string;
  trabado?: string;
  alerta?: string;
}

export type TipoRuta = "pedido" | "caso" | "recepcion";

export interface RutaMapa {
  tipo: TipoRuta;
  id: string;
  titulo: string;
  /** Dónde se trabaja ese recorrido (la ficha del pedido, el caso, la recepción). */
  enlace: string | null;
  etapas: EtapaMapa[];
  /** Índice de la etapa donde está atascado; -1 si ya terminó. */
  actual: number;
  /** Desde cuándo está ahí: el último paso hecho antes (o cuando empezó el recorrido). */
  desde: string | null;
}

const ULTIMA = (fechas: (string | null | undefined)[]): string | null =>
  fechas.filter((f): f is string => typeof f === "string" && f.length > 0).sort().at(-1) ?? null;

/** Cierra la ruta: dónde está atascada y desde cuándo. */
export function armarRuta(base: Omit<RutaMapa, "actual" | "desde">, inicio: string | null): RutaMapa {
  const actual = base.etapas.findIndex((e) => !e.hecho && !e.noAplica);
  const antes = actual < 0 ? base.etapas : base.etapas.slice(0, actual);
  return { ...base, actual, desde: actual < 0 ? null : (ULTIMA(antes.filter((e) => e.hecho).map((e) => e.cuando)) ?? inicio) };
}

const DEL_RESPONSABLE: Record<ResponsablePaso, AreaMapa> = {
  postventa: "postventa",
  almacen: "almacen",
  finanzas: "finanzas",
  cliente: "cliente",
  central: "central",
};

type ExtraPedido = {
  /** Máquinas del pedido sin serie (las piezas de una torre no cuentan). */
  sinSerie?: number;
  /** Facturas vigentes del pedido (sin anular). */
  facturas?: number;
  nombres?: Record<string, string>;
};

type CamposCentral = {
  series_pedidas_at?: string | null;
  liquidacion_adjunto?: string | null;
  no_se_factura_motivo?: string | null;
  created_at?: string | null;
};

/**
 * DEL CIERRE AL PEDIDO LIBERADO (P1 del mapa de procesos): lo que hacen
 * Central, el almacén y Finanzas antes de que el pedido llegue a postventa.
 * Lo que se dejó atrás porque un paso posterior ya se hizo (Central puede
 * ejecutar con series pendientes, 23-09) no se pinta en rojo.
 */
function etapasDeCentral(s: ServicioPostventa & CamposCentral, x: ExtraPedido): EtapaMapa[] {
  if (!s.informe_cierre_id) return [];
  const sinSerie = x.sinSerie ?? 0;
  const esServicio = circuitoDe(s).esServicio;
  const etapas: EtapaMapa[] = [
    { clave: "cierre", etiqueta: "Cierre de venta emitido", area: "comercial", hecho: true, cuando: s.created_at ?? null },
    ...(esServicio
      ? []
      : [
          s.series_pedidas_at || sinSerie === 0
            ? {
                clave: "series",
                etiqueta: sinSerie === 0 ? "Series de cada máquina puestas" : `Faltan ${sinSerie} serie${sinSerie === 1 ? "" : "s"}`,
                area: "almacen" as AreaMapa,
                hecho: sinSerie === 0,
                cuando: s.series_pedidas_at ?? null,
                detalle: sinSerie > 0 ? "Central ya se las pidió al almacén: falta escribirlas como se leen en la placa" : undefined,
              }
            : { clave: "series", etiqueta: "Pedir las series al almacén", area: "central" as AreaMapa, hecho: false, cuando: null },
        ]),
    { clave: "pedido_generado", etiqueta: "Pedido generado", area: "central", hecho: Boolean(s.numero_pedido_erp), cuando: null, detalle: s.numero_pedido_erp ? `Pedido ${s.numero_pedido_erp}` : undefined },
    {
      clave: "liquidacion_subida",
      etiqueta: "Liquidación subida",
      area: "finanzas",
      hecho: Boolean(s.liquidacion_adjunto || s.liquidacion_at),
      cuando: null,
      detalle: "Finanzas sube la liquidación y la factura en «Liquidar»",
    },
    { clave: "liquidacion_aceptada", etiqueta: "Liquidación aceptada", area: "central", hecho: Boolean(s.liquidacion_at), cuando: s.liquidacion_at ?? null },
    { clave: "ejecutado", etiqueta: "Pedido ejecutado y liberado a postventa", area: "central", hecho: Boolean(s.pedido_ejecutado_at), cuando: s.pedido_ejecutado_at ?? null },
  ];
  // Lo que quedó atrás de un paso ya hecho se pasó sin él.
  const ultimoHecho = etapas.map((e) => e.hecho).lastIndexOf(true);
  return etapas.map((e, i) =>
    !e.hecho && i < ultimoHecho
      ? { ...e, noAplica: e.clave === "series" ? `Se ejecutó con ${sinSerie} serie${sinSerie === 1 ? "" : "s"} pendiente${sinSerie === 1 ? "" : "s"}` : "Se pasó sin este paso" }
      : e,
  );
}

/** Las etapas del pedido, de la venta al cierre, con quién debe cada una. */
export function etapasDelPedido(s: ServicioPostventa & CamposCentral, x: ExtraPedido = {}): EtapaMapa[] {
  const circuito = circuitoDe(s);
  const central = etapasDeCentral(s, x);
  const liberado = !s.informe_cierre_id || Boolean(s.pedido_ejecutado_at);
  const pasos: EtapaMapa[] = [];
  for (const b of bloquesPedido(s, x.nombres)) {
    for (const p of b.pasos) {
      // Mientras Central no lo libera, postventa no lo tiene: sus pasos esperan, no están atascados.
      pasos.push({
        clave: p.clave,
        etiqueta: p.etiqueta,
        area: DEL_RESPONSABLE[p.responsable],
        hecho: p.hecho,
        cuando: p.cuando,
        quien: p.quien ?? null,
        detalle: p.detalle,
        trabado: liberado ? p.trabado : undefined,
        alerta: p.alerta,
      });
      // LA GUÍA (P3): Contabilidad la autoriza después de la apertura; sin ella no sale nada.
      if (p.clave === "apertura" && (s.guia_confirmada_at || (!circuito.esServicio && !circuito.entregaEnPlanta))) {
        pasos.push({
          clave: "guia",
          etiqueta: s.guia_confirmada_at ? "Guía autorizada" : "Autorizar la guía",
          area: "contabilidad",
          hecho: Boolean(s.guia_confirmada_at || s.despachado_at),
          cuando: s.guia_confirmada_at ?? null,
          detalle: s.guia_confirmada_at ? undefined : s.despachado_at ? "Salió sin la marca de guía autorizada en el CRM" : "Si Contabilidad no está, la autoriza Finanzas",
        });
      }
      // LA FACTURA (P4): la orden de postventa → el OK de Finanzas → Facturación factura.
      if (p.clave === "facturar") {
        pasos.push({
          clave: "ok_facturar",
          etiqueta: "OK de Finanzas para facturar",
          area: "finanzas",
          hecho: Boolean(s.orden_facturar_atendida_at || (x.facturas ?? 0) > 0 || s.no_se_factura_motivo),
          cuando: s.orden_facturar_atendida_at ?? null,
        });
        pasos.push({
          clave: "factura",
          etiqueta: s.no_se_factura_motivo ? "No se factura" : "Factura emitida",
          area: "contabilidad",
          hecho: (x.facturas ?? 0) > 0 || Boolean(s.no_se_factura_motivo),
          cuando: null,
          detalle: s.no_se_factura_motivo ?? ((x.facturas ?? 0) > 1 ? `${x.facturas} facturas vigentes` : undefined),
        });
      }
    }
  }
  return [...central, ...pasos];
}

export function rutaDelPedido(s: ServicioPostventa & CamposCentral, x: ExtraPedido = {}, enlace: string | null = null): RutaMapa {
  const equipo = (s.equipo ?? "").split("\n")[0].slice(0, 60);
  const titulo = `${circuitoDe(s).esServicio ? "Apertura de servicio" : "Pedido"}${s.numero_pedido_erp ? ` ${s.numero_pedido_erp}` : ""}${equipo ? ` · ${equipo}` : ""}`;
  const r = armarRuta({ tipo: "pedido", id: s.id, titulo, enlace, etapas: etapasDelPedido(s, x) }, s.created_at ?? null);
  // Un pedido cerrado terminó, aunque haya quedado algo sin marcar (una orden que no hizo falta).
  if (s.cerrado_at || s.completado) return { ...r, actual: -1, desde: null };
  return r;
}

/** Quién mueve cada casilla de la tira del caso cuando le toca. */
const AREA_DE_CASILLA: Record<string, AreaMapa> = {
  solicitud: "central",
  registro: "central",
  diagnostico: "postventa",
  planificacion: "postventa",
  atencion: "tecnico",
  pruebas: "tecnico",
  cierre: "postventa",
  seguimiento: "postventa",
};

const AREA_DE_RESPONSABLE: Record<string, AreaMapa> = { Central: "central", Postventa: "postventa", Técnico: "tecnico", Cliente: "cliente" };

/**
 * EL CASO (P7): la tira del circuito. Estar en una etapa es haberla sellado:
 * lo que falta es la casilla que sigue (Central deriva y sella juntas la
 * solicitud y el registro; el trabajo del área empieza en los antecedentes).
 */
export function etapasDelCaso(
  a: Pick<Atencion, "etapa" | "tipo" | "cerrado_at" | "solicitado_at" | "en_garantia" | "programada_at" | "etapas_omitidas"> & Partial<Atencion>,
): EtapaMapa[] {
  const iEtapa = pasoDe(a.etapa);
  const pendiente = queLeFalta(a as Atencion);
  const omitidas: Record<string, { motivo?: string } | undefined> = a.etapas_omitidas ?? {};
  const casillas = PASOS_VISIBLES.filter((c) => c.clave !== "seguimiento" || a.etapa === "seguimiento");
  let primeraPendiente = true;
  return casillas.map((c) => {
    const ultima = c.cubre.reduce((m, e) => Math.max(m, pasoDe(e)), -1);
    const regla = reglaDeLaCasilla(a.tipo, c.cubre);
    const sello = SELLO_DE_ETAPA[c.cubre.at(-1) as EtapaAtencion] ?? (c.clave === "solicitud" ? "solicitado_at" : null);
    const cuando = sello ? ((a as Record<string, unknown>)[sello as string] as string | null | undefined) ?? null : null;
    const hecho = c.clave === "cierre" ? Boolean(a.cerrado_at) : ultima <= iEtapa;
    let area = AREA_DE_CASILLA[c.clave] ?? "postventa";
    let noAplica: string | undefined;
    if (regla === "no_corresponde") noAplica = "No corresponde a este tipo de caso";
    else if (hecho && c.cubre.every((e) => omitidas[e])) noAplica = `Saltado${omitidas[c.cubre[0]]?.motivo ? `: ${omitidas[c.cubre[0]]?.motivo}` : " (era opcional)"}`;
    else if (!hecho && a.cerrado_at) noAplica = "El caso se cerró antes";
    if (!hecho && !noAplica && primeraPendiente) {
      primeraPendiente = false;
      area = AREA_DE_RESPONSABLE[pendiente.responsable] ?? area;
    }
    return {
      clave: c.clave,
      etiqueta: c.etiqueta,
      area,
      hecho: hecho && !noAplica,
      noAplica,
      cuando: hecho ? cuando : null,
      detalle: !hecho && !noAplica && area === AREA_DE_RESPONSABLE[pendiente.responsable] ? pendiente.texto : undefined,
    };
  });
}

export function rutaDelCaso(
  a: Parameters<typeof etapasDelCaso>[0] & { id: string; codigo?: string | null },
  enlace: string | null = null,
): RutaMapa {
  return armarRuta({ tipo: "caso", id: a.id, titulo: `Caso${a.codigo ? ` ${a.codigo}` : ""}`, enlace, etapas: etapasDelCaso(a) }, a.solicitado_at ?? null);
}

/** EL EQUIPO QUE ENTRA A PLANTA (P14): orden → recibido → revisado → listo. */
export function rutaDeRecepcion(r: {
  id: string;
  codigo: string;
  equipo_texto?: string | null;
  created_at?: string | null;
  recibido_at: string | null;
  revisado_at: string | null;
  listo_at: string | null;
  resultado?: string | null;
}): RutaMapa {
  const etapas: EtapaMapa[] = [
    { clave: "orden", etiqueta: "Orden de recepción", area: "postventa", hecho: true, cuando: r.created_at ?? null },
    { clave: "recibido", etiqueta: "Recibido en planta con fotos", area: "almacen", hecho: Boolean(r.recibido_at), cuando: r.recibido_at },
    { clave: "revisado", etiqueta: "Revisado: diagnóstico y fotos", area: "almacen", hecho: Boolean(r.revisado_at), cuando: r.revisado_at },
    {
      clave: "listo",
      etiqueta: r.listo_at ? (r.resultado === "cotizar" ? "Listo: hay que cotizar" : "Listo para devolver") : "Listo con resultado",
      area: "almacen",
      hecho: Boolean(r.listo_at),
      cuando: r.listo_at,
    },
  ];
  return armarRuta(
    { tipo: "recepcion", id: r.id, titulo: `Recepción ${r.codigo}${r.equipo_texto ? ` · ${r.equipo_texto.slice(0, 50)}` : ""}`, enlace: `/recepciones/${r.id}`, etapas },
    r.created_at ?? null,
  );
}

/** «Atascado hace 3 d» / «hace 5 h»: lo que dice la etiqueta que palpita. */
export function haceCuanto(desde: string | null, ahora = new Date()): string | null {
  if (!desde) return null;
  const ms = ahora.getTime() - new Date(desde.length === 10 ? `${desde}T12:00:00` : desde).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const h = ms / 36e5;
  if (h < 1) return `hace ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `hace ${Math.round(h)} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** La frase del resumen: dónde está y a quién hay que ir a buscar. */
export function resumenDeRuta(r: RutaMapa, ahora = new Date()): string {
  if (r.actual < 0) return "Recorrido completo";
  const e = r.etapas[r.actual];
  const hace = haceCuanto(r.desde, ahora);
  return `Atascado en «${e.etiqueta}» · le toca a ${ETIQUETA_AREA[e.area]}${hace ? ` · ${hace}` : ""}`;
}
