"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requerirPerfil } from "@/lib/auth";
import { notificar } from "@/lib/notificaciones";
import { areaDePerfil, type MensajeChat, type TipoChat } from "@/lib/chat";
import { idsDePersonasDelPedido, type ServicioPostventa } from "@/lib/postventa";

/**
 * EL CHAT DE CADA CASO (Santos, 23-10; 0592/0593): un canal de coordinación
 * de todos con todos los involucrados, como un pequeño Slack. Lee con la sesión
 * de quien mira (la RLS decide si entra) y escribe solo por
 * `enviar_mensaje_chat`, que no deja escribir en un caso o pedido cerrado. Los
 * avisos los manda el servidor con la llave de servicio, uno pendiente por chat
 * y persona (el nuevo reemplaza al anterior, como los mensajes de WhatsApp).
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
  participantes: { id: string; nombre: string; area: string; agregadoPor: string | null; yo: boolean }[];
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
 * todos, los involucrados en el caso»). Quien lo lleva, quien movió algún paso
 * del caso o de su pedido / apertura de servicio, quien lo apuró o escribió, en
 * un pedido el comercial de la venta, y quienes se agregaron a mano para
 * destrabar (0593). Con la llave de servicio: el registro de acciones no lo lee
 * cualquiera, y aquí solo salen ids.
 */
async function involucrados(tipo: TipoChat, id: string, esPrueba: boolean): Promise<string[]> {
  const admin = createAdminClient();
  const ids = new Set<string>();
  const sumar = (...xs: (string | null | undefined)[]) => xs.forEach((x) => x && ids.add(x));
  let servicioId: string | null = tipo === "pedido" ? id : null;
  if (tipo === "caso") {
    const [{ data: a }, { data: reg }] = await Promise.all([
      admin.from("atenciones").select("asignado_a, tomada_por, recibido_por, servicio_id").eq("id", id).maybeSingle(),
      admin.from("registro_acciones").select("quien").eq("tabla", "atenciones").eq("fila_id", id).limit(300),
    ]);
    sumar(a?.asignado_a as string | null, a?.tomada_por as string | null, a?.recibido_por as string | null);
    ((reg ?? []) as { quien: string | null }[]).forEach((x) => sumar(x.quien));
    servicioId = (a?.servicio_id as string | null) ?? null;
  }
  if (servicioId) {
    const [{ data: s }, { data: reg }] = await Promise.all([
      admin.from("servicios_postventa").select("*, informes_cierre!servicios_postventa_informe_cierre_id_fkey(creado_por)").eq("id", servicioId).maybeSingle(),
      admin.from("registro_acciones").select("quien").eq("tabla", "servicios_postventa").eq("fila_id", servicioId).limit(300),
    ]);
    if (s) {
      sumar(...idsDePersonasDelPedido(s as unknown as ServicioPostventa), (s as { responsable_id?: string | null }).responsable_id);
      if (tipo === "pedido") sumar((s.informes_cierre as { creado_por?: string } | null)?.creado_por);
    }
    ((reg ?? []) as { quien: string | null }[]).forEach((x) => sumar(x.quien));
  }
  const col = tipo === "caso" ? "atencion_id" : "servicio_id";
  const [{ data: autores }, { data: apuros }, { data: agregados }] = await Promise.all([
    admin.from("chat_mensajes").select("autor_id").eq(col, id).limit(500),
    admin.from("apuros_del_mapa").select("enviado_por").eq(col, id).limit(200),
    admin.from("chat_miembros").select("user_id").eq("tipo", tipo).eq("objeto_id", id),
  ]);
  ((autores ?? []) as { autor_id: string }[]).forEach((x) => sumar(x.autor_id));
  ((apuros ?? []) as { enviado_por: string }[]).forEach((x) => sumar(x.enviado_por));
  ((agregados ?? []) as { user_id: string }[]).forEach((x) => sumar(x.user_id));
  if (!ids.size) return [];
  // Solo personas activas del mismo mundo (real / práctica) y no las cuentas espejo que solo miran.
  const { data: vivos } = await admin.from("perfiles").select("id").in("id", [...ids]).eq("activo", true).eq("es_prueba", esPrueba).is("espejo_de", null);
  return (vivos ?? []).map((p) => p.id as string);
}

