import { notFound } from "next/navigation";
import { requerirPerfil } from "@/lib/auth";
import { conversacionesDe, conversacionPorId, mensajesDe, comercialesActivos, contarChatsNoLeidos, type FiltroConversaciones } from "@/lib/acciones/whatsapp-chat";
import { tipificacionesActuales } from "@/lib/acciones/whatsapp-campanas";
import { createClient } from "@/lib/supabase/server";
import type { Oportunidad } from "@/types/database";
import { WhatsappListaConversaciones } from "@/components/crm/whatsapp-lista-conversaciones";
import { WhatsappHilo } from "@/components/crm/whatsapp-hilo";
import { esMarcaWhatsapp } from "@/lib/gestion-whatsapp";

export const dynamic = "force-dynamic";

export default async function WhatsappConversacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ filtro?: string; comercial?: string }>;
}) {
  const perfil = await requerirPerfil();
  const { id } = await params;
  const sp = await searchParams;
  const filtro = (["no_leidos", "sin_atender", "mias", "todas", "cerradas"].includes(sp.filtro ?? "") ? sp.filtro : "todas") as FiltroConversaciones;
  const esCentral = perfil.rol === "central" || perfil.rol === "gerencia" || perfil.rol === "admin";

  // Santos, 21-09: «quiero que cargue más rápido… la opción de productos se
  // demora bastante». El botón «Mandar equipo» se quitó del chat; los
  // stickers (URL firmadas una por una) los trae el panel al abrirse.
  const [conversacion, mensajes, conversaciones, comerciales, chatsNoLeidos] = await Promise.all([
    conversacionPorId(id),
    mensajesDe(id),
    conversacionesDe(filtro, esCentral ? sp.comercial : undefined, id),
    comercialesActivos(),
    contarChatsNoLeidos(esCentral ? sp.comercial : undefined),
  ]);

  if (!conversacion) notFound();
  const [tipificacionActual, tipificados, expediente, gestiones] = await Promise.all([
    conversacion.lead_id ? tipificacionesActuales([conversacion.lead_id]).then((t) => t[0] ?? null) : Promise.resolve(null),
    tipificacionesActuales(conversaciones.map((c) => c.lead_id).filter((x): x is string => Boolean(x))),
    // El interés de compra, para preguntarlo al marcar «Interesado» (30-09):
    // solo si el expediente es de quien mira, el único que puede calificarlo.
    conversacion.oportunidad_id
      ? createClient().then((sb) =>
          sb.from("oportunidades").select("intencion, comercial_id").eq("id", conversacion.oportunidad_id!).maybeSingle().then((r) => r.data),
        )
      : Promise.resolve(null),
    // ¿Ya se anotó en el expediente lo que se habló? (05-10, gerencia: el
    // botón del resultado no basta, tiene que quedar qué se dijo). Las marcas
    // de los botones («Por WhatsApp: …») no cuentan como gestión.
    conversacion.oportunidad_id
      ? createClient().then((sb) =>
          sb
            .from("actividades")
            .select("tipo, nota, realizada_at")
            .eq("oportunidad_id", conversacion.oportunidad_id!)
            .order("realizada_at", { ascending: false })
            .limit(15)
            .then((r) => r.data ?? []),
        )
      : Promise.resolve([]),
  ]);
  // Solo cuenta lo anotado desde que empezó este chat: una gestión de meses
  // atrás no dice nada de esta conversación.
  const inicioChat = mensajes[0]?.created_at ?? null;
  const gestionEnExpediente =
    gestiones.find((g) => !esMarcaWhatsapp(g.tipo, g.nota) && (!inicioChat || g.realizada_at >= inicioChat)) ?? null;
  const intencionActual = expediente && expediente.comercial_id === perfil.id ? (expediente.intencion as Oportunidad["intencion"]) : null;

  return (
    <div className="flex h-[calc(100dvh-11.5rem)] overflow-hidden rounded-lg border border-border bg-card md:h-[calc(100dvh-8.5rem)]">
      <div className="hidden w-full md:block md:max-w-sm">
        <WhatsappListaConversaciones
          conversaciones={conversaciones}
          filtroActivo={filtro}
          idActivo={id}
          comerciales={esCentral ? comerciales : undefined}
          comercialActivo={sp.comercial}
          leadsTipificados={tipificados.map((t) => t.lead_id)}
          chatsNoLeidos={chatsNoLeidos}
        />
      </div>
      <WhatsappHilo
        key={conversacion.id}
        conversacion={conversacion}
        mensajesIniciales={mensajes}
        esCentral={esCentral}
        comerciales={comerciales}
        tipificacionActual={tipificacionActual}
        intencionActual={intencionActual}
        gestionEnExpediente={gestionEnExpediente ? { tipo: gestionEnExpediente.tipo, realizada_at: gestionEnExpediente.realizada_at } : null}
      />
    </div>
  );
}
