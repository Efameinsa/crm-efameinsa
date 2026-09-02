import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoMantenimiento, mesesDesde, type EstadoMantenimiento, type FilaRuta } from "@/lib/ruta-mantenimiento";

/**
 * EL PARQUE INSTALADO, visto como lo que es para el negocio: clientes a los
 * que se les puede vender mantenimiento.
 *
 * Santos, 02-09: «el negocio pide que el comercial también esté verificando
 * de sus ventas a quién se le está venciendo el producto para poder venderle
 * el mantenimiento correctivo, preventivo, etc.». Y la regla que decidió: el
 * mantenimiento LO VENDEN AMBOS —el comercial dueño de la cartera y
 * postventa— pero uno ve la gestión del otro. No hay exclusividad; hay
 * visibilidad. «No creo que justo comercial y postventa llamen a la vez a la
 * misma persona en un mismo instante.»
 *
 * De ahí las tres columnas que deciden la llamada, por cliente:
 *   · el parque: cuántas máquinas y cuáles;
 *   · el último mantenimiento (del parque fichado o de los servicios de
 *     postventa) y su semáforo: nunca / vencido / al día;
 *   · la última gestión de CUALQUIERA —comercial o postventa— y si ya hay
 *     una oportunidad de mantenimiento abierta y de quién.
 *
 * La garantía por serie entra cuando lleguen las guías de remisión: hoy solo
 * 11 de 314 equipos la tienen. No se inventa.
 */

export interface ClienteParque {
  cuentaId: string;
  razonSocial: string;
  numDoc: string | null;
  zona: string | null;
  /** Código del comercial dueño de la cartera (C5, PV…). */
  carteraDe: string | null;
  carteraNombre: string | null;
  equipos: number;
  /** Modelos, cortos, para leer de un vistazo. */
  modelos: string[];
  ultimaCompraAt: string | null;
  ultimoMantenimiento: string | null;
  mesesSinMantenimiento: number | null;
  estado: EstadoMantenimiento;
  garantiaHasta: string | null;
  ultimaGestion: { at: string; quien: string; tipo: string } | null;
  /** Oportunidad de mantenimiento ya abierta, por quien sea: se ve, no se duplica. */
  enGestion: { oportunidadId: string; quien: string; desde: string; proximaAccion: string | null } | null;
}

const ORDEN_ESTADO: Record<EstadoMantenimiento, number> = { nunca: 0, vencido: 1, sin_dato: 2, al_dia: 3 };

