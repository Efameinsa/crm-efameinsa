"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen, notificarFinanzas } from "@/lib/notificaciones";
import { createAdminClient } from "@/lib/supabase/admin";
import { enlaceCierreDelPedido } from "@/lib/enlace-cierre-central";

// EL CIERRE SE CONVIERTE EN PEDIDO (0290, reunión de Santos con Carlos, 23-09
// 14:58). Los pasos de Central antes de los dos checks: preparar el pedido con
// su lista de equipos, pedirle las series al almacén y generar el pedido con
// su número del CRM (0295: el paso del ERP se retiró).
// Todo reusa liberar_pedido_postventa sin marcar ningún check, que crea el
// pedido y siembra los equipos sin avisar a nadie.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");
const sinRuc = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "");

function revalidar(servicioId?: string | null) {
  revalidatePath("/central/cierres");
  revalidatePath("/almacen");
  revalidatePath("/almacen/pedidos");
  revalidatePath("/finanzas");
  if (servicioId) {
    revalidatePath(`/almacen/pedidos/${servicioId}`);
    revalidatePath(`/pedidos/${servicioId}/imprimir`);
  }
}

/** Crea el pedido y su lista de equipos, sin marcar nada. Idempotente. */
async function preparar(informeId: string, numero?: string | null) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("liberar_pedido_postventa", {
    p_informe_id: informeId,
    p_numero_pedido: numero?.trim() || null,
    p_marcar_pedido: false,
    p_marcar_liquidacion: false,
    p_pin: null,
  });
  return { supabase, servicioId: (data as string | null) ?? null, error: error ? limpiar(error.message) : null };
}

/** «Las escribo yo»: Central prepara la lista para poner las series ella misma. */
export async function prepararPedido(informeId: string) {
  await requerirPerfil();
  const { servicioId, error } = await preparar(informeId);
  if (error) return { error, servicioId: null };
  revalidar(servicioId);
  return { error: null, servicioId };
}

/** Lo que Central dice de los accesorios al pedir el código (0510; Lesly, 16-10). */
export type AccesoriosPedido = { incluye: boolean | null; detalle: string };

function validarAccesorios(a: AccesoriosPedido | null | undefined): string | null {
  if (!a || a.incluye === null) return "Antes de pedir el código, diga si los equipos incluyen accesorios";
  if (a.incluye && a.detalle.trim().length < 3) return "Escriba qué accesorios van y con qué máquina";
  return null;
}

const textoAccesorios = (a: AccesoriosPedido) => (a.incluye ? `Incluye accesorios: ${a.detalle.trim()}.` : "Sin accesorios.");

