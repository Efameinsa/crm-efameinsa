"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { cargarCierreSemanal } from "@/lib/cierre-semanal";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderizarCierreSemanal, rutaPdfCierreSemana } from "@/lib/pdf/cierre-semanal-render";

/**
 * Lo que el comercial declara al cerrar su semana.
 *
 * Carlos, 02-09: «que tenga un campo obligatorio para que redactes cuál es tu
 * plan para la siguiente semana. No me hables de que vas a llamar a 10
 * clientes el lunes, porque ya está mapeado (…) háblame de qué es lo que vas a
 * hacer TÚ para poder mejorar en tus ventas. Es decir, la pregunta del millón:
 * ¿qué necesitas?»
 *
 * Se guarda una por comercial y por semana, y se puede corregir mientras la
 * semana esté fresca: el sábado a las doce nadie escribe bien a la primera.
 * Las de semanas pasadas quedan como quedaron — son el registro contra el que
 * gerencia pregunta el lunes.
 */
export async function guardarDeclaracionSemana(datos: {
  lunes: string;
  compromiso: string;
  necesidades: string;
  sinNecesidades: boolean;
}): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const compromiso = datos.compromiso.trim();
  const necesidades = datos.necesidades.trim();

  if (compromiso.length < 15) {
    return { error: "Escriba qué va a hacer para mejorar sus ventas. Una línea de verdad, no dos palabras." };
  }
  if (!datos.sinNecesidades && necesidades.length < 5) {
    return { error: "Diga qué necesita, o marque que no necesita nada esta semana." };
  }

  const fila = {
    comercial_id: perfil.id,
    lunes: datos.lunes,
    compromiso,
    necesidades: datos.sinNecesidades ? null : necesidades,
    sin_necesidades: datos.sinNecesidades,
    actualizado_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("declaraciones_semana")
    .upsert(fila, { onConflict: "comercial_id,lunes" });
  if (error) return { error: error.message };

  // EL CIERRE QUEDA CONGELADO (0229). Carlos, 12-09: «este cierre debe
  // guardarse como histórico en el CRM del comercial». Se toma la foto de la
  // semana tal como está en este momento —proyectado, vendido, diferencia,
  // contactos, cotizaciones, perdidas— y el PDF exactamente como sale, con la
  // declaración recién escrita adentro. La proyección viva sigue cambiando
  // después; esta foto no. Si el comercial corrige su declaración el mismo
  // sábado, la foto se toma de nuevo: manda la última.
  const congelado = await congelarCierre(perfil.id, datos.lunes);
  if (congelado) return { error: congelado };

  revalidatePath("/comercial");
  revalidatePath("/gerencia");
  return { error: null };
}

async function congelarCierre(comercialId: string, lunes: string): Promise<string | null> {
  try {
    const cierre = await cargarCierreSemanal(lunes, comercialId);
    const pdf = await renderizarCierreSemanal(cierre, lunes);
    const ruta = rutaPdfCierreSemana(comercialId, lunes);
    // La llave de servicio: el bucket deja subir a cualquiera con sesión pero
    // no sobrescribir, y el sábado se corrige más de una vez.
    const admin = createAdminClient();
    const { error: eSubida } = await admin.storage
      .from("adjuntos")
      .upload(ruta, pdf, { contentType: "application/pdf", upsert: true });
    if (eSubida) return `La declaración se guardó, pero no el PDF del cierre: ${eSubida.message}`;
    const { error: eFoto } = await admin
      .from("declaraciones_semana")
      .update({
        proyectado_usd: Math.round(cierre.proyectadoUsd * 100) / 100,
        vendido_usd: Math.round(cierre.vendidoUsd * 100) / 100,
        diferencia_usd: Math.round(cierre.diferenciaUsd * 100) / 100,
        ventas: cierre.ventas.length,
        gestiones: cierre.gestiones,
        cotizaciones: cierre.cotizacionesEnviadas,
        rechazos: cierre.rechazos.length,
        pdf_path: ruta,
        cerrado_at: new Date().toISOString(),
      })
      .eq("comercial_id", comercialId)
      .eq("lunes", lunes);
    if (eFoto) return `La declaración se guardó, pero no la foto del cierre: ${eFoto.message}`;
    return null;
  } catch (e) {
    return `La declaración se guardó, pero no el PDF del cierre: ${e instanceof Error ? e.message : String(e)}`;
  }
}

/**
 * Lo que hace falta para abrir el cierre: cómo le fue en la semana, y si ya
 * declaró.
 *
 * LOS NÚMEROS VAN PRIMERO, a propósito. La pregunta de Carlos —«qué vas a
 * hacer para mejorar tus ventas»— solo tiene sentido con la semana delante:
 * quedó debiendo tanto, perdió tantas por precio. Preguntar en frío invita a
 * escribir cualquier cosa para salir del paso.
 */
export async function abrirCierreSemana(lunes: string): Promise<{
  declaracion: { compromiso: string; necesidades: string; sinNecesidades: boolean } | null;
  resumen: { proyectadoUsd: number; vendidoUsd: number; ventas: number; rechazos: number; gestiones: number };
  /**
   * LA SEMANA DE POSTVENTA, QUE NO SE MIDE EN DÓLARES.
   *
   * El área abría este mismo modal y leía «US$ 0 de US$ 0 proyectados · 0
   * ventas · 0 contactos · 0 perdidas» (informe de UX del 08-09). No era un
   * error de cálculo: postventa no tiene cartera propia ni proyección, así que
   * las cinco cifras del comercial le dan cero por definición. Un cero que no
   * significa nada enseña a no mirar la pantalla.
   *
   * Los cuatro números que sí contestan por su semana son los que el ing.
   * Carlos pide de viva voz —«has recibido 20 problemas, cuántos atendidos,
   * cuántos en proceso, cuántos cerrados»— y ya los calcula
   * `resumirAtenciones` con la definición de «caso abierto» que fijó Santos el
   * 07-09. Es la misma cuenta de la pantalla de Casos: un número por concepto.
   */
  postventa: { recibidas: number; atendidas: number; enProceso: number; cerradas: number; facturables: number } | null;
}> {
  const perfil = await requerirPerfil();
  const cierre = await cargarCierreSemanal(lunes, perfil.id);
  const supabase = await createClient();

  const { data } = await supabase
    .from("declaraciones_semana")
    .select("compromiso, necesidades, sin_necesidades")
    .eq("comercial_id", perfil.id)
    .eq("lunes", lunes)
    .maybeSingle();

  return {
    declaracion: data
      ? { compromiso: data.compromiso, necesidades: data.necesidades ?? "", sinNecesidades: data.sin_necesidades }
      : null,
    resumen: {
      proyectadoUsd: Math.round(cierre.proyectadoUsd),
      vendidoUsd: Math.round(cierre.vendidoUsd),
      ventas: cierre.ventas.length,
      rechazos: cierre.rechazos.length,
      gestiones: cierre.gestiones,
    },
    postventa: cierre.postventa,
  };
}

