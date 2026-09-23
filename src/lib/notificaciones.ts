import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RolUsuario } from "@/types/database";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export type TipoNotificacion =
  | "lead_asignado"
  | "cotizacion_pendiente"
  | "cotizacion_aprobada"
  | "cotizacion_rechazada"
  | "lead_registrado"
  // Se usó el código que dictó operaciones o gerencia: quien autorizó tiene que
  // enterarse de para qué sirvió (migración 0123).
  | "cotizacion_corregida"
  // Central avisa que un cliente está esperando y nadie lo atiende (25-08).
  | "urgencia"
  // El cliente que ya está en manos de alguien volvió a escribir a Central
  // (0215, 10-09). NO es un contacto nuevo y se dice distinto a propósito: el
  // reclamo de C5 fue justamente que le "asignaban de nuevo algo ya
  // gestionado". Esto no asigna nada; le cuenta que su cliente insistió.
  | "cliente_volvio"
  // Central devolvió un cierre mal hecho, y el comercial lo devolvió corregido
  // (0178, Carlos 05-09: «tendrías que rechazarlo y que lo haga bien»).
  | "cierre_devuelto"
  | "cierre_corregido"
  // Postventa y el almacén se avisan entre sí lo que le toca al otro (0246).
  | "almacen"
  // Finanzas confirma sus propios pagos (0279, gerencia 23-09).
  | "finanzas"
  // Lo que ya existía sin tipo propio: la anulación (0237) y la visita (0238).
  | "cierre_anulado"
  | "visita_planta"
  // El cliente tocó un botón en una ficha mandada por WhatsApp (0250).
  | "whatsapp";

interface Destinatario {
  userId?: string;
  rol?: RolUsuario;
}

interface DatosNotificacion extends Destinatario {
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo?: string;
  url?: string;
}

// Se llama desde las server actions tras el evento de negocio (asignar lead,
// crear/aprobar/rechazar cotización). Nunca debe romper la acción que la
// dispara: cualquier fallo de push queda solo en el log del servidor — la
// fila en `notificaciones` (fuente de verdad para la campana) sí se exige.
export async function notificar(datos: DatosNotificacion): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.rpc("crear_notificacion", {
    p_user_id: datos.userId ?? null,
    p_rol: datos.rol ?? null,
    p_tipo: datos.tipo,
    p_titulo: datos.titulo,
    p_cuerpo: datos.cuerpo ?? null,
    p_url: datos.url ?? null,
  });
  if (error) {
    console.error("notificar(): fallo al insertar notificación", error.message);
    return;
  }

  try {
    let userIds: string[];
    if (datos.userId) {
      userIds = [datos.userId];
    } else {
      const { data } = await admin.from("perfiles").select("id").eq("rol", datos.rol).eq("activo", true);
      userIds = (data ?? []).map((p) => p.id);
    }
    await Promise.all(userIds.map((id) => enviarPush(id, datos)));
  } catch (err) {
    console.error("notificar(): fallo al enviar push", err);
  }
}

async function enviarPush(userId: string, datos: DatosNotificacion): Promise<void> {
  const admin = createAdminClient();
  const { data: suscripciones } = await admin
    .from("push_suscripciones")
    .select("id, endpoint, claves")
    .eq("user_id", userId);

  if (!suscripciones || suscripciones.length === 0) return;

  // `tipo` viaja desde el 31-08-2026 para que el service worker pueda tratar
  // distinto lo que es distinto: una urgencia de Central se queda en pantalla
  // hasta que la toquen (`requireInteraction`), igual que la ventanita dentro
  // del CRM; el resto se va solo y se agrupa por destino para no apilar diez
  // avisos del mismo sitio.
  const payload = JSON.stringify({
    title: datos.titulo,
    body: datos.cuerpo ?? "",
    url: datos.url ?? "/",
    tipo: datos.tipo,
  });

  await Promise.all(
    suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.claves as { p256dh: string; auth: string } },
          payload,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Suscripción caducada (el navegador la dio de baja) — limpiar.
          await admin.from("push_suscripciones").delete().eq("id", s.id);
        } else {
          console.error("enviarPush(): fallo de envío", err);
        }
      }
    }),
  );
}

// Un lead que entra por ingesta automática (Google/Meta Lead Ads, formulario
// web) necesita DOS avisos distintos, no uno:
//   · Central  → es quien tiene que actuar: revisar y asignar a un comercial.
//                Sin este aviso el lead se queda en la bandeja hasta que
//                alguien entre a mirar por casualidad — justo la demora que
//                gerencia señaló como problema en la demo.
//   · Gerencia → visibilidad inmediata, antes de que se derive (acuerdo de
//                la reunión del 14-08, evento `lead_registrado`).
// El aviso a Central apunta a su bandeja; el de gerencia, a su panel.
export async function notificarLeadEntrante(datos: {
  titulo: string;
  cuerpo: string;
}): Promise<void> {
  await Promise.all([
    notificar({ rol: "central", tipo: "lead_registrado", titulo: datos.titulo, cuerpo: datos.cuerpo, url: "/central" }),
    notificar({ rol: "gerencia", tipo: "lead_registrado", titulo: datos.titulo, cuerpo: datos.cuerpo, url: "/gerencia" }),
  ]);
}

/**
 * Un aviso a la cuenta del almacén (0246): «que me lleguen las aperturas, que
 * me lleguen las visitas, me tienen que llegar los reportes técnicos» (Lesly,
 * 16-09). Se separa por serie: lo de práctica no le llega al almacén real.
 */
export async function notificarAlmacen(datos: { titulo: string; cuerpo?: string; url?: string; esPrueba?: boolean }): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfiles")
    .select("id")
    .eq("es_almacen", true)
    .eq("activo", true)
    .eq("es_prueba", datos.esPrueba === true);
  await Promise.all(
    (data ?? []).map((p) => notificar({ userId: p.id, tipo: "almacen", titulo: datos.titulo, cuerpo: datos.cuerpo, url: datos.url })),
  );
}

/**
 * Un aviso a Finanzas (0279): John confirma él mismo los pagos (gerencia,
 * 23-09). Le suena cuando Central libera un pedido y cuando Central le deriva
 * algo, que antes le llegaba solo por WhatsApp y correo.
 */
export async function notificarFinanzas(datos: { titulo: string; cuerpo?: string; url?: string; esPrueba?: boolean }): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfiles")
    .select("id")
    .eq("rol", "finanzas")
    .eq("activo", true)
    .eq("es_prueba", datos.esPrueba === true);
  await Promise.all(
    (data ?? []).map((p) => notificar({ userId: p.id, tipo: "finanzas", titulo: datos.titulo, cuerpo: datos.cuerpo, url: datos.url })),
  );
}

/**
 * Un aviso a Central (0290): las series que pidió al almacén ya están, o
 * Finanzas subió la liquidación. Separado por serie como los demás: lo de
 * práctica no le llega a la Central real.
 */
export async function notificarCentral(datos: { titulo: string; cuerpo?: string; url?: string; esPrueba?: boolean }): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("perfiles")
    .select("id")
    .eq("rol", "central")
    .eq("activo", true)
    .eq("es_prueba", datos.esPrueba === true);
  await Promise.all(
    (data ?? []).map((p) => notificar({ userId: p.id, tipo: "almacen", titulo: datos.titulo, cuerpo: datos.cuerpo, url: datos.url })),
  );
}
