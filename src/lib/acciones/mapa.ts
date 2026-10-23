"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar, notificarAlmacen, notificarCentral, notificarFinanzas } from "@/lib/notificaciones";
import { haceCuanto, rutaDeRecepcion, type RutaMapa, type TipoRuta } from "@/lib/mapa-recorrido";
import { apurosDeRutas, rutasDePedidos, rutasDelCaso, type ApurosMapa } from "@/lib/mapa-recorrido-datos";
import { conZumbido } from "@/lib/zumbido";

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

type AreaApurable = "central" | "almacen" | "finanzas" | "contabilidad" | "postventa";

const NOMBRE_AREA: Record<AreaApurable, string> = {
  central: "Central",
  almacen: "el almacén",
  finanzas: "Finanzas",
  contabilidad: "Contabilidad / Facturación",
  postventa: "postventa",
};

/**
 * Dónde trabaja ese recorrido cada área, en una pantalla que TIENE el mapa;
 * «#mapa=tipo:id» lo abre al llegar, con la etapa atascada a la vista.
 * Contabilidad y Central lo ven en «Pagos y facturas» del pedido. Un caso que
 * espera a Central (solicitud) va a su bandeja: ahí no hay mapa.
 */
function urlPara(area: AreaApurable, tipo: TipoRuta, id: string): string {
  const abrir = `#mapa=${tipo}:${id}`;
  if (tipo === "recepcion") return `/recepciones/${id}`;
  if (tipo === "caso") return area === "central" ? "/central" : `/postventa/atenciones/${id}${abrir}`;
  if (area === "almacen") return `/almacen/pedidos/${id}${abrir}`;
  if (area === "finanzas") return `/finanzas/pedidos/${id}${abrir}`;
  if (area === "contabilidad" || area === "central") return `/pedidos/${id}/pagos${abrir}`;
  return `/postventa/pedidos/${id}${abrir}`;
}

/** A postventa: quien lleva el caso; si nadie, el área. Con sirena («apuro_mapa»). */
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
  await Promise.all(ids.map((userId) => notificar({ userId, tipo: "apuro_mapa", titulo, cuerpo, url })));
}

/** A Contabilidad / Facturación; si no hay nadie activo, a Finanzas (P3: «si Contabilidad no está, autoriza Finanzas»). */
async function avisarContabilidad(titulo: string, cuerpo: string, url: string, esPrueba: boolean) {
  const admin = createAdminClient();
  const { data } = await admin.from("perfiles").select("id").eq("rol", "facturacion").eq("activo", true).eq("es_prueba", esPrueba).is("espejo_de", null);
  if (!(data ?? []).length) return notificarFinanzas({ tipo: "apuro_mapa", titulo, cuerpo, url, esPrueba });
  await Promise.all((data ?? []).map((p) => notificar({ userId: p.id as string, tipo: "apuro_mapa", titulo, cuerpo, url })));
}

/**
 * «APURAR AL ÁREA» DESDE EL MAPA DEL RECORRIDO (Santos, 23-10; 0591). La misma
 * sirena con que Central apura al almacén y a Finanzas (0358), para el área
 * donde está atascado el recorrido. La base valida que el recorrido siga vivo,
 * que quien apura lo pueda ver y deja uno cada 15 minutos por área; del
 * segundo apuro en adelante gerencia también se entera.
 */
export async function apurarDesdeElMapa(datos: { tipo: TipoRuta; id: string; area: AreaApurable; paso: string; etiqueta: string; ruta: string; desde?: string | null; nota?: string | null }): Promise<{ error: string | null; avisoNumero?: number }> {
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
  // El 1.º y el 2.º apuro llevan el zumbido de Messenger en la pantalla del área (Santos 23-10).
  const titulo = conZumbido(`${cliente}${de}: ${perfil.nombre} pide mover «${datos.etiqueta}»`, r.aviso_numero);
  const hace = haceCuanto(datos.desde ?? null);
  const nota = (datos.nota ?? "").trim().slice(0, 500);
  const cuerpo =
    `El recorrido está detenido en un paso de ${NOMBRE_AREA[datos.area]}${hace ? ` (${hace})` : ""}: «${datos.etiqueta}». ` +
    (datos.area === "postventa" && datos.tipo === "caso" ? "Es un caso de postventa. " : "") +
    (nota ? `Le piden: «${nota}». ` : "") +
    `Ábralo en el mapa: la etapa en rojo es la que falta; haga ese paso en su pantalla de siempre.${vez}`;

  // EL APURO QUEDA EN EL CHAT DEL CASO (0592): quién apuró, a qué área, en qué paso y qué pidió.
  if (datos.tipo !== "recepcion") {
    await supabase.rpc("enviar_mensaje_chat", {
      p_tipo: datos.tipo,
      p_id: datos.id,
      p_texto: `«${datos.etiqueta}»${nota ? ` — ${nota}` : ""}`,
      p_para: datos.area,
      p_clase: "apuro",
    });
  }
  const url = urlPara(datos.area, datos.tipo, datos.id);
  const esPrueba = r.es_prueba === true;

  if (datos.area === "almacen") await notificarAlmacen({ tipo: "apuro_mapa", titulo, cuerpo, url, esPrueba });
  else if (datos.area === "finanzas") await notificarFinanzas({ tipo: "apuro_mapa", titulo, cuerpo, url, esPrueba });
  else if (datos.area === "central") await notificarCentral({ tipo: "apuro_mapa", titulo, cuerpo, url, esPrueba });
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

/**
 * EL MAPA SIN SALIR DE LO QUE ESTABA HACIENDO (Santos, 23-10: «no debe sacar al
 * usuario de lo que ya estaba haciendo, pero que quede enterado de qué le
 * necesitan y le dé una ruta para resolverlo»). El aviso del «Apurar» abre el
 * mapa en una ventana encima de la pantalla actual: lo lee con la sesión de
 * quien mira (RLS), sin navegar.
 */
export async function cargarMapa(tipo: TipoRuta, id: string): Promise<{ rutas: RutaMapa[]; apuros: ApurosMapa } | null> {
  await requerirPerfil();
  const supabase = await createClient();
  let rutas: RutaMapa[] = [];
  if (tipo === "caso") rutas = await rutasDelCaso(supabase, id);
  else if (tipo === "pedido") rutas = await rutasDePedidos(supabase, [id], (x) => `/postventa/pedidos/${x}`);
  else {
    const { data } = await supabase.from("recepciones_equipo").select("id, codigo, equipo_texto, created_at, recibido_at, revisado_at, listo_at, resultado").eq("id", id).maybeSingle();
    if (data) rutas = [rutaDeRecepcion(data as Parameters<typeof rutaDeRecepcion>[0])];
  }
  if (!rutas.length) return null;
  return { rutas, apuros: await apurosDeRutas(supabase, rutas) };
}
