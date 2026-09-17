"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { notificarAlmacen } from "@/lib/notificaciones";

/**
 * Quién viene a la planta (0238).
 *
 * Carlos, 15-09, con Lavipronto (el cliente viene el sábado a ver su máquina y
 * pagar el saldo): «registramos la visita. Eso llega a la central: RUC, si es
 * empresa, nombre de la empresa, la persona con DNI y el motivo. Y la central
 * ya hace su trabajo de imprimirlo y llevarlo al vigilante». Comerciales y
 * postventa registran; Central imprime.
 */
const limpiar = (e: string) => e.replace(/^[A-Z0-9]{5}:\s*/, "");

export async function registrarVisitaPlanta(datos: {
  cuentaId: string | null;
  oportunidadId?: string | null;
  empresa: string;
  ruc?: string | null;
  persona: string;
  dni?: string | null;
  telefono?: string | null;
  motivo: string;
  fecha: string;
  hora?: string | null;
  /** Hay que abrir la lavandería (showroom) para la visita (0241). */
  showroom?: boolean;
  /** Lo demás que pide el correo de Katerine (0243): la cotización, el TV y el Infocorp. */
  cotizacionRef?: string | null;
  prenderTv?: boolean;
  infocorp?: boolean;
}): Promise<{ error: string | null; id?: string; correoEnviado?: boolean }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  // Si no escribieron la cotización, va la última que se le envió a ese cliente.
  let cotizacionRef = datos.cotizacionRef?.trim() || "";
  if (!cotizacionRef && datos.cuentaId) {
    const { data: ult } = await supabase
      .from("cotizaciones")
      .select("codigo, oportunidades!cotizaciones_oportunidad_id_fkey!inner(cuenta_id)")
      .eq("oportunidades.cuenta_id", datos.cuentaId)
      .not("enviada_at", "is", null)
      .order("enviada_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    cotizacionRef = (ult?.codigo as string | null) ?? "";
  }
  const { data, error } = await supabase.rpc("registrar_visita_planta", {
    p_cuenta: datos.cuentaId,
    p_empresa: datos.empresa.trim(),
    p_ruc: datos.ruc?.trim() || null,
    p_persona: datos.persona.trim(),
    p_dni: datos.dni?.trim() || null,
    p_telefono: datos.telefono?.trim() || null,
    p_motivo: datos.motivo.trim(),
    p_fecha: datos.fecha,
    p_hora: datos.hora || null,
    p_oportunidad: datos.oportunidadId ?? null,
    p_showroom: datos.showroom === true,
    p_cotizacion_ref: cotizacionRef || null,
    p_prender_tv: datos.prenderTv === true,
    p_infocorp: datos.infocorp === true,
  });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  revalidatePath("/postventa/agenda");
  revalidatePath("/almacen/visitas");
  // El almacén también se entera en su bandeja: viene alguien a recoger (0246).
  await notificarAlmacen({
    titulo: `Visita ${datos.showroom ? "al showroom" : "a planta"} el ${datos.fecha}${datos.hora ? ` ${datos.hora.slice(0, 5)}` : ""} · ${datos.empresa.trim()}`,
    cuerpo: `${datos.persona.trim()}${datos.dni ? ` (DNI ${datos.dni})` : ""}. ${datos.motivo.trim()}`,
    url: "/almacen/visitas",
    esPrueba: perfil.es_prueba === true,
  });

  // EL CORREO DEL FORMATO DE LESLY (T:\formatos para santos, 16-09): la misma
  // tabla que hoy manda el comercial a mano a Central, Almacén y Logística con
  // copia a gerencia. Sale desde el corporativo; si n8n no contesta, la visita
  // queda registrada igual y la campanita de Central ya sonó.
  let correoEnviado = false;
  if (!perfil.es_prueba) {
    // Los destinatarios del correo de Katerine (16-09): Central, Contabilidad,
    // Lesly, Sistemas, Almacén y gerencia (crcabrejos y kycabrejos).
    const para =
      process.env.AVISOS_VISITA_PARA ??
      "central@efameinsa.com, contabilidad1@efameinsa.com, logistica2@efameinsa.com, sistemas@efameinsa.com, almacen@efameinsa.com, almacen1@efameinsa.com, crcabrejos@efameinsa.com, kycabrejos@efameinsa.com";
    const esc = (v: string | null | undefined) => (v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const fecha = new Date(datos.fecha + "T12:00:00-05:00").toLocaleDateString("es-PE", { timeZone: "America/Lima" });
    const hora = datos.hora ? datos.hora.slice(0, 5) : "por confirmar";
    const td = (x: string) => `<td style="border:1px solid #444;padding:6px 8px;vertical-align:top">${x}</td>`;
    const th = (x: string) => `<th style="border:1px solid #444;padding:6px 8px;background:#f2f2f2">${x}</th>`;
    const r = await enviarCorreoN8n({
      para,
      asunto: datos.showroom
        ? `VISITA SHOWROOM-PROSPECTO-${esc(datos.persona).toUpperCase()}`
        : `VISITA A PLANTA-${esc(datos.empresa).toUpperCase()}-${esc(datos.persona).toUpperCase()}`,
      html:
        `<div style="font-family:Calibri,Arial,sans-serif;font-size:14px">` +
        `<p>Buenos días, para informar la siguiente visita:</p>` +
        `<table style="border-collapse:collapse"><tr>${th("FECHA")}${th("HORA")}${th("PROSPECTO")}${th("N° COTIZACIÓN")}${th("OBSERVACIÓN")}</tr>` +
        `<tr>${td(`<span style="background:#ffff00">${fecha}</span>`)}${td(`<span style="color:#c00">${hora}</span>`)}` +
        `${td(`${datos.dni ? `DNI ${esc(datos.dni)} - ` : datos.ruc ? `RUC ${esc(datos.ruc)} - ` : ""}${esc(datos.persona)}<br><b>${esc(datos.empresa)}</b>${datos.telefono ? `<br>Tel. ${esc(datos.telefono)}` : ""}`)}` +
        `${td(cotizacionRef ? `N° ${esc(cotizacionRef)}` : "—")}${td(esc(datos.motivo))}</tr></table>` +
        `<p>` +
        (datos.prenderTv ? `<span style="background:#ffff00">Prender TV</span><br>` : "") +
        (datos.showroom ? `<span style="background:#ffff00">Abrir lavandería</span><br>` : "") +
        (datos.infocorp ? `Se solicita Infocorp: ${esc(datos.empresa)}${datos.ruc ? ` (RUC ${esc(datos.ruc)})` : datos.dni ? ` (DNI ${esc(datos.dni)})` : ""}<br>` : "") +
        `</p>` +
        `<p>Gracias,</p>` +
        `<p style="color:#666;font-size:12px">${esc(perfil.codigo_comercial ? `${perfil.codigo_comercial} · ` : "")}${esc(perfil.nombre)} · registrado en el CRM.</p></div>`,
      responderA: null,
    });
    correoEnviado = !r.error;
  }
  return { error: null, id: data as string, correoEnviado };
}

export async function marcarVisitaImpresa(visitaId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_visita_impresa", { p_visita: visitaId });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  return { error: null };
}

export async function cancelarVisitaPlanta(visitaId: string, motivo: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_visita_planta", { p_visita: visitaId, p_motivo: motivo });
  if (error) return { error: limpiar(error.message) };
  revalidatePath("/central/visitas");
  revalidatePath("/postventa/agenda");
  return { error: null };
}
