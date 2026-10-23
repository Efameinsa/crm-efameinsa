"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen, notificarCentral, notificarFinanzas } from "@/lib/notificaciones";
import type { TipoRuta } from "@/lib/mapa-recorrido";

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

type AreaApurable = "central" | "almacen" | "finanzas" | "contabilidad" | "postventa";

const NOMBRE_AREA: Record<AreaApurable, string> = {
  central: "Central",
  almacen: "el almacén",
  finanzas: "Finanzas",
  contabilidad: "Contabilidad / Facturación",
  postventa: "postventa",
};

/** Dónde trabaja ese recorrido cada área: el aviso lleva directo a su pantalla. */
function urlPara(area: AreaApurable, tipo: TipoRuta, id: string): string {
  if (tipo === "recepcion") return `/recepciones/${id}`;
  if (tipo === "caso") return area === "central" ? "/central" : `/postventa/atenciones/${id}`;
  if (area === "almacen") return `/almacen/pedidos/${id}`;
  if (area === "finanzas") return `/finanzas/pedidos/${id}`;
  if (area === "contabilidad") return "/facturacion";
  if (area === "central") return "/central/pedidos";
  return `/postventa/pedidos/${id}`;
}

/** A postventa: quien lleva el caso; si nadie, el área. Con sirena («urgencia»). */
async function avisarPostventa(tipo: TipoRuta, id: string, titulo: string, cuerpo: string, url: string, esPrueba: boolean) {
  const admin = createAdminClient();
  let ids: string[] = [];
  if (tipo === "caso") {
    const { data } = await admin.from("atenciones").select("asignado_a").eq("id", id).maybeSingle();
    if (data?.asignado_a) ids = [data.asignado_a as string];
  }
  if (!ids.length) {
    const { data } = await admin.from("perfiles").select("id").eq("es_postventa", true).eq("activo", true).eq("es_prueba", esPrueba).is("espejo_de", null);
    ids = (data ?? []).map((p) => p.id as string);
  }
  await Promise.all(ids.map((userId) => notificar({ userId, tipo: "urgencia", titulo, cuerpo, url })));
}

/** A Contabilidad / Facturación; si no hay nadie activo, a Finanzas (P3: «si Contabilidad no está, autoriza Finanzas»). */
async function avisarContabilidad(titulo: string, cuerpo: string, url: string, esPrueba: boolean) {
  const admin = createAdminClient();
  const { data } = await admin.from("perfiles").select("id").eq("rol", "facturacion").eq("activo", true).eq("es_prueba", esPrueba).is("espejo_de", null);
  if (!(data ?? []).length) return notificarFinanzas({ tipo: "urgencia_finanzas", titulo, cuerpo, url, esPrueba });
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id as string, tipo: "urgencia_finanzas", titulo, cuerpo, url })));
}

/**
 * «APURAR AL ÁREA» DESDE EL MAPA DEL RECORRIDO (Santos, 23-10; 0591). La misma
 * sirena con que Central apura al almacén y a Finanzas (0358), para el área
 * donde está atascado el recorrido. La base valida que el recorrido siga vivo,
 * que quien apura lo pueda ver y deja uno cada 15 minutos por área; del
 * segundo apuro en adelante gerencia también se entera.
 */
export async function apurarDesdeElMapa(datos: { tipo: TipoRuta; id: string; area: AreaApurable; paso: string; etiqueta: string; ruta: string }): Promise<{ error: string | null; avisoNumero?: number }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apurar_desde_el_mapa", {
    p_tipo: datos.tipo,
    p_id: datos.id,
    p_area: datos.area,
    p_paso: datos.paso,
    p_etiqueta: datos.etiqueta,
  });
  if (error) return { error: limpiar(error.message) };
  const r = data as { cliente: string; codigo: string | null; aviso_numero: number; es_prueba: boolean };
  const cliente = (r.cliente ?? "").replace(/^\d{8,11}\s*-\s*/, "") || "Cliente";
  const de = r.codigo ? ` (${r.codigo})` : "";
  const vez = r.aviso_numero > 1 ? ` Es el aviso n.º ${r.aviso_numero}.` : "";
  const titulo = `${cliente}${de}: ${perfil.nombre} apura a ${NOMBRE_AREA[datos.area]}`;
  const cuerpo = `Está atascado en «${datos.etiqueta}».${vez}`;
  const url = urlPara(datos.area, datos.tipo, datos.id);
  const esPrueba = r.es_prueba === true;

  if (datos.area === "almacen") await notificarAlmacen({ tipo: "urgencia_almacen", titulo, cuerpo, url, esPrueba });
  else if (datos.area === "finanzas") await notificarFinanzas({ tipo: "urgencia_finanzas", titulo, cuerpo, url, esPrueba });
  else if (datos.area === "central") await notificarCentral({ tipo: "urgencia", titulo, cuerpo, url, esPrueba });
  else if (datos.area === "contabilidad") await avisarContabilidad(titulo, cuerpo, url, esPrueba);
  else await avisarPostventa(datos.tipo, datos.id, titulo, cuerpo, url, esPrueba);

  // Si hizo falta apurar dos veces, ya no es un olvido y gerencia lo ve (como en la 0298).
  if (r.aviso_numero >= 2 && !esPrueba) {
    await notificar({
      rol: "gerencia",
      tipo: "urgencia",
      titulo: `${cliente}${de} sigue atascado en ${NOMBRE_AREA[datos.area]}`,
      cuerpo: `«${datos.etiqueta}»: ya lo apuraron ${r.aviso_numero} veces (la última, ${perfil.nombre}).`,
      url,
    });
  }

  revalidatePath(datos.ruta);
  return { error: null, avisoNumero: r.aviso_numero };
}
