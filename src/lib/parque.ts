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
 *
 * DE DÓNDE SALE LA LISTA (gerencia, 10-09). Salía SOLO de las máquinas
 * fichadas —310 clientes—, y esa es la mitad de la empresa: hay 696 clientes a
 * los que se les vendió y a casi 400 nunca se les fichó el equipo, así que para
 * postventa no existían. Carlos, mirando por dónde empieza a trabajar el área:
 *
 *   «yo como postventa tendría que tener acá todas las ventas de todos los
 *    comerciales, todas las ventas de la empresa, para yo comenzar a atender
 *    […] ¿y dónde están los 900? Yo como postventa tendría que tener la vista».
 *
 * Así que la lista arranca de LAS VENTAS y las máquinas fichadas la completan.
 * El cliente que compró y no tiene equipo fichado aparece igual, con lo que se
 * sabe de él: qué compró y cuándo. Sin montos, a propósito — «que salga
 * solamente la descripción de la cotización, del producto y todo eso, pero que
 * no salga el monto».
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

  // Las ventas de la empresa, que son el punto de partida del área. Van por
  // `ventas_para_el_parque` (0208) y no por un select a `ventas`: la tabla
  // trae `monto_total` en la misma fila y el monto no se abre —«que salga
  // solamente la descripción […] pero que no salga el monto» (Carlos, 10-09)—.
  const [{ data: equipos }, { data: ventas }] = await Promise.all([
    q,
    supabase.rpc("ventas_para_el_parque", { p_comercial: opciones.comercialId }),
  ]);

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
  type FilaVenta = {
    cuenta_id: string | null;
    razon_social: string | null;
    num_doc: string | null;
    zona: string | null;
    comercial_codigo: string | null;
    comercial_nombre: string | null;
    ultima_venta: string | null;
    ventas: number | null;
    equipos: string[] | null;
  };
  const filas = (equipos ?? []) as unknown as Fila[];
  const filasVenta = (ventas ?? []) as unknown as FilaVenta[];
  if (filas.length === 0 && filasVenta.length === 0) return [];

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
  // Y ahora las ventas. Al cliente que ya vino por su máquina solo le suman la
  // fecha de compra y el equipo que no estaba fichado; el que no vino, entra
  // con la ficha que la misma función ya trajo (0211).
  for (const vt of filasVenta) {
    const cuentaId = vt.cuenta_id;
    if (!cuentaId) continue;
    const equipos = (vt.equipos ?? [])
      .filter(Boolean)
      .map((e) => e.split(/\s*[·\n]\s*/)[0].trim().slice(0, 40))
      .filter(Boolean);
    const prev = porCuenta.get(cuentaId);
    if (!prev) {
      // Sin nombre no se arma una fila: no sirve para llamar a nadie.
      if (!vt.razon_social) continue;
      porCuenta.set(cuentaId, {
        cuentaId,
        razonSocial: vt.razon_social,
        numDoc: vt.num_doc,
        zona: vt.zona,
        carteraDe: vt.comercial_codigo,
        carteraNombre: vt.comercial_nombre,
        // Sin máquina fichada: no se inventa un número. La pantalla lo dice.
        equipos: 0,
        modelos: [...new Set(equipos)].slice(0, 4),
        ultimaCompraAt: vt.ultima_venta ?? null,
        ultimoMantenimiento: null,
        mesesSinMantenimiento: null,
        estado: "sin_dato",
        garantiaHasta: null,
        ultimaGestion: null,
        enGestion: null,
      });
    } else {
      for (const e of equipos) if (!prev.modelos.includes(e) && prev.modelos.length < 4) prev.modelos.push(e);
      if (vt.ultima_venta && (!prev.ultimaCompraAt || vt.ultima_venta > prev.ultimaCompraAt)) prev.ultimaCompraAt = vt.ultima_venta;
    }
  }

  const cuentaIds = [...porCuenta.keys()];

  // El último mantenimiento también puede estar en los servicios de postventa
  // (los 605 informes importados de R:\) sin que el equipo esté fichado.
  //
  // SIN `.in` DE 700 IDS, Y SIN LOTES. Las dos consultas caben enteras —los
  // mantenimientos hechos y las oportunidades de mantenimiento abiertas son
  // cientos, no miles— y la RLS ya las recorta a lo que esta persona puede
  // ver. Pedirlas por lotes eran catorce idas y vueltas para armar una tabla:
  // seis segundos de página, casi todos de latencia. Lo que no cabe en la URL
  // no se parte en pedazos si se puede no mandar.
  const [{ data: servicios }, { data: ops }] = await Promise.all([
    supabase
      .from("servicios_postventa")
      .select("cuenta_id, fecha_confirmacion, tipo_servicio")
      .ilike("tipo_servicio", "%manten%")
      .not("fecha_confirmacion", "is", null)
      .not("cuenta_id", "is", null)
      .limit(5000),
    supabase
      .from("oportunidades")
      .select("id, cuenta_id, etapa, tipo_postventa, created_at, proxima_accion, perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)")
      .eq("tipo_postventa", "mantenimiento")
      .not("etapa", "in", "(venta,rechazada,derivada,historico)")
      .limit(2000),
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
  // Una fila por cliente, pedida por POST (0210). Antes se traían las 2.880
  // actividades siete veces —una por lote— para quedarse con 696: seis
  // segundos de página. Es la misma lección de la 0194.
  const { data: gestiones } = await supabase.rpc("ultima_gestion_de_cuentas", { p_ids: cuentaIds });
  for (const g of (gestiones ?? []) as {
    cuenta_id: string;
    realizada_at: string;
    tipo: string;
    quien: string | null;
    codigo: string | null;
  }[]) {
    const c = porCuenta.get(g.cuenta_id);
    if (!c || c.ultimaGestion) continue;
    c.ultimaGestion = {
      at: g.realizada_at,
      quien: g.quien ? `${g.quien.split(" ")[0]}${g.codigo ? ` (${g.codigo})` : ""}` : "—",
      tipo: g.tipo,
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
