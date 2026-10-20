"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarCentral, notificarFacturacion, notificarFinanzas } from "@/lib/notificaciones";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EstadoPagoLiquidacion } from "@/lib/documentos-finanzas";
import { enlaceCierreDelPedido } from "@/lib/enlace-cierre-central";

// LIQUIDACIONES QUE SE ACTUALIZAN Y LA FACTURA (0306, reunión 25-09 11:44).
// Finanzas sube una liquidación por movimiento (pago a cuenta, saldo, la
// factura que llegó después); Facturación revisa el expediente, factura y
// registra la factura, o lo observa si no está alineado. Central recibe el
// aviso para imprimir y armar el expediente físico.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");
const sinRuc = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "");

function revalidar(servicioId: string) {
  revalidatePath(`/postventa/pedidos/${servicioId}`);
  revalidatePath(`/nuevo/pedido/${servicioId}`);
  revalidatePath("/facturacion");
  revalidatePath("/facturacion/facturados");
  revalidatePath("/finanzas/liquidar");
  revalidatePath(`/finanzas/pedidos/${servicioId}`);
  revalidatePath("/central/cierres");
}

async function datosDelPedido(servicioId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("servicios_postventa").select("cliente_texto, numero_pedido_erp, liquidacion_at").eq("id", servicioId).maybeSingle();
  return data as { cliente_texto: string | null; numero_pedido_erp: string | null; liquidacion_at: string | null } | null;
}

/** Finanzas sube una liquidación: la primera o una actualización. */
export async function registrarLiquidacion(datos: {
  servicioId: string;
  path: string;
  nombre: string;
  estadoPago: Exclude<EstadoPagoLiquidacion, "sin_dato">;
  factura: string | null;
  nota: string | null;
}) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const antes = await datosDelPedido(datos.servicioId);
  // Si el pedido ya tiene factura, esta liquidación con «factura pendiente» es
  // otro anticipo (Jhon 14-10, PRODECO): Facturación tiene que saberlo.
  const { data: yaFacturadas } = await supabase.from("facturas_pedido").select("numero").eq("servicio_id", datos.servicioId);
  const numeros = ((yaFacturadas ?? []) as { numero: string }[]).map((f) => f.numero);
  const { error } = await supabase.rpc("finanzas_registrar_liquidacion", {
    p_servicio: datos.servicioId,
    p_path: datos.path,
    p_nombre: datos.nombre,
    p_estado_pago: datos.estadoPago,
    p_factura: datos.factura,
    p_nota: datos.nota,
  });
  if (error) return { error: limpiar(error.message) };
  const quien = sinRuc(antes?.cliente_texto);
  const pedido = antes?.numero_pedido_erp ? ` del pedido ${antes.numero_pedido_erp}` : "";
  const esPrueba = perfil.es_prueba === true;
  const alPedido = await enlaceCierreDelPedido(supabase, datos.servicioId);
  await Promise.all([
    notificarCentral({
      titulo: antes?.liquidacion_at ? `Liquidación actualizada · ${quien}` : `Liquidación lista · ${quien}`,
      cuerpo: antes?.liquidacion_at
        ? `Finanzas subió una liquidación nueva${pedido}. Imprímala para el expediente.`
        : `Finanzas subió la liquidación${pedido}. Revísela: acéptela o recházela con el motivo.`,
      url: alPedido,
      esPrueba,
    }),
    // Si todavía no hay número de factura, el pedido espera a Facturación.
    !datos.factura
      ? notificarFacturacion({
          titulo: numeros.length ? `Nuevo anticipo por facturar · ${quien}` : `Por facturar · ${quien}`,
          cuerpo: numeros.length
            ? `Entró otro pago a cuenta${pedido}: ya tiene ${numeros.length === 1 ? "la factura" : "las facturas"} ${numeros.join(", ")} y Finanzas subió una liquidación nueva con factura pendiente${datos.nota?.trim() ? ` («${datos.nota.trim()}»)` : ""}. Facture este anticipo.`
            : `Finanzas subió la liquidación${pedido} con factura pendiente. Revise el expediente y facture.`,
          url: "/facturacion",
          esPrueba,
        })
      : Promise.resolve(),
  ]);
  revalidar(datos.servicioId);
  return { error: null };
}

/** Facturación registra la factura emitida (número, fecha y, si lo hay, el PDF). */
export async function registrarFactura(datos: {
  servicioId: string;
  numero: string;
  fecha: string;
  path: string | null;
  nombre: string | null;
  nota: string | null;
}) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("facturacion_registrar_factura", {
    p_servicio: datos.servicioId,
    p_numero: datos.numero,
    p_fecha: datos.fecha,
    p_path: datos.path,
    p_nombre: datos.nombre,
    p_nota: datos.nota,
  });
  if (error) return { error: limpiar(error.message) };
  const s = await datosDelPedido(datos.servicioId);
  const quien = sinRuc(s?.cliente_texto);
  const numero = datos.numero.trim().toUpperCase();
  const esPrueba = perfil.es_prueba === true;
  await Promise.all([
    notificarFinanzas({
      titulo: `Factura ${numero} · ${quien}`,
      cuerpo: "Contabilidad registró la factura: actualice la liquidación con «Generar liquidación», que ya trae el número.",
      url: `/finanzas/pedidos/${datos.servicioId}`,
      esPrueba,
    }),
    notificarCentral({
      titulo: `Factura ${numero} · ${quien}`,
      cuerpo: "Facturación registró la factura: ya puede imprimirla para el expediente.",
      url: await enlaceCierreDelPedido(supabase, datos.servicioId),
      esPrueba,
    }),
    avisarFacturado(datos.servicioId, numero, esPrueba),
  ]);
  revalidar(datos.servicioId);
  return { error: null };
}

