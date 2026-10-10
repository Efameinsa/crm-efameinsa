import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarDias } from "@/lib/calendario";

/**
 * Las gestiones del día de UNA persona de postventa, en un cuadro por ruta
 * (buzón, Ariana PV3, 10-10: «que se separen las gestiones en cuadros
 * diferentes: uno para la regularización de los equipos de la ruta de pedidos
 * y otro para mantenimiento y repuestos, ya que pertenecen a rutas distintas»).
 *
 * Los pedidos no dejan una «actividad»: lo que hizo queda en la marca
 * `<paso>_por` / `<paso>_at` del pedido, en la serie registrada y en el file
 * pedido. Los seguimientos sí son actividades y van por el tipo de la
 * oportunidad.
 */
export type RutaPostventa = {
  titulo: string;
  filas: { hora: string | null; cliente: string; detalle: string | null }[];
};

type Seguimiento = { hora: string | null; cliente: string; tipo: string; nota: string | null; resultado: string | null; oportunidad_id?: string };

/** Pasos del pedido que firma postventa, con cómo se leen en el reporte. */
const PASOS_DEL_PEDIDO: [paso: string, texto: string][] = [
  ["condicion_definida", "Definió la condición de pago"],
  ["pago_solicitado", "Pidió a finanzas confirmar el pago"],
  ["pago_confirmado", "Confirmó el pago"],
  ["series_pedidas", "Pidió las series al almacén"],
  ["pedido_generado", "Generó el pedido"],
  ["apertura_despacho", "Emitió la apertura de servicio"],
  ["salida_autorizada", "Autorizó la salida"],
  ["despacho_verificado", "Verificó el despacho"],
  ["liquidacion_subida", "Subió la liquidación"],
  ["aprobado", "Aprobó el pedido"],
  ["pedido_ejecutado", "Marcó el pedido como ejecutado"],
];

/** Garantía, despacho y puesta en marcha son del pedido del equipo; lo demás, de mantenimiento y repuestos. */
const DEL_PEDIDO = new Set(["garantia", "despacho", "puesta_en_marcha"]);

const VIA: Record<string, string> = {
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  visita: "Visita",
  showroom: "Visita a planta",
  reunion_online: "Videollamada",
};

const horaLima = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-PE", { timeZone: "America/Lima", hour: "2-digit", minute: "2-digit", hour12: false });
const corto = (t: string | null | undefined, n: number) => {
  const s = (t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const porHora = (a: { hora: string | null }, b: { hora: string | null }) => (a.hora ?? "99").localeCompare(b.hora ?? "99");

export async function gestionesPorRuta(
  supabase: SupabaseClient,
  perfilId: string,
  fecha: string,
  seguimientos: Seguimiento[],
): Promise<RutaPostventa[]> {
  const desde = new Date(`${fecha}T00:00:00-05:00`).getTime();
  const hasta = new Date(`${sumarDias(fecha, 1)}T00:00:00-05:00`).getTime();
  const delDia = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() >= desde && new Date(iso).getTime() < hasta;
  const desdeIso = `${fecha}T00:00:00-05:00`;
  const hastaIso = `${sumarDias(fecha, 1)}T00:00:00-05:00`;

  const columnas = PASOS_DEL_PEDIDO.flatMap(([p]) => [`${p}_por`, `${p}_at`]).join(", ");
  const idsOportunidad = [...new Set(seguimientos.map((s) => s.oportunidad_id).filter((x): x is string => !!x))];

  const [{ data: servicios }, { data: series }, { data: files }, { data: oportunidades }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select(`id, cliente_texto, equipo, ${columnas}`)
      .or(PASOS_DEL_PEDIDO.map(([p]) => `${p}_por.eq.${perfilId}`).join(","))
      .limit(500),
    supabase
      .from("pedido_equipos")
      .select("serie, descripcion, serie_registrada_at, servicios_postventa(cliente_texto)")
      .eq("serie_registrada_por", perfilId)
      .gte("serie_registrada_at", desdeIso)
      .lt("serie_registrada_at", hastaIso),
    supabase
      .from("prestamos_file")
      .select("cliente_texto, pedido_numero, nota, solicitado_at, cuentas(razon_social)")
      .eq("solicitado_por", perfilId)
      .gte("solicitado_at", desdeIso)
      .lt("solicitado_at", hastaIso),
    idsOportunidad.length
      ? supabase.from("oportunidades").select("id, tipo_postventa").in("id", idsOportunidad)
      : Promise.resolve({ data: [] as { id: string; tipo_postventa: string | null }[] }),
  ]);

  const pedidos: RutaPostventa["filas"] = [];
  for (const s of (servicios ?? []) as unknown as Record<string, string | null>[]) {
    for (const [paso, texto] of PASOS_DEL_PEDIDO) {
      if (s[`${paso}_por`] !== perfilId || !delDia(s[`${paso}_at`])) continue;
      pedidos.push({
        hora: horaLima(s[`${paso}_at`] as string),
        cliente: s.cliente_texto ?? "Cliente sin nombre",
        detalle: `${texto} · ${corto(s.equipo, 60)}`,
      });
    }
  }
  for (const e of (series ?? []) as unknown as {
    serie: string | null;
    descripcion: string | null;
    serie_registrada_at: string;
    servicios_postventa: { cliente_texto: string | null } | null;
  }[]) {
    pedidos.push({
      hora: horaLima(e.serie_registrada_at),
      cliente: e.servicios_postventa?.cliente_texto ?? "Cliente sin nombre",
      detalle: `Registró la serie ${e.serie ?? ""} · ${corto(e.descripcion, 50)}`,
    });
  }
  for (const f of (files ?? []) as unknown as {
    cliente_texto: string | null;
    pedido_numero: string | null;
    nota: string | null;
    solicitado_at: string;
    cuentas: { razon_social: string } | null;
  }[]) {
    pedidos.push({
      hora: horaLima(f.solicitado_at),
      cliente: f.cuentas?.razon_social ?? f.cliente_texto ?? "Cliente sin nombre",
      detalle: `Pidió el file${f.pedido_numero ? ` del pedido ${f.pedido_numero}` : ""}${f.nota ? ` · ${corto(f.nota, 60)}` : ""}`,
    });
  }

  const tipoDe = new Map(((oportunidades ?? []) as { id: string; tipo_postventa: string | null }[]).map((o) => [o.id, o.tipo_postventa]));
  const mantenimiento: RutaPostventa["filas"] = [];
  for (const s of seguimientos) {
    const fila = {
      hora: s.hora,
      cliente: s.cliente,
      detalle: `${VIA[s.tipo] ?? s.tipo}${s.resultado ? ` · ${s.resultado}` : ""}${s.nota ? ` · ${corto(s.nota, 300)}` : ""}`,
    };
    if (DEL_PEDIDO.has(tipoDe.get(s.oportunidad_id ?? "") ?? "")) pedidos.push(fila);
    else mantenimiento.push(fila);
  }

  return [
    { titulo: "Regularización de equipos · ruta de pedidos", filas: pedidos.sort(porHora) },
    { titulo: "Mantenimiento y repuestos", filas: mantenimiento.sort(porHora) },
  ];
}
