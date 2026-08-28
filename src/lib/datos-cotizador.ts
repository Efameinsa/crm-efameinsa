import { createClient } from "@/lib/supabase/server";
import { contenidoDeFicha } from "@/lib/ficha-tecnica";
import type { TipoDocumento } from "@/lib/documento";
import type { BorradorEnEdicion, HistorialPrecio, ProductoCotizable } from "@/components/crm/tipos-cotizador";

/**
 * Todo lo que la PANTALLA del cotizador necesita, en un solo viaje.
 *
 * Vivía dentro de `oportunidades/[id]/page.tsx`, que cargaba los 95 equipos con
 * su ficha completa —172 KB— aunque el comercial solo entrara a leer el
 * historial del cliente. Desde que cotizar es una pantalla propia (27-08), el
 * catálogo viaja únicamente cuando de verdad se va a cotizar.
 */

export interface ContextoCotizador {
  oportunidadId: string;
  cuenta: {
    razonSocial: string;
    tipoDoc: TipoDocumento;
    numDoc: string | null;
    direccion: string | null;
  } | null;
  /** El contacto principal, para tenerlo a mano mientras se cotiza. */
  contacto: { nombre: string; cargo: string | null; telefono: string | null } | null;
  /** Lo que pidió el prospecto: se cotiza contra esto, conviene releerlo. */
  solicitud: string | null;
  productos: ProductoCotizable[];
  historialPrecios: Record<string, HistorialPrecio>;
  /** El borrador que se está corrigiendo, si se entró a uno. */
  borrador?: BorradorEnEdicion;
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
  | { estado: "cerrada"; cotizacionId: string; codigo: string | null; serie: string }
  | { estado: "no-disponible" };

/**
 * Devuelve «no-disponible» cuando la oportunidad no existe o no es de este
 * comercial (RLS ya la filtra), y cuando el borrador pedido es de otra
 * oportunidad. La base vuelve a comprobar todo al guardar; acá es para no
 * dibujar una pantalla que va a fallar.
 */
export async function cargarContextoCotizador(
  oportunidadId: string,
  cotizacionId?: string,
): Promise<ResultadoCotizador> {
  const supabase = await createClient();

  const [{ data: oportunidad }, { data: productos }] = await Promise.all([
    supabase
      .from("oportunidades")
      .select(
        "id, leads(mensaje), cuentas(id, razon_social, tipo_doc, num_doc, direccion, contactos(nombre, cargo, telefono, es_principal))",
      )
      .eq("id", oportunidadId)
      .maybeSingle(),
    supabase
      .from("productos")
      .select("id, sku, marca, modelo, nombre, capacidad, segmento, ficha, foto_path, precios_producto(tier, precio, vigente_hasta)")
      .eq("activo", true)
      .order("marca"),
  ]);

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
  const contacto = contactos.find((c) => c.es_principal) ?? contactos[0] ?? null;

  let borrador: BorradorEnEdicion | undefined;
  if (cotizacionId) {
    const { data: cot } = await supabase
      .from("cotizaciones")
      .select(
        "id, codigo, serie, estado, estado_aprobacion, nota_gerencia, enviada_at, oportunidad_id, condiciones, vigencia_dias, entrega_lugar, tiempo_entrega, garantia, forma_pago, saldo, cotizacion_items(producto_id, descripcion, cantidad, precio_unitario, precio_lista, color, productos(marca, modelo, nombre))",
      )
      .eq("id", cotizacionId)
      .maybeSingle();

    if (!cot || cot.oportunidad_id !== oportunidadId) return { estado: "no-disponible" };

    // Ya salió al cliente: no se edita, se duplica (migración 0062). No es un
    // error — se muestra cerrada, con su número y su PDF.
    if (cot.estado !== "borrador" || cot.enviada_at) {
      return { estado: "cerrada", cotizacionId: cot.id, codigo: cot.codigo, serie: cot.serie };
    }

    borrador = {
      cotizacionId: cot.id,
      codigo: cot.codigo,
      serie: cot.serie as "EFAMEINSA" | "OPEN",
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
      cuenta: cuenta
        ? {
            razonSocial: cuenta.razon_social,
            tipoDoc: cuenta.tipo_doc,
            numDoc: cuenta.num_doc,
            direccion: cuenta.direccion,
          }
        : null,
      contacto: contacto ? { nombre: contacto.nombre, cargo: contacto.cargo, telefono: contacto.telefono } : null,
      solicitud: lead?.mensaje ?? null,
      productos: (productos ?? []).map((pr) =>
        mapearProducto(pr as unknown as Parameters<typeof mapearProducto>[0]),
      ),
      historialPrecios: cuenta?.id ? await cargarHistorialPrecios(supabase, cuenta.id) : {},
      borrador,
    },
  };
}