export async function cargarParque(
  supabase: SupabaseClient,
  opciones: { comercialId: string | null; hoy: string },
): Promise<ClienteParque[]> {
  let q = supabase
    .from("equipos_instalados")
    .select(
      "cuenta_id, serie, modelo_texto, fecha_venta, ultimo_mantenimiento, garantia_hasta, cuentas!inner(id, razon_social, num_doc, distrito, provincia, ultima_venta_at, comercial_id, perfiles(codigo_comercial, nombre))",
    )
    .eq("es_prueba", false)
    .not("cuenta_id", "is", null)
    .limit(2000);
  if (opciones.comercialId) q = q.eq("cuentas.comercial_id", opciones.comercialId);
  const { data: equipos } = await q;

  type Fila = {
    cuenta_id: string;
    serie: string | null;
    modelo_texto: string | null;
    fecha_venta: string | null;
    ultimo_mantenimiento: string | null;
    garantia_hasta: string | null;
    cuentas: {
      id: string;
      razon_social: string;
      num_doc: string | null;
      distrito: string | null;
      provincia: string | null;
      ultima_venta_at: string | null;
      comercial_id: string | null;
      perfiles: { codigo_comercial: string | null; nombre: string } | null;
    };
  };
  const filas = (equipos ?? []) as unknown as Fila[];
  if (filas.length === 0) return [];

  const porCuenta = new Map<string, ClienteParque>();
  for (const e of filas) {
    const c = e.cuentas;
    const prev = porCuenta.get(e.cuenta_id);
    const modelo = (e.modelo_texto ?? "").split(/\s*[·\n]\s*/)[0].trim().slice(0, 40);
    if (!prev) {
      porCuenta.set(e.cuenta_id, {
        cuentaId: e.cuenta_id,
        razonSocial: c.razon_social,
        numDoc: c.num_doc,
        zona: c.distrito ?? c.provincia ?? null,
        carteraDe: c.perfiles?.codigo_comercial ?? null,
        carteraNombre: c.perfiles?.nombre ?? null,
        equipos: 1,
        modelos: modelo ? [modelo] : [],
        ultimaCompraAt: c.ultima_venta_at ?? e.fecha_venta ?? null,
        ultimoMantenimiento: e.ultimo_mantenimiento ?? null,
        mesesSinMantenimiento: null,
        estado: "sin_dato",
        garantiaHasta: e.garantia_hasta ?? null,
        ultimaGestion: null,
        enGestion: null,
      });
    } else {
      prev.equipos += 1;
      if (modelo && !prev.modelos.includes(modelo) && prev.modelos.length < 4) prev.modelos.push(modelo);
      if (e.ultimo_mantenimiento && (!prev.ultimoMantenimiento || e.ultimo_mantenimiento > prev.ultimoMantenimiento)) prev.ultimoMantenimiento = e.ultimo_mantenimiento;
      if (e.fecha_venta && (!prev.ultimaCompraAt || e.fecha_venta > prev.ultimaCompraAt)) prev.ultimaCompraAt = e.fecha_venta;
      if (e.garantia_hasta && (!prev.garantiaHasta || e.garantia_hasta > prev.garantiaHasta)) prev.garantiaHasta = e.garantia_hasta;
    }
  }
  const cuentaIds = [...porCuenta.keys()];

  // El último mantenimiento también puede estar en los servicios de postventa
  // (los 605 informes importados de R:\) sin que el equipo esté fichado.
  const [{ data: servicios }, { data: ops }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("cuenta_id, fecha_confirmacion, tipo_servicio")
      .in("cuenta_id", cuentaIds)
      .ilike("tipo_servicio", "%manten%")
      .not("fecha_confirmacion", "is", null),
    supabase
      .from("oportunidades")
      .select("id, cuenta_id, etapa, tipo_postventa, created_at, proxima_accion, perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)")
      .in("cuenta_id", cuentaIds)
      .eq("tipo_postventa", "mantenimiento")
      .not("etapa", "in", "(venta,rechazada,derivada,historico)"),
  ]);
  for (const s of servicios ?? []) {
    const c = porCuenta.get(s.cuenta_id as string);
    const f = (s.fecha_confirmacion as string).slice(0, 10);
    if (c && (!c.ultimoMantenimiento || f > c.ultimoMantenimiento)) c.ultimoMantenimiento = f;
  }
  for (const o of ops ?? []) {
    const c = porCuenta.get(o.cuenta_id as string);
    if (!c || c.enGestion) continue;
    const p = o.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    c.enGestion = {
      oportunidadId: o.id as string,
      quien: p ? `${p.nombre}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}` : "alguien",
      desde: (o.created_at as string).slice(0, 10),
      proximaAccion: (o.proxima_accion as string | null) ?? null,
    };
  }

  // La última gestión de cualquiera, sobre cualquier oportunidad del cliente:
  // comercial o postventa, da igual. Es lo que evita la doble llamada.
  const { data: gestiones } = await supabase
    .from("actividades")
    .select("realizada_at, tipo, oportunidades!inner(cuenta_id), perfiles!actividades_realizada_por_fkey(nombre, codigo_comercial)")
    .in("oportunidades.cuenta_id", cuentaIds)
    .not("tipo", "eq", "nota")
    .order("realizada_at", { ascending: false })
    .limit(3000);
  for (const g of gestiones ?? []) {
    const cuentaId = (g.oportunidades as unknown as { cuenta_id: string }).cuenta_id;
    const c = porCuenta.get(cuentaId);
    if (!c || c.ultimaGestion) continue;
    const p = g.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
    c.ultimaGestion = {
      at: g.realizada_at as string,
      quien: p ? `${p.nombre.split(" ")[0]}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}` : "—",
      tipo: g.tipo as string,
    };
  }

  const lista = [...porCuenta.values()];
  for (const c of lista) {
    c.estado = estadoMantenimiento({ ultimoMantenimiento: c.ultimoMantenimiento, compraAt: c.ultimaCompraAt } as FilaRuta, opciones.hoy);
    c.mesesSinMantenimiento = mesesDesde(c.ultimoMantenimiento ?? c.ultimaCompraAt, opciones.hoy);
  }
  // Primero lo que más argumento tiene: nunca, después vencido (más viejo
  // primero), y lo que ya está en gestión al final de su grupo.
  lista.sort(
    (a, b) =>
      ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado] ||
      Number(!!a.enGestion) - Number(!!b.enGestion) ||
      (b.mesesSinMantenimiento ?? 0) - (a.mesesSinMantenimiento ?? 0) ||
      a.razonSocial.localeCompare(b.razonSocial),
  );
  return lista;
}
