import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/calendario";
import { esMarcaWhatsapp } from "@/lib/gestion-whatsapp";

/**
 * EL PANEL DEL DÍA DE POSTVENTA (Santos, 13-10: «un informe amigable
 * visualmente con buenos cuadros estadísticos para poder ver de una vista cómo
 * va cada gestión», separado por repuestos, mantenimiento…). Es la primera hoja
 * del reporte diario de una persona de postventa: solo números de SU trabajo
 * —lo que ella registró, armó o cerró—, nunca lo de las compañeras.
 *
 * Las gestiones van por la LÍNEA del expediente (`oportunidades.tipo_postventa`).
 */

export const LINEAS = [
  { clave: "repuestos", titulo: "Repuestos" },
  { clave: "mantenimiento", titulo: "Mantenimiento" },
  { clave: "soporte", titulo: "Soporte técnico y garantía" },
  { clave: "pedidos", titulo: "Despacho y puesta en marcha" },
  { clave: "otros", titulo: "Seguimiento y otros" },
] as const;
export type Linea = (typeof LINEAS)[number]["clave"];

export function lineaDe(tipoPostventa: string | null | undefined): Linea {
  switch (tipoPostventa) {
    case "repuesto":
      return "repuestos";
    case "mantenimiento":
    case "mantenimiento_correctivo":
      return "mantenimiento";
    case "garantia":
    case "soporte_tecnico":
      return "soporte";
    case "despacho":
    case "puesta_en_marcha":
      return "pedidos";
    default:
      return "otros";
  }
}

export interface PanelPostventa {
  /** Gestiones del día por línea, efectivas y sin contacto. */
  porLinea: { linea: Linea; titulo: string; efectivas: number; sinContacto: number }[];
  /** Por vía (llamada, WhatsApp, correo…). */
  porVia: { via: string; n: number }[];
  /** Por hora del día, de 8 a 18 (lo de antes o después cae en el extremo). */
  porHora: { hora: number; n: number }[];
  /** Los últimos seis días hábiles (lunes a sábado) hasta el del reporte, por línea. */
  semana: { fecha: string; etiqueta: string; porLinea: Record<Linea, number> }[];
  /** Presupuestos del día por estado, con su monto en US$. */
  presupuestos: { estado: string; n: number; usd: number }[];
  /** Sus pendientes, por tipo. */
  pendientes: { titulo: string; n: number }[];
  /** La línea de cada expediente gestionado hoy, para agrupar la sección 1. */
  lineaDeOportunidad: Record<string, Linea>;
}

type Seguimiento = { hora: string | null; tipo: string; efectivo: boolean; oportunidad_id?: string };

const VIA: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Visita a planta",
  reunion_online: "Videollamada",
};
const DIA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const ORDEN_ESTADO = ["Aceptado", "Enviado", "Aprobado, por enviar", "En gerencia", "Observado por gerencia", "Borrador", "No aceptado"];

const vacioPorLinea = (): Record<Linea, number> => ({ repuestos: 0, mantenimiento: 0, soporte: 0, pedidos: 0, otros: 0 });

/**
 * Arma el panel. `seguimientos` son los del día ya sin las marcas de WhatsApp
 * (los mismos de la sección 1). Con la llave de servicio: la ruta ya autorizó.
 */
