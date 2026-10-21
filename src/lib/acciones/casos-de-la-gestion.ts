"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * ¿DE QUÉ CASO ES ESTA GESTIÓN? (gerencia, reunión del 20-10-2026 15:45)
 *
 * «Cuando tú ingresas una llamada tienes que indicar a qué caso estás
 * hablando… tiene que obligarme a mí cuando hago el registro… debería
 * registrar con todos los casos ahí y yo elijo, check, check.» Lo dijo cuatro
 * veces con Pepas de Oro y Lino Espíritu: las gestiones sueltas eran la razón
 * de que «nunca se termina un caso».
 *
 * Lista los casos abiertos del cliente del expediente, incluidas sus fichas
 * gemelas (mismo RUC/DNI, unidas, o el DNI dentro del RUC 10 de la persona
 * natural, 0567). Primero se mira con la sesión de quien pide que pueda ver
 * el expediente; recién entonces se arma la lista con la llave del servidor,
 * porque el comercial no lee `atenciones` y también tiene que elegir.
 */
export interface CasoParaGestion {
  id: string;
  codigo: string | null;
  tipo: string;
  tipoDetalle: string | null;
  etapa: string | null;
  equipo: string | null;
  serie: string | null;
  abiertoAt: string;
  lleva: string | null;
  /** Si el caso está en otra ficha del mismo cliente: su nombre y documento. */
  otraFicha: string | null;
}

export async function casosParaGestion(oportunidadId: string): Promise<CasoParaGestion[]> {
  if (!oportunidadId) return [];
  const supabase = await createClient();
  const { data: op } = await supabase.from("oportunidades").select("cuenta_id").eq("id", oportunidadId).maybeSingle();
  const cuentaId = (op as { cuenta_id: string | null } | null)?.cuenta_id;
  if (!cuentaId) return [];
  return casosAbiertosDeCuenta(cuentaId);
}

/** Lo mismo, partiendo del cliente (Central, al derivar). Quien llama ya comprobó que puede verlo. */
export async function casosAbiertosDeCuenta(cuentaId: string): Promise<CasoParaGestion[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("casos_abiertos_de_cuenta", { p_cuenta: cuentaId });
  return ((data ?? []) as {
    id: string; codigo: string | null; tipo: string; tipo_detalle: string | null; etapa: string | null;
    equipo: string | null; serie: string | null; abierto_at: string; lleva: string | null; otra_ficha: string | null;
  }[]).map((c) => ({
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    tipoDetalle: c.tipo_detalle,
    etapa: c.etapa,
    equipo: c.equipo ? c.equipo.split(/\r?\n/)[0].trim().slice(0, 80) : null,
    serie: c.serie,
    abiertoAt: c.abierto_at,
    lleva: c.lleva,
    otraFicha: c.otra_ficha,
  }));
}

/**
 * Los casos elegidos tienen que ser del mismo cliente (o de una ficha gemela).
 * Devuelve los válidos; los que no lo son se descartan en silencio porque
 * solo llegan así si alguien manipula la pantalla.
 */
export async function casosValidosDelExpediente(oportunidadId: string, ids: string[]): Promise<string[]> {
  const limpios = [...new Set(ids.filter((x) => /^[0-9a-f-]{36}$/i.test(x)))].slice(0, 6);
  if (limpios.length === 0) return [];
  const casos = await casosParaGestion(oportunidadId);
  const abiertos = new Set(casos.map((c) => c.id));
  return limpios.filter((x) => abiertos.has(x));
}
