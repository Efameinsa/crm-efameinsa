"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { INCLUYE_POR_DEFECTO } from "@/lib/informes";
import { esquemaAdjuntoNuevo, MAX_ADJUNTOS, type AdjuntoCierre, type AdjuntoNuevo } from "@/lib/adjuntos-cierre";

// Informe de cierre de ventas hacia Central (migraciones 0049 y 0050).
//
// La idea de la pantalla es que el comercial toque lo menos posible: el CRM
// llena todo lo que ya sabe del cliente y del presupuesto, y él solo completa
// lo que el sistema no puede adivinar — el reparto del pago, el despacho y las
// observaciones. Por eso el trabajo pesado está acá, en el prellenado, y no en
// el formulario.

export interface ItemInformeEntrada {
  bloque: "venta" | "gratuito";
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface ContactoEntrada {
  area?: string | null;
  nombre?: string | null;
  telefono?: string | null;
  correo?: string | null;
  /** DNI/CE de quien recibe la entrega (migración 0057). */
  documento?: string | null;
  /** Dirección de este contacto/sede (migración 0086). */
  direccion?: string | null;
}

export interface DatosInforme {
  serie: "EFAMEINSA" | "OPEN";
  presupuestoRef: string | null;
  oportunidadId: string | null;
  ventaId: string | null;
  cotizacionId: string | null;
  comprobante: "factura" | "boleta_ruc" | "boleta_dni";
  clienteNuevo: boolean;
  clienteNombre: string;
  clienteDoc: string | null;
  clienteDireccion: string | null;
  clienteCorreo: string | null;
  ordenCompra: string | null;
  contactoVenta: ContactoEntrada;
  contactoContabilidad: ContactoEntrada;
  contactoDespacho: ContactoEntrada;
  modalidadPago: string[];
  formaPago: "transferencia" | "deposito" | null;
  moneda: string;
  notaCondiciones: string | null;
  /** Lo acordado de garantía, impreso en las condiciones de venta (0104). */
  garantia: string | null;
  entregaFecha: string | null;
  entregaHora: string | null;
  entregaLugar: string | null;
  entregaDireccion: string | null;
  notaDespacho: string | null;
  urgente: boolean;
  incluye: string[];
  gratis: string | null;
  notaFinal: string | null;
  items: ItemInformeEntrada[];
}

export interface PresupuestoDisponible {
  id: string;
  codigo: string | null;
  serie: "EFAMEINSA" | "OPEN";
  fecha: string | null;
  monto: number | null;
  items: string[];
  /** De dónde sale: el cotizador del CRM o el archivo de documentos viejos. */
  fuente: "crm" | "archivo";
  /** Solo las del CRM: la garantía que se le cotizó a ESE cliente, para que el
   *  cierre no vuelva a preguntarla ni contradiga el papel que el cliente firmó. */
  garantia?: string | null;
  /** Solo las del CRM: si todavía está en borrador, para decirlo en la lista. */
  estado?: string | null;
  /** Solo las del CRM: los renglones tal como se cotizaron, con cantidad y
   *  precio, así el informe no arranca con todos los precios en cero. */
  lineas?: { descripcion: string; cantidad: number; precio_unitario: number }[];
}

export interface VentaSinInforme {
  id: string;
  oportunidadId: string;
  fecha: string;
  monto: number;
  moneda: string;
  /** Nº del presupuesto histórico del que salió, si lo trae. */
  referencia: string | null;
}

export interface PrellenadoInforme {
  cuenta: {
    id: string;
    razon_social: string;
    num_doc: string | null;
    direccion: string | null;
    esNueva: boolean;
  };
  contactos: ContactoEntrada[];
  presupuestos: PresupuestoDisponible[];
  /** Ventas de este cliente que aún no tienen informe emitido. */
  ventasSinInforme: VentaSinInforme[];
  /** Cuántos campos del documento quedaron resueltos sin preguntar. */
  camposResueltos: number;
  camposTotales: number;
}

const CAMPOS_TOTALES = 26;

// Todo lo que el CRM ya sabe de esta cuenta y que el formulario no tiene por
// qué volver a pedir.
export async function prellenarInforme(cuentaId: string): Promise<{ error: string | null; datos?: PrellenadoInforme }> {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select("id, razon_social, num_doc, direccion")
    .eq("id", cuentaId)
    .maybeSingle();
  if (!cuenta) return { error: "Cliente no encontrado" };

  const [{ data: contactos }, { data: historicas }, { data: delCotizador }, { data: ventas }, { data: informes }] =
    await Promise.all([
    supabase
      .from("contactos")
      .select("nombre, cargo, telefono, email, documento, direccion, es_principal")
      .eq("cuenta_id", cuentaId)
      .order("es_principal", { ascending: false }),
    supabase
      .from("cotizaciones_historicas")
      .select("id, codigo, serie, fecha, monto_sin_igv, items")
      .eq("cuenta_id", cuentaId)
      .order("fecha", { ascending: false })
      .limit(20),
    // ⚠️ LAS COTIZACIONES DEL PROPIO CRM (28-08). Hasta hoy esta pantalla solo
    // miraba el archivo de documentos viejos, y el archivo es todo anterior al
    // cotizador. Brenda cotizó en el CRM con serie OPEN, fue a hacer su cierre
    // de venta, y en la lista solo le salían los EFAMEINSA del archivo: su
    // propia cotización —la de la venta que estaba cerrando— no figuraba en
    // ninguna parte. No era un filtro por serie: era que las del CRM no se
    // consultaban. Van primero en la lista porque son las de ahora.
    supabase
      .from("cotizaciones")
      .select(
        "id, codigo, serie, estado, total, garantia, created_at, enviada_at, oportunidades!inner(cuenta_id), cotizacion_items(cantidad, precio_unitario, descripcion, productos(marca, modelo, nombre))",
      )
      .eq("oportunidades.cuenta_id", cuentaId)
      .order("created_at", { ascending: false })
      .limit(20),
    // "Cliente nuevo" del formato = todavía no nos compró. Se resuelve solo:
    // el comercial no debería tener que acordarse. Y de paso sirven para
    // ofrecerle a cuál venta corresponde este informe.
    supabase
      .from("ventas")
      .select("id, fecha_venta, monto_total, moneda, referencia_historica, origen, oportunidades!inner(id, cuenta_id)")
      .eq("oportunidades.cuenta_id", cuentaId)
      .is("anulada_at", null)
      .order("fecha_venta", { ascending: false }),
    supabase.from("informes_cierre").select("venta_id").eq("cuenta_id", cuentaId).not("venta_id", "is", null),
  ]);

  // Solo las ventas nacidas EN el CRM: las 626 importadas del Excel son
  // anteriores al sistema y nadie va a emitirles un informe a destiempo.
  const yaConInforme = new Set((informes ?? []).map((i) => i.venta_id));
  const ventasSinInforme: VentaSinInforme[] = (ventas ?? [])
    .filter((v) => v.origen === "crm" && !yaConInforme.has(v.id))
    .map((v) => ({
      id: v.id,
      oportunidadId: (v.oportunidades as unknown as { id: string }).id,
      fecha: v.fecha_venta,
      monto: v.monto_total,
      moneda: v.moneda,
      referencia: v.referencia_historica,
    }));

  type ItemCotizado = {
    cantidad: number;
    precio_unitario: number;
    descripcion: string | null;
    productos: { marca: string; modelo: string; nombre: string } | null;
  };
  // El rótulo del equipo es el mismo que usa el cuadro de potenciales.
  const delCrm: PresupuestoDisponible[] = (delCotizador ?? []).map((c) => {
    const lineas = ((c.cotizacion_items as unknown as ItemCotizado[]) ?? []).map((i) => {
      const prod = i.productos;
      return {
        descripcion: prod ? `${prod.nombre} ${prod.marca} ${prod.modelo}` : (i.descripcion ?? "Equipo"),
        cantidad: i.cantidad,
        precio_unitario: Number(i.precio_unitario),
      };
    });
    return {
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as "EFAMEINSA" | "OPEN",
      fecha: (c.enviada_at ?? c.created_at)?.slice(0, 10) ?? null,
      monto: c.total,
      items: lineas.map((l) => l.descripcion),
      fuente: "crm" as const,
      garantia: c.garantia,
      estado: c.estado,
      lineas,
    };
  });

  const delArchivo: PresupuestoDisponible[] = (historicas ?? []).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    serie: c.serie as "EFAMEINSA" | "OPEN",
    fecha: c.fecha,
    monto: c.monto_sin_igv,
    items: c.items ?? [],
    fuente: "archivo" as const,
  }));

  const presupuestos = [...delCrm, ...delArchivo];

  // Se cuentan como resueltos los datos que salen de la cuenta y del contacto
  // principal; el número que ve el comercial arriba de la pantalla.
  const principal = (contactos ?? [])[0];
  // Dirección: la del contacto principal si la tiene; si no, la de la cuenta
  // (migración 0086 — antes era solo cuenta.direccion).
  const direccionCliente = principal?.direccion ?? cuenta.direccion;
  const resueltos =
    3 + // razón social, asunto, cliente nuevo/antiguo
    (cuenta.num_doc ? 1 : 0) +
    (direccionCliente ? 2 : 0) + // dirección del cliente y destino del despacho
    (principal ? 4 : 0) + // nombre, teléfono, correo, correo del cliente
    (presupuestos.length ? 3 : 0) + // Nº de presupuesto, equipos, importes
    INCLUYE_POR_DEFECTO.length +
    1 + // la garantía: heredada de la cotización o la de por defecto (0104)
    1; // fecha

  return {
    error: null,
    datos: {
      cuenta: {
        id: cuenta.id,
        razon_social: cuenta.razon_social,
        num_doc: cuenta.num_doc,
        direccion: direccionCliente,
        esNueva: (ventas ?? []).length === 0,
      },
      contactos: (contactos ?? []).map((c) => ({
        area: c.cargo,
        nombre: c.nombre,
        telefono: c.telefono,
        correo: c.email,
        direccion: c.direccion,
        documento: c.documento,
      })),
      presupuestos,
      ventasSinInforme,
      camposResueltos: Math.min(resueltos, CAMPOS_TOTALES),
      camposTotales: CAMPOS_TOTALES,
    },
  };
}