export async function cargarPanelPostventa(
  admin: SupabaseClient,
  personaId: string,
  fecha: string,
  seguimientos: Seguimiento[],
  cotizaciones: { total: number; moneda: string; estado_texto?: string; enviada: boolean }[],
  pendientes: { titulo: string; filas: unknown[] }[],
  tc: number,
): Promise<PanelPostventa> {
  // Seis días hábiles hacia atrás (el domingo no se trabaja).
  const dias: string[] = [];
  for (let d = fecha; dias.length < 6; d = sumarDias(d, -1)) {
    if (new Date(`${d}T12:00:00Z`).getUTCDay() !== 0) dias.unshift(d);
  }
  const desde = new Date(`${dias[0]}T00:00:00-05:00`).toISOString();
  const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).toISOString();

  const idsHoy = [...new Set(seguimientos.map((s) => s.oportunidad_id).filter((x): x is string => !!x))];
  const [{ data: ops }, { data: acts }] = await Promise.all([
    idsHoy.length
      ? admin.from("oportunidades").select("id, tipo_postventa").in("id", idsHoy.slice(0, 150))
      : Promise.resolve({ data: [] as { id: string; tipo_postventa: string | null }[] }),
    admin
      .from("actividades")
      .select("realizada_at, tipo, nota, oportunidades(tipo_postventa)")
      .eq("realizada_por", personaId)
      .gte("realizada_at", desde)
      .lt("realizada_at", hasta)
      .limit(3000),
  ]);

  const tipoDe = new Map(((ops ?? []) as { id: string; tipo_postventa: string | null }[]).map((o) => [o.id, o.tipo_postventa]));
  const hoy = new Map(LINEAS.map((l) => [l.clave as Linea, { efectivas: 0, sinContacto: 0 }]));
  const vias = new Map<string, number>();
  const horas = new Map<number, number>();
  for (const s of seguimientos) {
    const c = hoy.get(lineaDe(tipoDe.get(s.oportunidad_id ?? "")))!;
    if (s.efectivo) c.efectivas++;
    else c.sinContacto++;
    const via = VIA[s.tipo] ?? "Otra";
    vias.set(via, (vias.get(via) ?? 0) + 1);
    const h = Math.min(18, Math.max(8, Number((s.hora ?? "").slice(0, 2)) || 8));
    horas.set(h, (horas.get(h) ?? 0) + 1);
  }

  const semana = dias.map((d) => {
    const f = new Date(`${d}T12:00:00Z`);
    return { fecha: d, etiqueta: `${DIA_CORTO[f.getUTCDay()]} ${d.slice(8, 10)}`, porLinea: vacioPorLinea() };
  });
  const idx = new Map(semana.map((s, i) => [s.fecha, i]));
  for (const a of (acts ?? []) as unknown as { realizada_at: string; tipo: string; nota: string | null; oportunidades: { tipo_postventa: string | null } | null }[]) {
    if (esMarcaWhatsapp(a.tipo, a.nota)) continue;
    const dia = new Date(a.realizada_at).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
    const i = idx.get(dia);
    if (i === undefined) continue;
    semana[i].porLinea[lineaDe(a.oportunidades?.tipo_postventa)]++;
  }
  // El día del reporte, con la misma cuenta que la sección 1.
  const ultimo = semana[semana.length - 1];
  ultimo.porLinea = vacioPorLinea();
  for (const [l, c] of hoy) ultimo.porLinea[l] = c.efectivas + c.sinContacto;

  const estados = new Map<string, { n: number; usd: number }>();
  for (const c of cotizaciones) {
    const est = c.estado_texto ?? (c.enviada ? "Enviado" : "Borrador");
    const e = estados.get(est) ?? { n: 0, usd: 0 };
    e.n++;
    e.usd += c.moneda === "PEN" ? (Number(c.total) || 0) / (tc || 3.75) : Number(c.total) || 0;
    estados.set(est, e);
  }

  return {
    porLinea: LINEAS.map((l) => ({ linea: l.clave, titulo: l.titulo, ...hoy.get(l.clave)! })),
    porVia: [...vias].map(([via, n]) => ({ via, n })).sort((a, b) => b.n - a.n),
    porHora: Array.from({ length: 11 }, (_, i) => ({ hora: 8 + i, n: horas.get(8 + i) ?? 0 })),
    semana,
    presupuestos: [...estados]
      .map(([estado, v]) => ({ estado, ...v }))
      .sort((a, b) => (ORDEN_ESTADO.indexOf(a.estado) + 99) % 99 - (ORDEN_ESTADO.indexOf(b.estado) + 99) % 99),
    pendientes: pendientes.map((p) => ({ titulo: p.titulo, n: p.filas.length })).filter((p) => p.n > 0),
    lineaDeOportunidad: Object.fromEntries([...tipoDe].map(([id, t]) => [id, lineaDe(t)])),
  };
}
