import { createClient } from "@/lib/supabase/server";
import { contenidoDeFicha } from "@/lib/ficha-tecnica";
import type { TipoDocumento } from "@/lib/documento";
import type {
  BorradorEnEdicion,
  CorreccionAbierta,
  HistorialPrecio,
  ProductoCotizable,
} from "@/components/crm/tipos-cotizador";

/**
 * Todo lo que la PANTALLA del cotizador necesita, en un solo viaje.
 *
 * Vivía dentro de `oportunidades/[id]/page.tsx`, que cargaba los 95 equipos con
 * su ficha completa —172 KB— aunque el comercial solo entrara a leer el
 * historial del cliente. Desde que cotizar es una pantalla propia (27-08), el
 * catálogo viaja únicamente cuando de verdad se va a cotizar.
 */

export interface EmpresaDelGrupo {
  id: string;
  razonSocial: string;
  numDoc: string | null;
  esMadre: boolean;
}

export interface ContextoCotizador {
  oportunidadId: string;
  /** Es un caso de postventa (tipo_postventa): se cotiza servicio o repuesto, no máquinas (26-09). */
  esCasoPostventa: boolean;
  cuenta: {
    id: string;
    razonSocial: string;
    tipoDoc: TipoDocumento;
    numDoc: string | null;
    direccion: string | null;
    /**
     * Las razones sociales del mismo grupo (0310, Katerine 25-09): la
     * cotización puede salir a nombre de cualquiera sin abrir otra ficha.
     */
    grupo: EmpresaDelGrupo[];
  } | null;
  /** El contacto principal, para tenerlo a mano mientras se cotiza. */
  contacto: { nombre: string; cargo: string | null; telefono: string | null } | null;
  /** Lo que pidió el prospecto: se cotiza contra esto, conviene releerlo. */
  solicitud: string | null;
  productos: ProductoCotizable[];
  historialPrecios: Record<string, HistorialPrecio>;
  /** El borrador que se está corrigiendo, si se entró a uno. */
  borrador?: BorradorEnEdicion;
  /** Solo en modo corrección: la autorización que está corriendo. */
  correccion?: CorreccionAbierta;
}

/**
 * Lo que el cotizador necesita de cada equipo para que el comercial pueda
 * CONFIRMAR que eligió el correcto antes de agregarlo: foto, datos de placa y
 * las características. No la ficha entera de la base — pero sí completa, que es
 * lo que pidió gerencia el 25-08: «la idea es que la característica completa se
 * muestre».
 *
 * El aviso de "sin ficha" existe porque el 24-08 Brenda cotizó a un cliente
 * real un equipo sin datos técnicos (LG TITAN-18) y se enteró recién al abrir
 * el PDF, cuando la página de la ficha salió vacía.
 */
/** `ficha.fotos_por_color` es jsonb libre: solo pasan los pares color → ruta. */
function mapaDeFotos(valor: unknown): Record<string, string> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).filter((par): par is [string, string] => typeof par[1] === "string"),
  );
}

