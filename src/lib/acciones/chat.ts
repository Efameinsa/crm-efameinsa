"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import { areaDePerfil, type ChatResumen, type MensajeChat, type TipoChat } from "@/lib/chat";

/**
 * EL CHAT DE CADA CASO (Santos, 23-10; 0592/0593/0599): un canal de coordinación
 * de todos con todos los involucrados, como un pequeño Slack. Lee con la sesión
 * de quien mira (la RLS decide si entra) y escribe solo por
 * `enviar_mensaje_chat`, que no deja escribir en un caso o pedido cerrado. Los
 * avisos los manda el servidor con la llave de servicio, uno pendiente por chat
 * y persona (el nuevo reemplaza al anterior, como los mensajes de WhatsApp).
 *
 * 0599 (Santos: «abrí un chat pero nadie me contesta»): quiénes están en cada
 * canal queda GUARDADO en `chat_participantes` (lo rehace la base con
 * `chat_sincronizar_participantes`, misma regla que antes calculaba acá), así
 * cada persona tiene su lista de chats en el menú y en /chats; «@» señala a
 * alguien y le llega su aviso; y el chat dice quién no entra al CRM hace días.
 */

const limpiar = (m: string) => m.replace(/^[A-Z0-9]{5}:\s*/, "");

type FilaPerfil = { id: string; nombre: string | null; rol?: string | null; es_postventa?: boolean | null; es_almacen?: boolean | null; es_operaciones?: boolean | null; es_soporte?: boolean | null };

export type DatosChat = {
  tipo: TipoChat;
  id: string;
  titulo: string;
  cerradoAt: string | null;
  mensajes: MensajeChat[];
  /** Todos los que están en el canal, con su área; los agregados a mano dicen quién los sumó. */
  participantes: {
    id: string;
    nombre: string;
    area: string;
    agregadoPor: string | null;
    yo: boolean;
    /** Cuándo entró al CRM por última vez (null: nunca). Para avisar «no entra desde…» (0599). */
    ultimoAcceso: string | null;
  }[];
};

async function cabecera(tipo: TipoChat, id: string) {
  const supabase = await createClient();
  if (tipo === "caso") {
    const { data } = await supabase.from("atenciones").select("codigo, cliente_texto, cerrado_at, asignado_a, cuentas(razon_social)").eq("id", id).maybeSingle();
    if (!data) return null;
    const cliente = (data.cliente_texto as string | null)?.trim() || ((data.cuentas as { razon_social?: string } | null)?.razon_social ?? "Cliente");
    return { titulo: `${data.codigo ?? "Caso"} · ${cliente.replace(/^\d{8,11}\s*-\s*/, "")}`, cerradoAt: (data.cerrado_at as string | null) ?? null, asignado: (data.asignado_a as string | null) ?? null };
  }
  const { data } = await supabase.from("servicios_postventa").select("numero_pedido_erp, cliente_texto, cerrado_at, completado").eq("id", id).maybeSingle();
  if (!data) return null;
  const cliente = ((data.cliente_texto as string | null) ?? "Cliente").replace(/^\d{8,11}\s*-\s*/, "");
  return {
    titulo: `${data.numero_pedido_erp ?? "Pedido"} · ${cliente}`,
    cerradoAt: (data.cerrado_at as string | null) ?? (data.completado ? new Date().toISOString() : null),
    asignado: null as string | null,
  };
}

/**
 * LOS QUE ESTÁN EN EL CANAL (Santos, 23-10: «es un canal de chat de todos con
 * todos, los involucrados en el caso»). Desde la 0599 los guarda la base:
 * `chat_sincronizar_participantes` suma a quien lleva el caso, quien movió
 * algún paso del caso o de su pedido, quien apuró, escribió o fue señalado con
 * «@», en un pedido el comercial de la venta, y quienes se agregaron a mano.
 * Con la llave de servicio: el registro de acciones no lo lee cualquiera.
 */
async function participantesDe(tipo: TipoChat, id: string, sincronizar: boolean): Promise<string[]> {
  const admin = createAdminClient();
  if (sincronizar) await admin.rpc("chat_sincronizar_participantes", { p_tipo: tipo, p_id: id });
  const { data } = await admin.from("chat_participantes").select("user_id").eq("tipo", tipo).eq("objeto_id", id);
  return ((data ?? []) as { user_id: string }[]).map((x) => x.user_id);
}