function aFila(cuentaId: string, d: DatosInforme, creadoPor: string | null) {
  return {
    serie: d.serie,
    cuenta_id: cuentaId,
    oportunidad_id: d.oportunidadId,
    venta_id: d.ventaId,
    cotizacion_id: d.cotizacionId,
    presupuesto_ref: d.presupuestoRef,
    asunto: d.clienteNombre,
    comprobante: d.comprobante,
    cliente_nuevo: d.clienteNuevo,
    cliente_nombre: d.clienteNombre,
    cliente_doc: d.clienteDoc,
    cliente_direccion: d.clienteDireccion,
    cliente_correo: d.clienteCorreo,
    orden_compra: d.ordenCompra,
    contacto_venta: d.contactoVenta,
    contacto_contabilidad: d.contactoContabilidad,
    contacto_despacho: d.contactoDespacho,
    modalidad_pago: d.modalidadPago,
    forma_pago: d.formaPago,
    moneda: d.moneda,
    // El total con IGV, que es lo que se cobra. Se calcula acá y no en el
    // navegador: el importe del documento no puede depender de lo que
    // mandó el cliente.
    monto_total: Number(
      (d.items.filter((i) => i.bloque !== "gratuito").reduce((a, i) => a + i.cantidad * i.precio_unitario, 0) * 1.18).toFixed(2),
    ),
    nota_condiciones: d.notaCondiciones,
    garantia: d.garantia,
    entrega_fecha: d.entregaFecha,
    entrega_hora: d.entregaHora,
    entrega_lugar: d.entregaLugar,
    entrega_direccion: d.entregaDireccion,
    nota_despacho: d.notaDespacho,
    urgente: d.urgente,
    incluye: d.incluye,
    gratis: d.gratis,
    nota_final: d.notaFinal,
    items: d.items,
    creado_por: creadoPor,
  };
}

