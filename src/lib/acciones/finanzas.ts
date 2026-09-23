"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import { evaluarPagoParaDespacho, type ServicioPostventa } from "@/lib/postventa";

/**
 * Lo que Finanzas escribe en el CRM (0279). Solo dos cosas, y las dos por
 * funciones de la base que validan el rol: confirmar un abono ACREDITADO y
 * observar un pago que no aparece. Cada una avisa a quien espera la
 * respuesta: postventa (sin cifras: no ve precios) y el comercial del cierre.
 */

type Resultado = { error: string | null };

function limpiar(mensaje: string): string {
  const m = mensaje.replace(/^[A-Z0-9]{5}:\s*/, "");
  if (/violates|constraint|null value|invalid input|syntax/i.test(m)) {
    return `No se pudo guardar por una falla del sistema, no por lo que escribió. Avise a Santos (${m.slice(0, 120)}).`;
  }
  return m;
}

async function avisarInteresados(
  servicioId: string,
  armar: (s: { cliente: string; cubierto: boolean; esPrueba: boolean }) => { titulo: string; cuerpoPostventa: string; cuerpoComercial: string },
) {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("servicios_postventa")
    .select("cliente_texto, monto, monto_pagado, pct_antes_despacho, informe_cierre_id, pago_confirmado_at, es_prueba, informes_cierre!servicios_postventa_informe_cierre_id_fkey(creado_por)")
    .eq("id", servicioId)
    .maybeSingle();
  if (!s) return;
  const cliente = (s.cliente_texto ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  const cubierto = evaluarPagoParaDespacho(s as unknown as ServicioPostventa).cubierto;
  const texto = armar({ cliente, cubierto, esPrueba: s.es_prueba === true });

  const { data: postventa } = await supabase
    .from("perfiles")
    .select("id")
    .eq("es_postventa", true)
    .eq("activo", true)
    .eq("es_prueba", s.es_prueba === true);
  const comercial = (s.informes_cierre as unknown as { creado_por: string | null } | null)?.creado_por ?? null;
  await Promise.all([
    ...(postventa ?? []).map((p) =>
      notificar({ userId: p.id, tipo: "finanzas", titulo: texto.titulo, cuerpo: texto.cuerpoPostventa, url: `/postventa/pedidos/${servicioId}` }),
    ),
    ...(comercial
      ? [notificar({ userId: comercial, tipo: "finanzas", titulo: texto.titulo, cuerpo: texto.cuerpoComercial, url: "/comercial/cierres" })]
      : []),
  ]);
}

export async function confirmarAbono(datos: {
  servicioId: string;
  monto: number;
  fecha: string;
  operacion: string;
  medio: string;
  capturaPath?: string | null;
  nota?: string;
}): Promise<Resultado & { total?: number }> {
  await requerirPerfil();
  if (!Number.isFinite(datos.monto) || datos.monto <= 0) return { error: "Escriba el monto que entró a la cuenta" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { error: "Falta la fecha del abono" };
  if (!datos.operacion.trim()) return { error: "Falta el número de operación del banco" };
  if (!datos.medio.trim()) return { error: "Diga en qué banco o por qué medio entró" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("finanzas_confirmar_abono", {
    p_servicio: datos.servicioId,
    p_monto: datos.monto,
    p_fecha: datos.fecha,
    p_operacion: datos.operacion.trim(),
    p_medio: datos.medio.trim(),
    p_captura: datos.capturaPath?.trim() || null,
    p_nota: datos.nota?.trim() || null,
  });
  if (error) return { error: limpiar(error.message) };

  const monto = datos.monto.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  await avisarInteresados(datos.servicioId, ({ cliente, cubierto }) => ({
    titulo: `Finanzas confirmó un abono · ${cliente}`,
    // Postventa no ve cifras (Carlos, 27-08): se le dice si ya puede avanzar.
    cuerpoPostventa: cubierto
      ? "Ya está acreditado lo acordado antes del despacho: el pedido puede seguir."
      : "Entró un abono, pero todavía no cubre lo acordado antes del despacho.",
    cuerpoComercial: `Abono de ${monto} acreditado (op. ${datos.operacion.trim()}, ${datos.medio.trim()}).${cubierto ? " Ya cubre lo acordado antes del despacho." : " Todavía falta para lo acordado antes del despacho."}`,
  }));

  revalidatePath("/finanzas");
  revalidatePath("/finanzas/cobrar");
  revalidatePath("/finanzas/confirmados");
  revalidatePath(`/finanzas/pedidos/${datos.servicioId}`);
  revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  return { error: null, total: Number(data) };
}

export async function observarPago(datos: { servicioId: string; motivo: string }): Promise<Resultado> {
  await requerirPerfil();
  const motivo = datos.motivo.trim();
  if (motivo.length < 10) return { error: "Escriba qué pasa con el pago (mínimo una frase)" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("finanzas_observar_pago", { p_servicio: datos.servicioId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };

  await avisarInteresados(datos.servicioId, ({ cliente }) => ({
    titulo: `Finanzas observó el pago · ${cliente}`,
    cuerpoPostventa: `${motivo} — el pedido no avanza hasta que se aclare.`,
    cuerpoComercial: `${motivo} — hable con el cliente y avísele a Finanzas.`,
  }));

  revalidatePath("/finanzas");
  revalidatePath(`/finanzas/pedidos/${datos.servicioId}`);
  revalidatePath(`/postventa/pedidos/${datos.servicioId}`);
  return { error: null };
}