/** «Pedir series al almacén»: le llega el aviso y el pedido entra a su cola. */
export async function pedirSeriesAlAlmacen(informeId: string, accesorios: AccesoriosPedido) {
  const perfil = await requerirPerfil();
  const falta = validarAccesorios(accesorios);
  if (falta) return { error: falta, faltan: 0 };
  const { supabase, servicioId, error } = await preparar(informeId);
  if (error || !servicioId) return { error: error ?? "No se pudo preparar el pedido", faltan: 0 };
  const { error: e1 } = await supabase.rpc("indicar_accesorios_del_pedido", {
    p_servicio: servicioId,
    p_incluye: accesorios.incluye,
    p_detalle: accesorios.detalle,
  });
  if (e1) return { error: limpiar(e1.message), faltan: 0 };
  const { data: faltan, error: e2 } = await supabase.rpc("pedir_series_al_almacen", { p_servicio: servicioId });
  if (e2) return { error: limpiar(e2.message), faltan: 0 };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto").eq("id", servicioId).maybeSingle();
  await notificarAlmacen({
    titulo: `Generación de código · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `Central pide la serie de ${faltan} equipo${faltan === 1 ? "" : "s"}. Escríbalas como se leen en la placa: quedan fijas. ${textoAccesorios(accesorios)}`,
    url: `/almacen/pedidos/${servicioId}`,
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  return { error: null, faltan: faltan as number };
}

/**
 * Central corrige o completa los accesorios de un pedido ya creado (0510).
 * Si el almacén ya tenía la solicitud, le avisa del cambio.
 */
export async function indicarAccesorios(servicioId: string, accesorios: AccesoriosPedido) {
  const perfil = await requerirPerfil();
  const falta = validarAccesorios(accesorios);
  if (falta) return { error: falta };
  const supabase = await createClient();
  const { error } = await supabase.rpc("indicar_accesorios_del_pedido", {
    p_servicio: servicioId,
    p_incluye: accesorios.incluye,
    p_detalle: accesorios.detalle,
  });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, series_pedidas_at").eq("id", servicioId).maybeSingle();
  if (s?.series_pedidas_at) {
    await notificarAlmacen({
      titulo: `Accesorios del pedido · ${sinRuc(s.cliente_texto)}`,
      cuerpo: `Central corrigió los accesorios. ${textoAccesorios(accesorios)}`,
      url: `/almacen/pedidos/${servicioId}`,
      esPrueba: perfil.es_prueba === true,
    });
  }
  revalidar(servicioId);
  return { error: null };
}

/**
 * Central genera el pedido y el CRM le pone el número (0295). Carlos, 23-09
 * 17:24: «en el ERP ya no lo haría… este segundo paso se retira». Con el
 * número ya se puede imprimir el pedido, que va como anexo del cierre.
 */
export async function generarPedido(informeId: string) {
  await requerirPerfil();
  const { supabase, servicioId, error } = await preparar(informeId);
  if (error || !servicioId) return { error: error ?? "No se pudo preparar el pedido", servicioId: null, numero: null };
  const { data: numero, error: e2 } = await supabase.rpc("generar_pedido", { p_servicio: servicioId });
  if (e2) return { error: limpiar(e2.message), servicioId, numero: null };
  revalidar(servicioId);
  return { error: null, servicioId, numero: numero as string };
}

/**
 * Central rechaza la liquidación y vuelve a Finanzas con el motivo (0295).
 * Carlos: «en liquidación de Finanzas es acepto y rechazo… si pasa a la
 * Central el pedido todo mal, todo el camino está mal».
 */
export async function rechazarLiquidacion(servicioId: string, motivo: string) {
  const perfil = await requerirPerfil();
  if (motivo.trim().length < 5) return { error: "Diga qué está mal en la liquidación" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("central_rechazar_liquidacion", { p_servicio: servicioId, p_motivo: motivo.trim() });
  if (error) return { error: limpiar(error.message) };
  const { data: s } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp").eq("id", servicioId).maybeSingle();
  await notificarFinanzas({
    titulo: `Liquidación rechazada · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `Central la devolvió${s?.numero_pedido_erp ? ` (pedido ${s.numero_pedido_erp})` : ""}: ${motivo.trim()}. Corríjala y súbala de nuevo.`,
    url: "/finanzas/liquidar",
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  revalidatePath("/finanzas/liquidar");
  return { error: null };
}

/**
 * LA SIRENA A FINANZAS (0298). Central, 24-09: «a veces hay pedidos urgentes
 * porque el cliente requiere factura o quieren despachar; necesito mandar
 * una alerta a Finanzas para que se apure, así tal cual con Comercial».
 *
 * Es el mismo canal de la urgencia al comercial (0082): a Finanzas le llega
 * en vivo una ventanita que no se cierra sola, con campanada y push que se
 * queda en el celular; el pedido sube al primer lugar de «Pagos por
 * confirmar» con la razón a la vista. Del segundo aviso por el mismo pedido
 * en adelante, gerencia también se entera.
 */
export async function enviarUrgenciaFinanzas(servicioId: string, mensaje: string): Promise<{ error: string | null; avisoNumero?: number }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enviar_urgencia_finanzas", { p_servicio: servicioId, p_mensaje: mensaje.trim() || null });
  if (error) return { error: limpiar(error.message) };
  const r = data as { servicio_id: string; cliente: string; numero_pedido: string | null; es_prueba: boolean; aviso_numero: number };

  const detalle = mensaje.trim() || "Central pide confirmar este pago de inmediato.";
  const pedido = r.numero_pedido ? ` (pedido ${r.numero_pedido})` : "";
  await notificarFinanzas({
    tipo: "urgencia_finanzas",
    titulo: `${r.cliente}${pedido} está esperando a Finanzas`,
    cuerpo: detalle,
    url: `/finanzas/pedidos/${r.servicio_id}`,
    esPrueba: r.es_prueba,
  });

  // Igual que con el comercial: si hizo falta avisar dos veces, ya no es un
  // olvido y gerencia lo ve. Lo de práctica no le llega a gerencia real.
  if (r.aviso_numero >= 2 && !r.es_prueba) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${r.cliente}${pedido} sigue esperando a Finanzas`,
      cuerpo: `Central ya le mandó ${r.aviso_numero} avisos de urgencia a Finanzas por este pedido. ${detalle}`,
      url: `/finanzas/pedidos/${r.servicio_id}`,
    });
  }

  revalidar(servicioId);
  revalidatePath("/central/pedidos");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  return { error: null, avisoNumero: r.aviso_numero };
}

/**
 * APURAR DESDE EL CIERRE (0358). Central, 30-09: «botón de alerta con alarma,
 * notificación y todo, para apresurar a almacén y a liquidaciones Finanzas».
 * La sirena de la 0298 solo existía con el pedido liberado; esta va en los
 * pasos 1 (series) y 3 (liquidación) de la tarjeta del cierre. La base valida
 * que haya algo que apurar y deja uno cada 10 minutos por área; del segundo
 * apuro en adelante gerencia también se entera.
 */
export async function apurarDesdeCentral(servicioId: string, area: "almacen" | "finanzas"): Promise<{ error: string | null; avisoNumero?: number }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apurar_desde_central", { p_servicio: servicioId, p_area: area, p_mensaje: null });
  if (error) return { error: limpiar(error.message) };
  const r = data as { servicio_id: string; cliente: string; numero_pedido: string | null; es_prueba: boolean; faltan: number; aviso_numero: number };
  const pedido = r.numero_pedido ? ` (pedido ${r.numero_pedido})` : "";
  const vez = r.aviso_numero > 1 ? ` Es el aviso n.º ${r.aviso_numero}.` : "";

  let titulo: string;
  let cuerpo: string;
  let url: string;
  if (area === "almacen") {
    titulo = `${r.cliente}${pedido}: Central espera las series`;
    cuerpo = `Faltan ${r.faltan} serie${r.faltan === 1 ? "" : "s"}. Escríbalas como se leen en la placa.${vez}`;
    url = `/almacen/pedidos/${r.servicio_id}`;
    await notificarAlmacen({ tipo: "urgencia_almacen", titulo, cuerpo, url, esPrueba: r.es_prueba });
  } else {
    titulo = `${r.cliente}${pedido}: Central espera la liquidación`;
    cuerpo = `Súbala en «Liquidar» para que Central pueda ejecutar el pedido.${vez}`;
    url = "/finanzas/liquidar";
    await notificarFinanzas({ tipo: "urgencia_finanzas", titulo, cuerpo, url, esPrueba: r.es_prueba });
  }

  // Si hizo falta apurar dos veces, ya no es un olvido y gerencia lo ve (0298).
  if (r.aviso_numero >= 2 && !r.es_prueba) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${r.cliente}${pedido} sigue esperando ${area === "almacen" ? "al almacén (series)" : "a Finanzas (liquidación)"}`,
      cuerpo: `Central ya apuró ${r.aviso_numero} veces.`,
      url,
    });
  }

  revalidar(servicioId);
  revalidatePath("/finanzas/liquidar");
  return { error: null, avisoNumero: r.aviso_numero };
}