function mapearProducto(pr: {
  id: string;
  sku: string | null;
  marca: string;
  modelo: string;
  nombre: string;
  capacidad: string | null;
  segmento: string;
  ficha: Record<string, unknown> | null;
  foto_path: string | null;
  precios_producto: { tier: string; precio: number; vigente_hasta: string | null }[];
}): ProductoCotizable {
  const ficha = pr.ficha;
  const lista = (clave: string) =>
    Array.isArray(ficha?.[clave]) ? (ficha![clave] as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const texto = (clave: string) => (typeof ficha?.[clave] === "string" && ficha[clave] ? (ficha[clave] as string) : null);

  // Las dos formas de guardar la ficha —los cuatro cajones viejos y `bloques`,
  // la descripción leída del Word— se resuelven en un solo lugar: la pantalla
  // miraba solo los cajones y marcaba «sin ficha» a los equipos cargados de
  // cero, con su ficha completa en la base (28-08, en plena cotización).
  const { caracteristicas, nDimensiones, sinFicha } = contenidoDeFicha(ficha);

  return {
    id: pr.id,
    sku: pr.sku,
    marca: pr.marca,
    modelo: pr.modelo,
    nombre: pr.nombre,
    capacidad: pr.capacidad,
    segmento: pr.segmento as ProductoCotizable["segmento"],
    // Solo el precio VIGENTE por tier. La consulta trae todo el historial de
    // precios_producto, y el cotizador hace `.find(p => p.tier === tier)`: sin
    // este filtro podía devolver un precio vencido si Postgres regresaba
    // primero esa fila. Pasó real — la SECGIA102 cotizaba a 2490 (vencido el
    // 25-08) en vez de 2090 (el vigente), reportado el 26-08.
    precios_producto: pr.precios_producto.filter((p) => p.vigente_hasta === null),
    // "secadora eléctrica" es como la piden los clientes, pero esa palabra solo
    // vive acá dentro, no en el nombre del equipo.
    calentamiento: texto("calentamiento"),
    montaje: texto("montaje"),
    panel: texto("panel"),
    controles: texto("controles"),
    colores: lista("colores"),
    // El texto del maestro de Lesly, para que la búsqueda entienda el
    // vocabulario de las comerciales («x control», «boiler fed», «200g»…).
    // Y el nombre del Word de Lesly, que trae el vocabulario de la casa: el
    // maestro llama «CARRO DE LVANDERIA» a lo que todos piden como coche.
    descripcion: [texto("descripcion_maestro"), texto("nombre_ficha")].filter(Boolean).join(" · ") || null,
    fotoPath: pr.foto_path,
    // Los coches de transporte se fabrican en varios colores y Lesly hizo un
    // Word (con su foto) por color: el selector las muestra como miniaturas
    // para que el comercial vea el que le está ofreciendo al cliente.
    fotosPorColor: mapaDeFotos(ficha?.fotos_por_color),
    caracteristicas,
    nDimensiones,
    sinFicha,
    sinFoto: !pr.foto_path,
    // Stock según la columna del Excel de Lesly, guardado al cargar el equipo.
    stock: typeof ficha?.stock_referencia === "number" ? (ficha.stock_referencia as number) : null,
    // La foto es la de un equipo HERMANO, porque el Word de este trae un
    // pantallazo en vez de una foto de producto.
    fotoPrestadaDe:
      typeof (ficha?.origen as Record<string, unknown> | undefined)?.foto_prestada_de === "string"
        ? ((ficha!.origen as Record<string, unknown>).foto_prestada_de as string)
        : null,
  };
}

/**
 * Precio histórico por producto A ESTA CUENTA (último precio de venta, sea cual
 * sea la oportunidad en la que se cerró): el cotizador avisa si se está
 * regalando margen frente a lo que el cliente ya pagó antes.
 */
async function cargarHistorialPrecios(
  supabase: Awaited<ReturnType<typeof createClient>>,
  cuentaId: string,
): Promise<Record<string, HistorialPrecio>> {
  const historial: Record<string, HistorialPrecio> = {};

  const { data: opsCuenta } = await supabase.from("oportunidades").select("id").eq("cuenta_id", cuentaId);
  const opIds = (opsCuenta ?? []).map((o) => o.id);
  if (opIds.length === 0) return historial;

  const { data: ventas } = await supabase
    .from("ventas")
    .select("fecha_venta, cotizaciones(cotizacion_items(producto_id, precio_unitario))")
    .in("oportunidad_id", opIds)
    // Una venta anulada nunca fue un precio de verdad: no sienta precedente
    // para el cotizador (reunión con gerencia del 28-08, migración 0110).
    .is("anulada_at", null)
    .order("fecha_venta", { ascending: false });

  for (const v of ventas ?? []) {
    const items =
      (v.cotizaciones as unknown as { cotizacion_items: { producto_id: string; precio_unitario: number }[] } | null)
        ?.cotizacion_items ?? [];
    for (const it of items) {
      if (!(it.producto_id in historial)) {
        historial[it.producto_id] = { precio: it.precio_unitario, fecha: v.fecha_venta };
      }
    }
  }
  return historial;
}

/**
 * Los tres finales posibles de la pantalla de cotizar.
 *
 * «cerrada» existe aparte de «no-disponible» porque no es un error: es una
 * cotización que YA se confirmó. Se llega ahí al confirmarla —el refresco que
 * dispara `enviarCotizacion` vuelve a pedir esta ruta— y al abrir el enlace de
 * una vieja. Tratarla como «no disponible» borraba el aviso de éxito y la
 * dejaba sin el PDF, que es justo lo que la comercial iba a buscar.
 */
export type ResultadoCotizador =
  | { estado: "editable"; contexto: ContextoCotizador }
  | { estado: "cerrada"; cotizacionId: string; codigo: string | null; serie: string; version: number }
  /** Modo corrección sin autorización viva: se pidió el código y venció, o se
   *  llegó por el enlace sin pasar por el cuadro que lo pide. */
  | { estado: "sin-autorizacion"; cotizacionId: string; codigo: string | null }
  /** Gerencia la rechazó (0237): queda como histórico con su motivo y no se
   *  edita; el comercial hace una nueva. */
  | { estado: "rechazada"; cotizacionId: string; codigo: string | null; serie: string; items: ItemRechazado[]; decisiones: DecisionGerencia[] }
  | { estado: "no-disponible" };

export interface ItemRechazado {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  precioLista: number | null;
}

export interface DecisionGerencia {
  id: string;
  decididoAt: string;
  decididoPor: string | null;
  resultado: "aprobada_gerencia" | "rechazada_gerencia";
  nota: string | null;
  /** Número de la cotización sobre la que se decidió (null si era borrador). */
  codigo: string | null;
  rechazados: { descripcion: string | null; precio: number | null; lista: number | null }[];
}

/**
 * Las decisiones de gerencia sobre las cotizaciones de una oportunidad, de la
 * más reciente a la más vieja. Es lo que Carlos pidió ver «como histórico»:
 * sus observaciones de criterio quedan aunque el comercial cotice de nuevo.
 */
export async function decisionesDeGerencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filtro: { oportunidadId: string } | { cotizacionId: string },
): Promise<DecisionGerencia[]> {
  let q = supabase
    .from("cotizacion_decisiones")
    .select("id, decidido_at, resultado, nota, rechazados, cotizacion_id, cotizaciones(codigo), perfiles(nombre)")
    .order("decidido_at", { ascending: false })
    .limit(30);
  q = "oportunidadId" in filtro ? q.eq("oportunidad_id", filtro.oportunidadId) : q.eq("cotizacion_id", filtro.cotizacionId);
  const { data } = await q;
  return ((data ?? []) as unknown as {
    id: string; decidido_at: string; resultado: string; nota: string | null;
    rechazados: { descripcion: string | null; precio: number | null; lista: number | null }[] | null;
    cotizaciones: { codigo: string | null } | null; perfiles: { nombre: string } | null;
  }[]).map((d) => ({
    id: d.id,
    decididoAt: d.decidido_at,
    decididoPor: d.perfiles?.nombre ?? null,
    resultado: d.resultado as DecisionGerencia["resultado"],
    nota: d.nota,
    codigo: d.cotizaciones?.codigo ?? null,
    rechazados: Array.isArray(d.rechazados) ? d.rechazados : [],
  }));
}

