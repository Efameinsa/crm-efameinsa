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
  | "urgencia";

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
    await Promise.all(userIds.map((id) => enviarPush(id, datos.titulo, datos.cuerpo, datos.url)));
  } catch (err) {
    console.error("notificar(): fallo al enviar push", err);
  }
}

async function enviarPush(userId: string, titulo: string, cuerpo?: string, url?: string): Promise<void> {
  const admin = createAdminClient();
  const { data: suscripciones } = await admin
    .from("push_suscripciones")
    .select("id, endpoint, claves")
    .eq("user_id", userId);

  if (!suscripciones || suscripciones.length === 0) return;

  const payload = JSON.stringify({ title: titulo, body: cuerpo ?? "", url: url ?? "/" });

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