export async function cargarChat(tipo: TipoChat, id: string, marcarLeido = true): Promise<DatosChat | null> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const cab = await cabecera(tipo, id);
  if (!cab) return null;
  // Solo cuenta como leído si quien mira tiene el chat abierto y a la vista.
  if (marcarLeido) await supabase.rpc("marcar_chat_leido", { p_tipo: tipo, p_id: id });
  const admin = createAdminClient();
  const [{ data }, { data: lecturasData }, { data: agregadosData }] = await Promise.all([
    supabase
      .from("chat_mensajes")
      .select("id, autor_id, texto, para_area, clase, created_at")
      .eq(tipo === "caso" ? "atencion_id" : "servicio_id", id)
      .order("created_at")
      .limit(500),
    // Los vistos y los agregados con la llave de servicio: solo nombres y horas, nada secreto.
    admin.from("chat_lecturas").select("user_id, leido_hasta").eq("tipo", tipo).eq("objeto_id", id),
    admin.from("chat_miembros").select("user_id, agregado_por").eq("tipo", tipo).eq("objeto_id", id),
  ]);
  const filas = (data ?? []) as { id: string; autor_id: string; texto: string; para_area: MensajeChat["para"]; clase: MensajeChat["clase"]; created_at: string }[];
  const lecturas = (lecturasData ?? []) as { user_id: string; leido_hasta: string }[];
  const agregados = new Map(((agregadosData ?? []) as { user_id: string; agregado_por: string }[]).map((a) => [a.user_id, a.agregado_por]));
  const metidos = await involucrados(tipo, id, perfil.es_prueba === true);
  const ids = [...new Set([...metidos, ...filas.map((f) => f.autor_id), ...lecturas.map((l) => l.user_id), ...agregados.values()])];
  const { data: perfiles } = ids.length
    ? await admin.from("perfiles").select("id, nombre, rol, es_postventa, es_almacen, es_operaciones, es_soporte").in("id", ids)
    : { data: [] };
  const quien = new Map(((perfiles ?? []) as FilaPerfil[]).map((a) => [a.id, { nombre: String(a.nombre ?? ""), area: areaDePerfil(a) }]));
  const leidoHasta = [...new Map(lecturas.map((l) => [l.user_id, new Date(l.leido_hasta).getTime()])).entries()];
  return {
    tipo,
    id,
    titulo: cab.titulo,
    cerradoAt: cab.cerradoAt,
    mensajes: filas.map((f) => {
      const t = new Date(f.created_at).getTime();
      return {
        id: f.id,
        texto: f.texto,
        para: f.para_area,
        clase: f.clase,
        at: f.created_at,
        mio: f.autor_id === perfil.id,
        autor: quien.get(f.autor_id)?.nombre ?? "Alguien",
        area: quien.get(f.autor_id)?.area ?? "",
        // EL VISTO (Santos 23-10): quiénes ya lo leyeron, sin contar a quien lo escribió.
        vistos: leidoHasta
          .filter(([u, h]) => u !== f.autor_id && h >= t)
          .map(([u]) => quien.get(u)?.nombre ?? "")
          .filter(Boolean),
      };
    }),
    participantes: metidos
      .map((x) => {
        const q = quien.get(x);
        if (!q) return null;
        const por = agregados.get(x);
        return { id: x, nombre: q.nombre, area: q.area, agregadoPor: por ? (quien.get(por)?.nombre ?? "alguien") : null, yo: x === perfil.id };
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

export async function enviarMensajeChat(datos: { tipo: TipoChat; id: string; texto: string }): Promise<{ error: string | null }> {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { error } = await supabase.rpc("enviar_mensaje_chat", { p_tipo: datos.tipo, p_id: datos.id, p_texto: datos.texto, p_para: null, p_clase: "mensaje" });
  if (error) return { error: limpiar(error.message) };
  const cab = await cabecera(datos.tipo, datos.id);
  // CANAL DE TODOS CON TODOS: cada mensaje les llega a todos los del canal, menos a quien escribe.
  const destinos = new Set<string>([...(await involucrados(datos.tipo, datos.id, perfil.es_prueba === true)), ...(cab?.asignado ? [cab.asignado] : [])]);
  destinos.delete(perfil.id);
  await avisar(destinos, `💬 ${cab?.titulo ?? "Chat"} · ${perfil.nombre}`, datos.texto.trim().slice(0, 180), urlDelChat(datos.tipo, datos.id));
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
    await avisar(new Set([userId]), `💬 ${perfil.nombre} lo agregó al chat de ${cab?.titulo ?? "un caso"}`, "Lo necesitan para destrabar: abra el chat para ver la conversación.", urlDelChat(tipo, id));
  }
  return { error: null, nombre: r.nombre, nuevo: r.nuevo };
}

/** Buscar a quién agregar: personas activas del CRM, en el mismo mundo (real / práctica). */
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