function validar(d: DatosInforme): string | null {
  if (!d.items.some((i) => i.bloque !== "gratuito")) return "El informe necesita al menos un equipo vendido";
  if (d.items.some((i) => !i.descripcion.trim())) return "Hay un equipo sin descripción";
  if (d.items.some((i) => i.cantidad <= 0)) return "La cantidad de un equipo tiene que ser mayor que cero";
  if (d.modalidadPago.length === 0) return "Marque la modalidad de pago";
  if (!d.entregaLugar?.trim()) return "Falta el lugar de entrega: sin eso logística no puede despachar";
  return null;
}

export async function guardarBorradorInforme(
  cuentaId: string,
  datos: DatosInforme,
  informeId?: string,
): Promise<{ error: string | null; informeId?: string }> {
  const problema = validar(datos);
  if (problema) return { error: problema };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fila = aFila(cuentaId, datos, user?.id ?? null);

  if (informeId) {
    const { error } = await supabase.from("informes_cierre").update(fila).eq("id", informeId);
    if (error) return { error: error.message };
    revalidatePath(`/comercial/cartera/${cuentaId}`);
    return { error: null, informeId };
  }

  const { data, error } = await supabase.from("informes_cierre").insert(fila).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(`/comercial/cartera/${cuentaId}`);
  return { error: null, informeId: data.id };
}