/** Corregir una serie ya puesta: con el código de operaciones y el motivo (0290). */
export async function corregirSerie(itemId: string, servicioId: string, serie: string, pin: string, motivo: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { data: antes } = await supabase.from("pedido_equipos").select("serie, parte_nombre").eq("id", itemId).maybeSingle();
  const { error } = await supabase.rpc("corregir_serie_del_equipo", { p_item: itemId, p_serie: serie, p_pin: pin, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  const nueva = serie.trim().toUpperCase();
  await avisarCambioDeSerie(
    servicioId,
    "Serie corregida",
    `${antes?.parte_nombre ? `${antes.parte_nombre}: ` : ""}${antes?.serie ?? "—"} → ${nueva}. Motivo: ${motivo.trim()}.`,
  );
  revalidar(servicioId);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  return { error: null };
}

/**
 * QUITAR LA SERIE DE LA SECADORA DE LA TORRE TAMBIÉN PIDE CÓDIGO (0579; buzón
 * Lesly 21-10: «debe pedir PIN… y una vez modificado debe notificar»). Antes
 * se quitaba con un clic y se ponía otra sin rastro.
 */
export async function quitarSerieDeParte(itemId: string, servicioId: string, pin: string, motivo: string) {
  await requerirPerfil();
  const supabase = await createClient();
  const { data: antes } = await supabase.from("pedido_equipos").select("serie, parte_nombre").eq("id", itemId).maybeSingle();
  const { error } = await supabase.rpc("quitar_parte_del_equipo", { p_item: itemId, p_pin: pin, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  await avisarCambioDeSerie(servicioId, "Serie quitada", `${antes?.parte_nombre ?? "Otra máquina"}: se quitó la serie ${antes?.serie ?? "—"}. Motivo: ${motivo.trim()}.`);
  revalidar(servicioId);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/postventa/equipos");
  return { error: null };
}

/**
 * Un cambio de serie ya dada se avisa (Lesly 21-10): a Central, que pidió las
 * series y genera el pedido con ellas; a postventa y al almacén/operaciones.
 * No le llega a quien hizo el cambio.
 */
async function avisarCambioDeSerie(servicioId: string, que: string, detalle: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: srv } = await supabase.from("servicios_postventa").select("cliente_texto, es_prueba").eq("id", servicioId).maybeSingle();
  const titulo = `${que} · ${sinRuc(srv?.cliente_texto) || "pedido"}`;
  const cuerpo = `${detalle} Lo hizo ${perfil.nombre ?? "—"}.`;
  const enlaceCentral = await enlaceCierreDelPedido(supabase, servicioId);
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfiles")
    .select("id, rol, es_postventa, solo_preventivo, es_almacen, es_operaciones")
    .eq("activo", true)
    .eq("es_prueba", srv?.es_prueba === true)
    .is("espejo_de", null)
    .or("rol.eq.central,es_postventa.eq.true,es_almacen.eq.true,es_operaciones.eq.true");
  await Promise.all(
    (data ?? [])
      .filter((p) => p.id !== perfil.id && !(p.rol !== "central" && p.es_postventa && p.solo_preventivo && !p.es_almacen && !p.es_operaciones))
      .map((p) =>
        notificar({
          userId: p.id,
          tipo: "almacen",
          titulo,
          cuerpo,
          url: p.rol === "central" ? enlaceCentral : p.es_almacen || p.es_operaciones ? `/almacen/pedidos/${servicioId}` : `/postventa/pedidos/${servicioId}`,
        }),
      ),
  );
}


/**
 * CENTRAL EDITA LA LISTA «EQUIPOS Y SERIES» (0572; Santos 21-10, PED-0037-2026
 * de FAMILY FARMS: «no jaló el detalle del trabajo, equipos y series… dale para
 * que edite»). Un mantenimiento no siembra filas (0404); aquí se traen las
 * líneas del cierre, se agrega, se corrige el texto o se quita una línea, hasta
 * que el pedido salga. Cada cambio queda en las observaciones del pedido.
 */
function revalidarLista(servicioId: string) {
  revalidar(servicioId);
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath("/central/pedidos");
}

export async function traerLineasDelCierre(servicioId: string): Promise<{ error: string | null; traidas?: number }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("traer_lineas_del_cierre", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  revalidarLista(servicioId);
  return { error: null, traidas: Number(data ?? 0) };
}

export async function agregarLineaAlPedido(servicioId: string, descripcion: string, serie: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  if (!descripcion.trim()) return { error: "Escriba qué equipo o trabajo es" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("agregar_linea_al_pedido", { p_servicio: servicioId, p_descripcion: descripcion.trim(), p_serie: serie.trim() || null });
  if (error) return { error: limpiar(error.message) };
  revalidarLista(servicioId);
  return { error: null };
}

export async function editarLineaDelPedido(itemId: string, servicioId: string, descripcion: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  if (!descripcion.trim()) return { error: "Escriba qué equipo o trabajo es" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("editar_linea_del_pedido", { p_item: itemId, p_descripcion: descripcion.trim() });
  if (error) return { error: limpiar(error.message) };
  revalidarLista(servicioId);
  return { error: null };
}

export async function quitarLineaDelPedido(itemId: string, servicioId: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("quitar_linea_del_pedido", { p_item: itemId });
  if (error) return { error: limpiar(error.message) };
  revalidarLista(servicioId);
  return { error: null };
}

/**
 * EL PEDIDO DE SERVICIO NO PASA POR EL ALMACÉN (0574; Santos 21-10): «en
 * servicio no se pide código, es solo escrito, entonces no tiene que enterarse
 * almacén». Central dice «es un servicio»: el pedido nace (sin avisar a nadie)
 * como mantenimiento y se trae el detalle del cierre o de la cotización.
 */
export async function armarPedidoDeServicio(informeId: string): Promise<{ error: string | null }> {
  await requerirPerfil();
  const { supabase, servicioId, error } = await preparar(informeId);
  if (error || !servicioId) return { error: error ?? "No se pudo crear el pedido" };
  const { error: e1 } = await supabase.rpc("pasar_pedido_a_servicio", { p_servicio: servicioId, p_tipo: "mantenimiento" });
  if (e1) return { error: limpiar(e1.message) };
  // Si no hay líneas que traer, la tabla queda vacía para escribirlas a mano.
  if (!(await supabase.from("pedido_equipos").select("id", { count: "exact", head: true }).eq("servicio_id", servicioId)).count) {
    await supabase.rpc("traer_lineas_del_cierre", { p_servicio: servicioId });
  }
  revalidarLista(servicioId);
  return { error: null };
}

export type FilaDelServicio = { id?: string | null; descripcion: string; cantidad: number; serie: string; precio: number | null };

/** La tabla entera del detalle del servicio, como la dejó Central (0574). */
export async function guardarDetalleDelServicio(servicioId: string, filas: FilaDelServicio[]): Promise<{ error: string | null }> {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_detalle_del_servicio", {
    p_servicio: servicioId,
    p_filas: filas.map((f) => ({ id: f.id ?? null, descripcion: f.descripcion.trim(), cantidad: f.cantidad, serie: f.serie.trim(), precio: f.precio })),
  });
  if (error) return { error: limpiar(error.message) };
  revalidarLista(servicioId);
  return { error: null };
}
