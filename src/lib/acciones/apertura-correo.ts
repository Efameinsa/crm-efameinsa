"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { cargarHojaApertura } from "@/lib/acciones/apertura-servicio-datos";
import { marcarAperturaEnviada } from "@/lib/acciones/postventa";
import { correoDeApertura } from "@/lib/correo/apertura";
import { esCorreoDeLaEmpresa } from "@/lib/directorio";
import { enlaceApp } from "@/lib/url-app";

const COPIA_OCULTA = "gestion1@efameinsa.com";
const MAXIMO_DESTINATARIOS = 10;

/**
 * «ENVIAR POR CORREO» EN LA APERTURA DE SERVICIO (Santos, 07-10). Antes
 * postventa copiaba el texto y lo pegaba en Outlook; ahora el CRM lo manda
 * desde gestion1@efameinsa.com, con las respuestas a quien lo envía.
 *
 * Del navegador solo llegan las DIRECCIONES. El contenido se arma acá, desde el
 * pedido, así que nadie puede mandar con la voz de la empresa un texto que no
 * es la apertura. Y solo a direcciones de la empresa: lo que va al cliente lo
 * manda postventa a mano (Carlos, 09-09).
 *
 * Si sale bien y todavía no estaba marcada, se marca «enviada al almacén»: eso
 * ya avisa en la campana al almacén y a Finanzas (marcarAperturaEnviada). Si el
 * correo falla, no se marca nada y el botón «Copiar» sigue ahí.
 */
export async function enviarAperturaPorCorreo(
  servicioId: string,
  destinatarios: string[],
): Promise<{ error: string | null; enviadoA?: string[]; por?: "gestion1" | "gmail" }> {
  const perfil = await requerirPerfil();
  const puede = perfil.es_postventa === true || perfil.rol === "gerencia" || perfil.rol === "admin" || perfil.es_operaciones === true;
  if (!puede) return { error: "Solo postventa, operaciones o gerencia envían la apertura" };

  const para = [...new Set(destinatarios.map((c) => c.trim().toLowerCase()).filter(Boolean))];
  if (!para.length) return { error: "Elija al menos un destinatario" };
  if (para.length > MAXIMO_DESTINATARIOS) return { error: `Son demasiados destinatarios (máximo ${MAXIMO_DESTINATARIOS})` };
  const ajena = para.find((c) => !esCorreoDeLaEmpresa(c));
  if (ajena) return { error: `«${ajena}» no es un correo de la empresa. Al cliente se le escribe desde su propio correo.` };

  const supabase = await createClient();
  const hoja = await cargarHojaApertura(supabase, servicioId, perfil);
  if (!hoja) return { error: "No se encontró el pedido" };
  if (hoja.servicio.es_prueba === true || perfil.es_prueba === true) {
    return { error: "Es un pedido de práctica: el correo no sale. Use «Copiar el correo» para ver cómo queda." };
  }

  const { data: sesion } = await supabase.auth.getUser();
  const miCorreo = sesion.user?.email?.toLowerCase() ?? null;
  const responderA = miCorreo && esCorreoDeLaEmpresa(miCorreo) ? miCorreo : COPIA_OCULTA;

  const { asunto, html, empresa } = correoDeApertura(hoja.d, enlaceApp(`/postventa/pedidos/${servicioId}/apertura`));
  const r = await enviarCorreoN8n({
    para: para.join(", "),
    asunto,
    html,
    responderA,
    deNombre: `${empresa === "OPEN" ? "OPEN INVESTMENTS" : "EFAMEINSA"} · Postventa`,
    cco: COPIA_OCULTA,
  });
  if (r.error) return { error: `${r.error}. Puede copiar el correo y enviarlo desde Outlook.` };

  if (!hoja.servicio.apertura_enviada_almacen_at) {
    const marca = await marcarAperturaEnviada(servicioId, "almacen");
    if (marca.error) console.error("apertura-correo: el correo salió pero no se pudo marcar como enviada:", marca.error);
  }
  revalidatePath(`/postventa/pedidos/${servicioId}/apertura`);
  return { error: null, enviadoA: para, por: r.por };
}
