"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificarCentral, notificarFacturacion, notificarFinanzas } from "@/lib/notificaciones";
import type { EstadoPagoLiquidacion } from "@/lib/documentos-finanzas";

// LIQUIDACIONES QUE SE ACTUALIZAN Y LA FACTURA (0306, reunión 25-09 11:44).
// Finanzas sube una liquidación por movimiento (pago a cuenta, saldo, la
// factura que llegó después); Facturación revisa el expediente, factura y
// registra la factura, o lo observa si no está alineado. Central recibe el
// aviso para imprimir y armar el expediente físico.

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");
const sinRuc = (s: string | null | undefined) => (s ?? "").replace(/^\d{8,11}\s*-\s*/, "");

function revalidar(servicioId: string) {
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
  await Promise.all([
    notificarCentral({
      titulo: antes?.liquidacion_at ? `Liquidación actualizada · ${quien}` : `Liquidación lista · ${quien}`,
      cuerpo: antes?.liquidacion_at
        ? `Finanzas subió una liquidación nueva${pedido}. Imprímala para el expediente.`
        : `Finanzas subió la liquidación${pedido}. Revísela: acéptela o recházela con el motivo.`,
      url: "/central/cierres",
      esPrueba,
    }),
    // Si todavía no hay número de factura, el pedido espera a Facturación.
    !datos.factura
      ? notificarFacturacion({
          titulo: `Por facturar · ${quien}`,
          cuerpo: `Finanzas subió la liquidación${pedido} con factura pendiente. Revise el expediente y facture.`,
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
      cuerpo: "Facturación registró la factura. Si la liquidación decía «factura pendiente», súbala actualizada con el número.",
      url: `/finanzas/pedidos/${datos.servicioId}`,
      esPrueba,
    }),
    notificarCentral({
      titulo: `Factura ${numero} · ${quien}`,
      cuerpo: "Facturación registró la factura: ya puede imprimirla para el expediente.",
      url: "/central/cierres?ver=liberados",
      esPrueba,
    }),
  ]);
  revalidar(datos.servicioId);
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
    url: "/central/cierres?ver=todos",
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