/**
 * Devuelve «no-disponible» cuando la oportunidad no existe o no es de este
 * comercial (RLS ya la filtra), y cuando el borrador pedido es de otra
 * oportunidad. La base vuelve a comprobar todo al guardar; acá es para no
 * dibujar una pantalla que va a fallar.
 */
/**
 * El tipo de cambio USD→PEN que mantiene gerencia (`parametros.tc_usd_pen`).
 *
 * Lo usa el cotizador cuando el documento se imprime en soles (0169). Si el
 * parámetro no estuviera, se cae al 3.63 que fijó gerencia el 04-09-2026: es
 * preferible imprimir con un cambio conocido que romper la pantalla.
 */
export async function tipoCambioDeGerencia(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<number> {
  const { data } = await supabase.from("parametros").select("valor").eq("clave", "tc_usd_pen").maybeSingle();
  const v = Number(data?.valor ?? 0);
  return v > 0 ? v : 3.63;
}

export async function cargarContextoCotizador(
  oportunidadId: string,
  cotizacionId?: string,
  /**
   * «correccion» entra a una cotización YA EMITIDA para reescribirla
   * conservando su número (migración 0123). Es el mismo cargador porque es la
   * misma pantalla: el catálogo, el stock y el historial de precios se
   * resuelven igual. Lo único que cambia es que un documento cerrado deja de
   * ser el final del camino — siempre que haya una autorización corriendo.
   */
  modo: "borrador" | "correccion" = "borrador",
): Promise<ResultadoCotizador> {
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: productos }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select(
        // leads! desambiguado: desde la 0141 hay dos FK entre estas tablas.
        "id, tipo_postventa, leads!oportunidades_lead_id_fkey(mensaje), cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, es_principal))",
      )
      .eq("id", oportunidadId)
      .maybeSingle(),
    supabase
      .from("productos")
      .select("id, sku, marca, modelo, nombre, capacidad, segmento, ficha, foto_path, precios_producto(tier, precio, vigente_hasta)")
      .eq("activo", true)
      .order("marca"),
  ]);

  // Cuántas hay en el almacén (0117). Va en la misma pantalla porque la
  // pregunta «¿se lo puedo prometer para esta semana?» se hace mientras se
  // arma la cotización, no después; averiguarlo por teléfono es lo que hoy
  // hace que se prometan entregas que no existen.
  const { data: stock } = await supabase.rpc("stock_por_producto");
  const disponiblesPorProducto = new Map<string, number>(
    ((stock ?? []) as { producto_id: string; disponibles: number }[]).map((s) => [s.producto_id, s.disponibles]),
  );

  if (!oportunidad) return { estado: "no-disponible" };

  const cuenta = oportunidad.cuentas as unknown as {
    id: string;
    razon_social: string;
    tipo_doc: TipoDocumento;
    num_doc: string | null;
    direccion: string | null;
    contactos: { nombre: string; cargo: string | null; telefono: string | null; es_principal: boolean }[];
  } | null;
  const lead = oportunidad.leads as unknown as { mensaje: string | null } | null;

  const contactos = cuenta?.contactos ?? [];
  const { data: miembros } = cuenta?.id ? await supabase.rpc("grupo_economico", { p_cuenta_id: cuenta.id }) : { data: [] };
  const grupo: EmpresaDelGrupo[] = ((miembros ?? []) as { id: string; razon_social: string; num_doc: string | null; es_madre: boolean }[]).map((m) => ({
    id: m.id,
    razonSocial: m.razon_social,
    numDoc: m.num_doc,
    esMadre: m.es_madre,
  }));
  const contacto = contactos.find((c) => c.es_principal) ?? contactos[0] ?? null;

  let borrador: BorradorEnEdicion | undefined;
  let correccion: CorreccionAbierta | undefined;
  if (cotizacionId) {
    const { data: cot } = await supabase
      .from("cotizaciones")
      .select(
        "id, codigo, serie, motivo_serie, moneda_impresa, tipo_cambio, version, estado, estado_aprobacion, nota_gerencia, enviada_at, oportunidad_id, condiciones, vigencia_dias, entrega_lugar, tiempo_entrega, garantia, forma_pago, saldo, facturar_a_cuenta_id, cotizacion_items(producto_id, descripcion, cantidad, precio_unitario, precio_con_igv, precio_lista, color, productos(marca, modelo, nombre))",
      )
      .eq("id", cotizacionId)
      .maybeSingle();

    if (!cot || cot.oportunidad_id !== oportunidadId) return { estado: "no-disponible" };
    const emitida = cot.estado !== "borrador" || Boolean(cot.enviada_at);

    if (modo === "correccion") {
      // Corregir un borrador no existe: un borrador se edita y ya. Se manda a
      // la pantalla de siempre en vez de dar un error que no dice nada.
      if (!emitida) return { estado: "no-disponible" };
      const { data: ventana } = await supabase.rpc("correccion_abierta", { p_cotizacion: cot.id });
      const abierta = ventana as { expira_at: string; autorizo: string; motivo: string } | null;
      // La base lo vuelve a comprobar al guardar; acá es para no dibujar una
      // pantalla que va a rebotar.
      if (!abierta) return { estado: "sin-autorizacion", cotizacionId: cot.id, codigo: cot.codigo };
      correccion = { expiraEn: abierta.expira_at, autorizo: abierta.autorizo, motivo: abierta.motivo };
    } else if (cot.estado_aprobacion === "rechazada_gerencia") {
      // LA RECHAZADA NO SE EDITA (Carlos, 15-09; 0237): se muestra cerrada con
      // el motivo de gerencia y la puerta a hacer una nueva.
      const decisiones = await decisionesDeGerencia(supabase, { cotizacionId: cot.id });
      return {
        estado: "rechazada",
        cotizacionId: cot.id,
        codigo: cot.codigo,
        serie: cot.serie,
        decisiones,
        items: (cot.cotizacion_items as unknown as {
          descripcion: string | null; cantidad: number; precio_unitario: number; precio_lista: number | null;
          productos: { marca: string; modelo: string; nombre: string } | null;
        }[]).map((i) => ({
          nombre: i.productos ? `${i.productos.marca} ${i.productos.modelo} — ${i.productos.nombre}` : (i.descripcion ?? "Equipo sin nombre"),
          cantidad: i.cantidad,
          precioUnitario: Number(i.precio_unitario),
          precioLista: i.precio_lista == null ? null : Number(i.precio_lista),
        })),
      };
    } else if (emitida) {
      // Ya salió al cliente: no se edita (migración 0062). No es un error — se
      // muestra cerrada, con su número, su PDF y la puerta a corregirla.
      return {
        estado: "cerrada",
        cotizacionId: cot.id,
        codigo: cot.codigo,
        serie: cot.serie,
        version: cot.version ?? 1,
      };
    }

    borrador = {
      cotizacionId: cot.id,
      codigo: cot.codigo,
      version: cot.version ?? 1,
      serie: cot.serie as "EFAMEINSA" | "OPEN",
      motivoSerie: cot.motivo_serie ?? null,
      facturarA: (cot.facturar_a_cuenta_id as string | null) ?? null,
      // En qué moneda se imprime, y con qué cambio se congeló (0169).
      monedaImpresa: (cot.moneda_impresa as "USD" | "PEN" | null) ?? "USD",
      tipoCambio: cot.tipo_cambio == null ? null : Number(cot.tipo_cambio),
      condiciones: cot.condiciones,
      vigenciaDias: cot.vigencia_dias,
      entregaLugar: cot.entrega_lugar,
      tiempoEntrega: cot.tiempo_entrega,
      garantia: cot.garantia,
      formaPago: cot.forma_pago,
      saldo: cot.saldo,
      estadoAprobacion: cot.estado_aprobacion,
      notaGerencia: cot.nota_gerencia,
      items: (cot.cotizacion_items as unknown as {
        producto_id: string | null;
        descripcion: string | null;
        cantidad: number;
        precio_unitario: number;
        precio_con_igv: number | null;
        precio_lista: number | null;
        color: string | null;
        productos: { marca: string; modelo: string; nombre: string } | null;
      }[]).map((i) => ({
        producto_id: i.producto_id,
        descripcion: i.descripcion,
        nombre: i.productos
          ? `${i.productos.marca} ${i.productos.modelo} — ${i.productos.nombre}`
          : (i.descripcion ?? "Equipo sin nombre"),
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
        precio_con_igv: i.precio_con_igv == null ? null : Number(i.precio_con_igv),
        precioPiso: i.precio_lista != null ? Number(i.precio_lista) : null,
        // Reabrir un borrador tiene que devolver el equipo tal como se eligió,
        // color incluido: si no, el próximo autoguardado lo borraría.
        color: i.color,
      })),
    };
  }

  return {
    estado: "editable",
    contexto: {
      oportunidadId,
      esCasoPostventa: (oportunidad as { tipo_postventa?: string | null } | null)?.tipo_postventa != null,
      cuenta: cuenta
        ? {
            id: cuenta.id,
            grupo,
            razonSocial: cuenta.razon_social,
            tipoDoc: cuenta.tipo_doc,
            numDoc: cuenta.num_doc,
            direccion: cuenta.direccion,
          }
        : null,
      contacto: contacto ? { nombre: contacto.nombre, cargo: contacto.cargo, telefono: contacto.telefono } : null,
      solicitud: lead?.mensaje ?? null,
      productos: (productos ?? []).map((pr) => {
        const base = mapearProducto(pr as unknown as Parameters<typeof mapearProducto>[0]);
        // El almacén manda donde ya está cargado. Donde todavía no, se deja
        // la cifra del maestro en vez de decir «sin stock», que sería peor
        // que no decir nada: haría rechazar ventas por un almacén a medio
        // cargar.
        const enVivo = disponiblesPorProducto.has(pr.id as string);
        return {
          ...base,
          stock: enVivo ? (disponiblesPorProducto.get(pr.id as string) ?? 0) : base.stock,
          stockEnVivo: enVivo,
        };
      }),
      historialPrecios: cuenta?.id ? await cargarHistorialPrecios(supabase, cuenta.id) : {},
      borrador,
      correccion,
    },
  };
}