// Acá se gasta el número. Antes de esto el documento es un borrador y el PDF
// sale rotulado como tal.
export async function emitirInforme(informeId: string): Promise<{ error: string | null; codigo?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("emitir_informe", { p_id: informeId });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const { data: informe } = await supabase.from("informes_cierre").select("cuenta_id").eq("id", informeId).maybeSingle();
  if (informe) revalidatePath(`/comercial/cartera/${informe.cuenta_id}`);
  return { error: null, codigo: data as string };
}

export async function borrarBorradorInforme(informeId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("cuenta_id, emitido_at")
    .eq("id", informeId)
    .maybeSingle();
  if (!informe) return { error: "Informe no encontrado" };
  if (informe.emitido_at) return { error: "Un informe emitido no se borra" };

  const { error } = await supabase.from("informes_cierre").delete().eq("id", informeId);
  if (error) return { error: error.message };
  revalidatePath(`/comercial/cartera/${informe.cuenta_id}`);
  // También la lista del comercial: desde el 31-08 el botón de borrar vive ahí
  // (pedido de Brenda), y sin esto la fila borrada seguía en pantalla hasta
  // recargar a mano.
  revalidatePath("/comercial/cierres");
  return { error: null };
}

/**
 * Registra a la persona que va a recibir la entrega cuando no es ninguno de
 * los contactos que ya tiene la cuenta (ítem B4 del plan 11).
 *
 * Darwin, probando el 23-08: «puede recibir la otra persona… debería de haber
 * una opción de poner a otros y registrar ese otros. Y obviamente ese otros,
 * con DNI, con lo que sea, debería irse guardando como un contacto dentro de
 * este negocio». O sea: el dato no puede morir dentro del PDF, porque la
 * próxima entrega a ese mismo cliente lo va a volver a necesitar.
 *
 * Nunca marca es_principal: quien recibe un despacho no desplaza al contacto
 * comercial de la cuenta.
 */
export async function guardarContactoEntrega(datos: {
  cuentaId: string;
  nombre: string;
  documento?: string | null;
  telefono?: string | null;
}): Promise<{ error: string | null }> {
  const nombre = datos.nombre.trim();
  if (!nombre) return { error: "El nombre de quien recibe no puede ir vacío" };

  const supabase = await createClient();

  // Si ya existe con ese nombre, se completan los huecos en vez de duplicarlo:
  // la cartera ya arrastra bastantes duplicados del histórico.
  const { data: existente } = await supabase
    .from("contactos")
    .select("id, documento, telefono")
    .eq("cuenta_id", datos.cuentaId)
    .ilike("nombre", nombre)
    .maybeSingle();

  if (existente) {
    const parche: Record<string, string> = {};
    if (!existente.documento && datos.documento?.trim()) parche.documento = datos.documento.trim();
    if (!existente.telefono && datos.telefono?.trim()) parche.telefono = datos.telefono.trim();
    if (Object.keys(parche).length) {
      const { error } = await supabase.from("contactos").update(parche).eq("id", existente.id);
      if (error) return { error: error.message };
    }
    revalidatePath(`/comercial/cartera/${datos.cuentaId}`);
    return { error: null };
  }

  const { error } = await supabase.from("contactos").insert({
    cuenta_id: datos.cuentaId,
    nombre,
    cargo: "Recepción de despacho",
    documento: datos.documento?.trim() || null,
    telefono: datos.telefono?.trim() || null,
    es_principal: false,
  });
  if (error) return { error: error.message };

  revalidatePath(`/comercial/cartera/${datos.cuentaId}`);
  return { error: null };
}