const CHAT_VACIO: { id: string; nombre: string | null; rol?: string | null }[] = [];

export async function cargarChat(tipo: TipoChat, id: string, marcarLeido = true, sincronizar = false): Promise<DatosChat | null> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const cab = await cabecera(tipo, id);
  if (!cab) return null;
  // Solo cuenta como leído si quien mira tiene el chat abierto y a la vista.
  if (marcarLeido) await supabase.rpc("marcar_chat_leido", { p_tipo: tipo, p_id: id });
  const admin = createAdminClient();
  const [{ data }, { data: lecturasData }, { data: agregadosData }, metidos] = await Promise.all([
    supabase
      .from("chat_mensajes")
      .select("id, autor_id, texto, para_area, clase, created_at, menciones")
      .eq(tipo === "caso" ? "atencion_id" : "servicio_id", id)
      .order("created_at")
      .limit(500),
    // Los vistos y los agregados con la llave de servicio: solo nombres y horas, nada secreto.
    admin.from("chat_lecturas").select("user_id, leido_hasta").eq("tipo", tipo).eq("objeto_id", id),
    admin.from("chat_miembros").select("user_id, agregado_por").eq("tipo", tipo).eq("objeto_id", id),
    participantesDe(tipo, id, sincronizar),
  ]);
  const filas = (data ?? []) as { id: string; autor_id: string; texto: string; para_area: MensajeChat["para"]; clase: MensajeChat["clase"]; created_at: string; menciones: string[] | null }[];
  const lecturas = (lecturasData ?? []) as { user_id: string; leido_hasta: string }[];
  const agregados = new Map(((agregadosData ?? []) as { user_id: string; agregado_por: string }[]).map((a) => [a.user_id, a.agregado_por]));
  const ids = [...new Set([...metidos, ...filas.map((f) => f.autor_id), ...filas.flatMap((f) => f.menciones ?? []), ...lecturas.map((l) => l.user_id), ...agregados.values()])];
  const [{ data: perfiles }, { data: accesos }] = ids.length
    ? await Promise.all([
        admin.from("perfiles").select("id, nombre, rol, es_postventa, es_almacen, es_operaciones, es_soporte").in("id", ids),
        admin.rpc("ultimo_acceso_de", { p_ids: metidos }),
      ])
    : [{ data: CHAT_VACIO }, { data: [] }];
  const quien = new Map(((perfiles ?? []) as FilaPerfil[]).map((a) => [a.id, { nombre: String(a.nombre ?? ""), area: areaDePerfil(a) }]));
  const ultimoAcceso = new Map(((accesos ?? []) as { user_id: string; ultimo: string }[]).map((a) => [a.user_id, a.ultimo]));
  const leidoHasta = new Map(lecturas.map((l) => [l.user_id, new Date(l.leido_hasta).getTime()]));
  const nombre = (u: string) => quien.get(u)?.nombre ?? "";
  return {
    tipo,
    id,
    titulo: cab.titulo,
    cerradoAt: cab.cerradoAt,
    mensajes: filas.map((f) => {
      const t = new Date(f.created_at).getTime();
      const menciones = (f.menciones ?? []).map((u) => ({ id: u, nombre: nombre(u) })).filter((m) => m.nombre);
      return {
        id: f.id,
        texto: f.texto,
        para: f.para_area,
        clase: f.clase,
        at: f.created_at,
        mio: f.autor_id === perfil.id,
        autor: nombre(f.autor_id) || "Alguien",
        area: quien.get(f.autor_id)?.area ?? "",
        // EL VISTO (Santos 23-10): quiénes ya lo leyeron y quiénes faltan, con nombre, sin contar a quien lo escribió.
        vistos: [...leidoHasta.entries()].filter(([u, h]) => u !== f.autor_id && h >= t).map(([u]) => nombre(u)).filter(Boolean),
        sinVer: metidos.filter((u) => u !== f.autor_id && (leidoHasta.get(u) ?? 0) < t).map(nombre).filter(Boolean),
        menciones,
        meMenciona: (f.menciones ?? []).includes(perfil.id),
      };
    }),
    participantes: metidos
      .map((x) => {
        const q = quien.get(x);
        if (!q) return null;
        const por = agregados.get(x);
        return { id: x, nombre: q.nombre, area: q.area, agregadoPor: por ? (nombre(por) || "alguien") : null, yo: x === perfil.id, ultimoAcceso: ultimoAcceso.get(x) ?? null };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x)),
  };
}