/**
 * QUIEN PIDIÓ FACTURAR SE ENTERA DE QUE YA SE FACTURÓ (gerencia 20-10,
 * Beneficencia): «como postventa, ¿dónde vemos si ya se facturó? No hay».
 * Postventa (quien dio la orden) y el comercial del cierre reciben la campana.
 */
async function avisarFacturado(servicioId: string, numero: string, esPrueba: boolean, texto = "Facturado") {
  if (esPrueba) return;
  const admin = createAdminClient();
  const { data } = await admin
    .from("servicios_postventa")
    .select("cliente_texto, orden_facturar_por, informes_cierre(creado_por)")
    .eq("id", servicioId)
    .maybeSingle();
  if (!data) return;
  const cierre = data.informes_cierre as unknown as { creado_por: string | null } | null;
  const destinos = [...new Set([data.orden_facturar_por as string | null, cierre?.creado_por ?? null].filter(Boolean) as string[])];
  await Promise.all(
    destinos.map((userId) =>
      notificar({
        userId,
        tipo: "finanzas",
        titulo: `${texto} ${numero} · ${sinRuc(data.cliente_texto as string | null)}`,
        cuerpo: "Está en el pedido, en «Documentos del expediente · Contabilidad y Finanzas».",
        url: `/postventa/pedidos/${servicioId}`,
      }),
    ),
  );
}

/** La nota de crédito que anula una factura del pedido (0552, E001-840 de Beneficencia). */
export async function registrarNotaCredito(datos: {
  servicioId: string;
  facturaId: string;
  numero: string;
  fecha: string;
  motivo: string;
  path: string | null;
  nombre: string | null;
}) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("facturacion_registrar_nota_credito", {
    p_servicio: datos.servicioId,
    p_factura: datos.facturaId,
    p_numero: datos.numero,
    p_fecha: datos.fecha,
    p_motivo: datos.motivo,
    p_path: datos.path,
    p_nombre: datos.nombre,
  });
  if (error) return { error: limpiar(error.message) };
  const s = await datosDelPedido(datos.servicioId);
  const numero = datos.numero.trim().toUpperCase();
  const esPrueba = perfil.es_prueba === true;
  await Promise.all([
    notificarFinanzas({
      titulo: `Nota de crédito ${numero} · ${sinRuc(s?.cliente_texto)}`,
      cuerpo: `Anula una factura del pedido (${datos.motivo.trim()}). Vuelve a «Por facturar».`,
      url: `/finanzas/pedidos/${datos.servicioId}`,
      esPrueba,
    }),
    notificarFacturacion({
      titulo: `Otra vez por facturar · ${sinRuc(s?.cliente_texto)}`,
      cuerpo: `Se registró la nota de crédito ${numero}: falta la factura correcta.`,
      url: "/facturacion",
      esPrueba,
    }),
    avisarFacturado(datos.servicioId, numero, esPrueba, "Nota de crédito"),
  ]);
  revalidar(datos.servicioId);
  return { error: null };
}

/** «No se factura» con motivo (0552, caso Lino), o deshacerlo. */
export async function marcarNoSeFactura(servicioId: string, motivo: string, deshacer = false) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_no_se_factura", { p_servicio: servicioId, p_motivo: motivo, p_deshacer: deshacer });
  if (error) return { error: limpiar(error.message) };
  revalidar(servicioId);
  return { error: null };
}

/** Facturación para el pedido: el expediente no está alineado (y dice por qué). */
export async function observarExpediente(servicioId: string, motivo: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("facturacion_observar", { p_servicio: servicioId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  const s = await datosDelPedido(servicioId);
  await notificarCentral({
    titulo: `Facturación observó · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: `${motivo.trim()}. Corrija el expediente y levante la observación.`,
    url: await enlaceCierreDelPedido(supabase, servicioId),
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  return { error: null };
}

/** Central (o Facturación) levanta la observación ya corregida. */
export async function levantarObservacion(servicioId: string) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("facturacion_levantar_observacion", { p_servicio: servicioId });
  if (error) return { error: limpiar(error.message) };
  const s = await datosDelPedido(servicioId);
  await notificarFacturacion({
    titulo: `Observación levantada · ${sinRuc(s?.cliente_texto)}`,
    cuerpo: "Central corrigió el expediente. Ya puede facturar.",
    url: "/facturacion",
    esPrueba: perfil.es_prueba === true,
  });
  revalidar(servicioId);
  return { error: null };
}

/**
 * Facturación marca (o desmarca) que la factura ya se le envió al cliente (0331).
 * Registrarla y enviarla son dos pasos distintos: el gerente pidió ver los dos.
 */
export async function marcarFacturaEnviada(facturaId: string, servicioId: string, enviada: boolean) {
  await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("facturacion_marcar_enviada", { p_factura: facturaId, p_enviada: enviada });
  if (error) return { error: limpiar(error.message) };
  revalidar(servicioId);
  return { error: null };
}