// ── Expediente del cierre: orden de compra, voucher, acuerdos ───────────────
//
// Brenda (C1), 28-08: «quiero una opción para poder adjuntar documentos, como
// fotos o PDFs de vouchers». Los archivos los sube el navegador directo al
// bucket privado 'adjuntos' (mismo camino que los adjuntos de gestión, 0029);
// acá solo se guardan los metadatos, y con ellos quién los subió y cuándo —
// que es lo que después permite responderle a Central "esto lo mandó C1 el
// jueves" sin abrir un chat.
//
// SIEMPRE AGREGA, nunca reemplaza la lista: dos personas pueden estar
// adjuntando al mismo expediente (la comercial manda la OC, Central pega el
// voucher) y un update ciego borraría lo del otro.
export async function agregarAdjuntosInforme(
  informeId: string,
  nuevos: AdjuntoNuevo[],
): Promise<{ error: string | null; adjuntos?: AdjuntoCierre[] }> {
  const revisados = z.array(esquemaAdjuntoNuevo).min(1).max(MAX_ADJUNTOS).safeParse(nuevos);
  if (!revisados.success) return { error: "El documento no tiene un formato válido" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("cuenta_id, adjuntos")
    .eq("id", informeId)
    .maybeSingle();
  if (!informe) return { error: "Informe no encontrado" };

  const previos = (informe.adjuntos ?? []) as AdjuntoCierre[];
  // Reintentar una subida que falló a medias no puede duplicar la fila.
  const yaEstan = new Set(previos.map((a) => a.path));
  const agregados: AdjuntoCierre[] = revisados.data
    .filter((a) => !yaEstan.has(a.path))
    .map((a) => ({ ...a, subido_por: user?.id ?? null, subido_at: new Date().toISOString() }));
  if (agregados.length === 0) return { error: null, adjuntos: previos };

  if (previos.length + agregados.length > MAX_ADJUNTOS) {
    return { error: `El expediente admite hasta ${MAX_ADJUNTOS} documentos` };
  }

  const adjuntos = [...previos, ...agregados];
  const { error } = await supabase.from("informes_cierre").update({ adjuntos }).eq("id", informeId);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath(`/comercial/cartera/${informe.cuenta_id}`);
  revalidatePath("/central/cierres");
  return { error: null, adjuntos };
}

/**
 * Quitar solo se puede mientras el informe es borrador: después de emitido, el
 * expediente es append-only y la base lo vuelve a exigir (migración 0099).
 *
 * El archivo se queda en Storage a propósito: el bucket no tiene política de
 * borrado (0029) y un adjunto sin metadatos es inofensivo, mientras que
 * borrarlo de verdad sería irreversible desde un botón de la UI.
 */
export async function quitarAdjuntoInforme(
  informeId: string,
  path: string,
): Promise<{ error: string | null; adjuntos?: AdjuntoCierre[] }> {
  const supabase = await createClient();
  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("cuenta_id, adjuntos, emitido_at, codigo")
    .eq("id", informeId)
    .maybeSingle();
  if (!informe) return { error: "Informe no encontrado" };
  if (informe.emitido_at) {
    return { error: `El informe Nº ${informe.codigo} ya se emitió: sus documentos ya no se quitan` };
  }

  const adjuntos = ((informe.adjuntos ?? []) as AdjuntoCierre[]).filter((a) => a.path !== path);
  const { error } = await supabase.from("informes_cierre").update({ adjuntos }).eq("id", informeId);
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  revalidatePath(`/comercial/cartera/${informe.cuenta_id}`);
  revalidatePath("/central/cierres");
  return { error: null, adjuntos };
}

// ------------------------------------------------------------
// ANULAR UN CIERRE (reunión con gerencia del 28-08).
//
// «No, eliminar le diría que no, mejor anular nada más, que quede ahí.» El
// documento no se borra: se queda con su número y su historia y deja de contar.
// Lo ejecuta Central o gerencia —nunca quien lo emitió— con el código de dos
// minutos del supervisor. Toda la regla vive en la migración 0110; acá solo se
// pasa el pedido y se refrescan las pantallas que cambian.

export interface CierreEnJuego {
  codigo: string;
  cliente: string;
  monto: number;
  moneda: string;
  anulado: boolean;
  tieneVenta: boolean;
  pedidoErp: string | null;
  ejecutado: boolean;
  enPostventa: boolean;
}

/** Qué se lleva por delante esta anulación. Se mira ANTES de pedir el código. */
export async function cierreEnJuego(informeId: string): Promise<CierreEnJuego | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("cierre_en_juego", { p_informe: informeId });
  const f = (data as unknown as Record<string, unknown>[] | null)?.[0];
  if (!f) return null;
  return {
    codigo: String(f.codigo ?? ""),
    cliente: String(f.cliente ?? ""),
    monto: Number(f.monto ?? 0),
    moneda: String(f.moneda ?? "USD"),
    anulado: Boolean(f.anulado),
    tieneVenta: Boolean(f.tiene_venta),
    pedidoErp: (f.pedido_erp as string | null) ?? null,
    ejecutado: Boolean(f.ejecutado),
    enPostventa: Boolean(f.en_postventa),
  };
}

export async function anularCierre(
  informeId: string,
  motivo: string,
  pin: string,
): Promise<{ error: string | null; codigo?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("anular_cierre", {
    p_informe: informeId,
    p_motivo: motivo,
    p_pin: pin,
  });
  if (error) return { error: error.message.replace(/^.*?:\s*/, "") };

  const resultado = (data ?? {}) as { codigo?: string };
  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("cuenta_id")
    .eq("id", informeId)
    .maybeSingle();
  revalidatePath("/central/cierres");
  revalidatePath("/gerencia/cierres");
  if (informe) revalidatePath(`/comercial/cartera/${informe.cuenta_id}`);
  return { error: null, codigo: resultado.codigo };
}