/** Dónde abre el chat cada quien: la pantalla del caso o del pedido, con «#chat=…» para abrirlo al llegar. */
function urlDelChat(tipo: TipoChat, id: string): string {
  return tipo === "caso" ? `/postventa/atenciones/${id}#chat=caso:${id}` : `/postventa/pedidos/${id}#chat=pedido:${id}`;
}

/** Un aviso pendiente por chat y persona: el nuevo reemplaza al anterior sin leer. */
async function avisar(destinos: Set<string>, titulo: string, cuerpo: string, url: string) {
  if (destinos.size === 0) return;
  const admin = createAdminClient();
  await admin.from("notificaciones").delete().eq("tipo", "chat_caso").eq("url", url).is("leida_at", null).in("user_id", [...destinos]);
  await Promise.all([...destinos].map((userId) => notificar({ userId, tipo: "chat_caso", titulo, cuerpo, url })));
}

export async function enviarMensajeChat(datos: { tipo: TipoChat; id: string; texto: string; menciones?: string[] }): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("enviar_mensaje_chat", {
    p_tipo: datos.tipo,
    p_id: datos.id,
    p_texto: datos.texto,
    p_para: null,
    p_clase: "mensaje",
    p_menciones: datos.menciones ?? [],
  });
  if (error) return { error: limpiar(error.message) };
  const cab = await cabecera(datos.tipo, datos.id);
  const mencionados = new Set(((data as { menciones?: string[] } | null)?.menciones ?? []).filter((u) => u !== perfil.id));
  // CANAL DE TODOS CON TODOS: cada mensaje les llega a todos los del canal, menos a quien escribe.
  // Los señalados con «@» reciben su propio aviso, que dice que los nombraron (0599).
  const destinos = new Set<string>([...(await participantesDe(datos.tipo, datos.id, false)), ...(cab?.asignado ? [cab.asignado] : [])]);
  destinos.delete(perfil.id);
  mencionados.forEach((u) => destinos.delete(u));
  const url = urlDelChat(datos.tipo, datos.id);
  const cuerpo = datos.texto.trim().slice(0, 180);
  await Promise.all([
    avisar(destinos, `💬 ${cab?.titulo ?? "Chat"} · ${perfil.nombre}`, cuerpo, url),
    avisar(mencionados, `📣 ${perfil.nombre} lo nombró (@) en ${cab?.titulo ?? "un chat"}`, cuerpo, url),
  ]);
  return { error: null };
}

/**
 * «AGREGAR A…» (Santos 23-10): sumar al canal a alguien que no está por
 * defecto —gerencia, administración, Central…— para destrabar. Le llega un
 * aviso y en el chat queda «X agregó a Y».
 */
export async function agregarAlChat(tipo: TipoChat, id: string, userId: string): Promise<{ error: string | null; nombre?: string; nuevo?: boolean }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("agregar_al_chat", { p_tipo: tipo, p_id: id, p_user: userId });
  if (error) return { error: limpiar(error.message) };
  const r = data as { nombre: string; nuevo: boolean };
  if (r.nuevo && userId !== perfil.id) {
    const cab = await cabecera(tipo, id);
    await Promise.all([
      participantesDe(tipo, id, true),
      avisar(new Set([userId]), `💬 ${perfil.nombre} lo agregó al chat de ${cab?.titulo ?? "un caso"}`, "Lo necesitan para destrabar: abra el chat para ver la conversación.", urlDelChat(tipo, id)),
    ]);
  }
  return { error: null, nombre: r.nombre, nuevo: r.nuevo };
}

