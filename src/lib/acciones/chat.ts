"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import { AREAS_CHAT, areaDePerfil, type AreaChat, type MensajeChat, type TipoChat } from "@/lib/chat";

/**
 * EL CHAT DE CADA CASO (Santos, 23-10; 0592). Lee con la sesión de quien mira
 * (la RLS decide si entra) y escribe solo por `enviar_mensaje_chat`, que no deja
 * escribir en un caso o pedido cerrado. Los avisos los manda el servidor con la
 * llave de servicio, uno pendiente por chat y persona (el nuevo reemplaza al
 * anterior, como los mensajes de WhatsApp), para no llenar la campana.
 */

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

export type DatosChat = {
  tipo: TipoChat;
  id: string;
  titulo: string;
  cerradoAt: string | null;
  mensajes: MensajeChat[];
  /** Quiénes ya escribieron, con su área: los «involucrados» a la vista. */
  participantes: { nombre: string; area: string }[];
};

async function cabecera(tipo: TipoChat, id: string) {
  const supabase = await createClient();
  if (tipo === "caso") {
    const { data } = await supabase.from("atenciones").select("codigo, cliente_texto, cerrado_at, asignado_a, cuentas(razon_social)").eq("id", id).maybeSingle();
    if (!data) return null;
    const cliente = (data.cliente_texto as string | null)?.trim() || ((data.cuentas as { razon_social?: string } | null)?.razon_social ?? "Cliente");
    return { titulo: `${data.codigo ?? "Caso"} · ${cliente.replace(/^\d{8,11}\s*-\s*/, "")}`, cerradoAt: (data.cerrado_at as string | null) ?? null, asignado: (data.asignado_a as string | null) ?? null, creador: null as string | null };
  }
  const { data } = await supabase
    .from("servicios_postventa")
    .select("numero_pedido_erp, cliente_texto, cerrado_at, completado, informes_cierre!servicios_postventa_informe_cierre_id_fkey(creado_por)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const cliente = ((data.cliente_texto as string | null) ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  return {
    titulo: `${data.numero_pedido_erp ?? "Pedido"} · ${cliente}`,
    cerradoAt: (data.cerrado_at as string | null) ?? (data.completado ? new Date().toISOString() : null),
    asignado: null as string | null,
    creador: ((data.informes_cierre as { creado_por?: string } | null)?.creado_por as string | undefined) ?? null,
  };
}

export async function cargarChat(tipo: TipoChat, id: string): Promise<DatosChat | null> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const cab = await cabecera(tipo, id);
  if (!cab) return null;
  const { data } = await supabase
    .from("chat_mensajes")
    .select("id, autor_id, texto, para_area, clase, created_at")
    .eq(tipo === "caso" ? "atencion_id" : "servicio_id", id)
    .order("created_at")
    .limit(500);
  const filas = (data ?? []) as { id: string; autor_id: string; texto: string; para_area: AreaChat | null; clase: "mensaje" | "apuro"; created_at: string }[];
  const ids = [...new Set(filas.map((f) => f.autor_id))];
  // Los nombres con la llave de servicio: un nombre no es secreto y no todas las áreas leen todos los perfiles.
  const { data: autores } = ids.length
    ? await createAdminClient().from("perfiles").select("id, nombre, rol, es_postventa, es_almacen, es_operaciones, es_soporte").in("id", ids)
    : { data: [] };
  const quien = new Map(((autores ?? []) as (Parameters<typeof areaDePerfil>[0] & { id: string; nombre: string | null })[]).map((a) => [a.id, { nombre: String(a.nombre ?? ""), area: areaDePerfil(a) }]));
  void supabase.rpc("marcar_chat_leido", { p_tipo: tipo, p_id: id });
  return {
    tipo,
    id,
    titulo: cab.titulo,
    cerradoAt: cab.cerradoAt,
    mensajes: filas.map((f) => ({
      id: f.id,
      texto: f.texto,
      para: f.para_area,
      clase: f.clase,
      at: f.created_at,
      mio: f.autor_id === perfil.id,
      autor: quien.get(f.autor_id)?.nombre ?? "Alguien",
      area: quien.get(f.autor_id)?.area ?? "",
    })),
    participantes: ids.map((x) => quien.get(x)).filter((x): x is { nombre: string; area: string } => Boolean(x)),
  };
}

/** Las personas de un área (para el «Para:» del mensaje), en el mismo mundo (real / práctica). */
async function personasDelArea(area: AreaChat, esPrueba: boolean, creador: string | null): Promise<string[]> {
  if (area === "comercial") return creador ? [creador] : [];
  const admin = createAdminClient();
  let q = admin.from("perfiles").select("id").eq("activo", true).eq("es_prueba", esPrueba).is("espejo_de", null);
  if (area === "almacen") q = q.or("es_almacen.eq.true,es_operaciones.eq.true");
  else if (area === "postventa") q = q.eq("es_postventa", true);
  else if (area === "finanzas") q = q.eq("rol", "finanzas");
  else if (area === "contabilidad") q = q.eq("rol", "facturacion");
  else if (area === "central") q = q.eq("rol", "central");
  const { data } = await q;
  return (data ?? []).map((p) => p.id as string);
}

/** Dónde abre el chat cada quien: la pantalla del caso o del pedido, con «#chat=…» para abrirlo al llegar. */
function urlDelChat(tipo: TipoChat, id: string): string {
  return tipo === "caso" ? `/postventa/atenciones/${id}#chat=caso:${id}` : `/postventa/pedidos/${id}#chat=pedido:${id}`;
}

export async function enviarMensajeChat(datos: { tipo: TipoChat; id: string; texto: string; para?: AreaChat | null; clase?: "mensaje" | "apuro" }): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_mensaje_chat", {
    p_tipo: datos.tipo,
    p_id: datos.id,
    p_texto: datos.texto,
    p_para: datos.para ?? null,
    p_clase: datos.clase ?? "mensaje",
  });
  if (error) return { error: limpiar(error.message) };

  // A quién le llega el aviso: el área del «Para:», quien lleva el caso y quienes ya conversaron. Nunca a quien escribe.
  const cab = await cabecera(datos.tipo, datos.id);
  const esPrueba = perfil.es_prueba === true;
  const admin = createAdminClient();
  const { data: previos } = await admin
    .from("chat_mensajes")
    .select("autor_id")
    .eq(datos.tipo === "caso" ? "atencion_id" : "servicio_id", datos.id)
    .limit(500);
  const destinos = new Set<string>([
    ...((previos ?? []) as { autor_id: string }[]).map((p) => p.autor_id),
    ...(cab?.asignado ? [cab.asignado] : []),
    ...(datos.para ? await personasDelArea(datos.para, esPrueba, cab?.creador ?? null) : []),
  ]);
  destinos.delete(perfil.id);
  if (destinos.size === 0) return { error: null };

  const url = urlDelChat(datos.tipo, datos.id);
  const titulo = `💬 ${cab?.titulo ?? "Chat"} · ${perfil.nombre}${datos.para ? ` → ${AREAS_CHAT[datos.para]}` : ""}`;
  const cuerpo = datos.texto.trim().slice(0, 180);
  // Un aviso pendiente por chat y persona: el nuevo reemplaza al anterior sin leer.
  await admin.from("notificaciones").delete().eq("tipo", "chat_caso").eq("url", url).is("leida_at", null).in("user_id", [...destinos]);
  await Promise.all([...destinos].map((userId) => notificar({ userId, tipo: "chat_caso", titulo, cuerpo, url })));
  return { error: null };
}