/** Buscar a quién agregar o señalar con «@»: personas activas del CRM, en el mismo mundo (real / práctica). */
export async function buscarPersonasChat(texto: string): Promise<{ id: string; nombre: string; area: string }[]> {
  const perfil = await requerirPerfil();
  const q = texto.trim().replace(/[%,()*]/g, " ").trim();
  let consulta = createAdminClient()
    .from("perfiles")
    .select("id, nombre, codigo_comercial, rol, es_postventa, es_almacen, es_operaciones, es_soporte")
    .eq("activo", true)
    .eq("es_prueba", perfil.es_prueba === true)
    .is("espejo_de", null)
    .order("nombre")
    .limit(10);
  if (q) consulta = consulta.or(`nombre.ilike.*${q}*,codigo_comercial.ilike.*${q}*`);
  const { data } = await consulta;
  return ((data ?? []) as (FilaPerfil & { codigo_comercial: string | null })[]).map((p) => ({
    id: p.id,
    nombre: `${p.nombre ?? ""}${p.codigo_comercial ? ` (${p.codigo_comercial})` : ""}`,
    area: areaDePerfil(p),
  }));
}

/**
 * MIS CHATS (Santos 23-10, 0599: «debería quedarse en su sidebar como chats
 * abiertos»): los canales con conversación donde está quien mira, el más
 * reciente primero, con el último mensaje, cuántos no leyó y quiénes vieron
 * ese último mensaje. Lee con la sesión de quien mira (`mis_chats`).
 */
export async function misChats(): Promise<ChatResumen[]> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mis_chats");
  if (error || !data) return [];
  type Fila = { tipo: TipoChat; objeto_id: string; codigo: string | null; cliente: string; cerrado_at: string | null; ultimo_texto: string | null; ultimo_autor: string | null; ultimo_clase: MensajeChat["clase"] | null; ultimo_at: string | null; no_leidos: number; participantes: number };
  const filas = data as Fila[];
  if (!filas.length) return [];
  const admin = createAdminClient();
  const objetos = filas.map((f) => f.objeto_id);
  const [{ data: parts }, { data: lecturas }] = await Promise.all([
    admin.from("chat_participantes").select("tipo, objeto_id, user_id").in("objeto_id", objetos),
    admin.from("chat_lecturas").select("tipo, objeto_id, user_id, leido_hasta").in("objeto_id", objetos),
  ]);
  const ids = [...new Set([...filas.map((f) => f.ultimo_autor).filter((x): x is string => Boolean(x)), ...((parts ?? []) as { user_id: string }[]).map((p) => p.user_id), ...((lecturas ?? []) as { user_id: string }[]).map((l) => l.user_id)])];
  const { data: perfiles } = ids.length ? await admin.from("perfiles").select("id, nombre").in("id", ids) : { data: CHAT_VACIO };
  const nombre = new Map(((perfiles ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, String(p.nombre ?? "")]));
  return filas.map((f) => {
    const clave = `${f.tipo}:${f.objeto_id}`;
    const t = f.ultimo_at ? new Date(f.ultimo_at).getTime() : 0;
    const enElCanal = ((parts ?? []) as { tipo: string; objeto_id: string; user_id: string }[]).filter((p) => `${p.tipo}:${p.objeto_id}` === clave).map((p) => p.user_id);
    const hasta = new Map(((lecturas ?? []) as { tipo: string; objeto_id: string; user_id: string; leido_hasta: string }[]).filter((l) => `${l.tipo}:${l.objeto_id}` === clave).map((l) => [l.user_id, new Date(l.leido_hasta).getTime()]));
    const cliente = f.cliente.replace(/^\d{8,11}\s*-\s*/, "");
    return {
      tipo: f.tipo,
      id: f.objeto_id,
      codigo: f.codigo,
      cliente,
      titulo: `${f.codigo ?? (f.tipo === "caso" ? "Caso" : "Pedido")} · ${cliente}`,
      cerradoAt: f.cerrado_at,
      ultimo: f.ultimo_at
        ? { texto: f.ultimo_texto ?? "", autor: f.ultimo_autor ? (nombre.get(f.ultimo_autor) ?? "Alguien") : "Alguien", mio: f.ultimo_autor === perfil.id, clase: f.ultimo_clase ?? "mensaje", at: f.ultimo_at }
        : null,
      noLeidos: f.no_leidos,
      participantes: f.participantes,
      vistos: enElCanal.filter((u) => u !== f.ultimo_autor && (hasta.get(u) ?? 0) >= t).map((u) => nombre.get(u) ?? "").filter(Boolean),
      sinVer: enElCanal.filter((u) => u !== f.ultimo_autor && (hasta.get(u) ?? 0) < t).map((u) => nombre.get(u) ?? "").filter(Boolean),
    };
  });
}
