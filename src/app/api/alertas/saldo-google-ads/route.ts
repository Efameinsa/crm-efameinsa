import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notificar } from "@/lib/notificaciones";
import { enviarCorreoN8n } from "@/lib/avisos-n8n";
import { armarAviso } from "@/lib/correo/aviso";
import { enlaceApp } from "@/lib/url-app";
import { cargarSaldoGoogleAds } from "@/lib/saldo-ads-datos";

// LA ALERTA DE SALDO DE GOOGLE ADS (gerencia 07-10, Santos 09-10: «me avisa
// cuando me quede para menos de un día y me salga en notificación de admin del
// CRM y correo a gestion1@efameinsa.com»). Ya nos castigó quedarnos sin saldo.
//
// La llama un temporizador de la VM cada 30 minutos (crm-saldo-google-ads.timer).
// UNA alerta por recarga: se guarda el último movimiento avisado y solo una
// recarga o corrección nueva la vuelve a armar.
// Protegido con el mismo Bearer que los crons (CRON_SECRET).

const CORREO_ALERTA = "gestion1@efameinsa.com";

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const horaLima = (iso: string) =>
  new Date(iso).toLocaleString("es-PE", { timeZone: "America/Lima", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const soloVer = request.nextUrl.searchParams.get("ver") === "1";

  const admin = createAdminClient();
  const { tope, estado, alertaMovimientoId } = await cargarSaldoGoogleAds(admin);
  const resumen = { saldo: estado.saldo, tope, dias: Math.round(estado.diasRestantes * 100) / 100, agotamiento: estado.agotamientoAt };
  if (soloVer || estado.sinDatos || !estado.menosDeUnDia) return NextResponse.json({ ...resumen, avisado: false });
  if (alertaMovimientoId && alertaMovimientoId === estado.ultimoMovimientoId) return NextResponse.json({ ...resumen, avisado: false, ya_avisado: true });

  // Se marca ANTES de avisar: si dos corridas se cruzan, avisa una sola.
  const { data: marcado } = await admin
    .from("ads_saldo_config")
    .update({ alerta_movimiento_id: estado.ultimoMovimientoId, alerta_at: new Date().toISOString() })
    .eq("plataforma", "google")
    .or(alertaMovimientoId ? `alerta_movimiento_id.is.null,alerta_movimiento_id.eq.${alertaMovimientoId}` : "alerta_movimiento_id.is.null")
    .select("plataforma");
  if (!marcado?.length) return NextResponse.json({ ...resumen, avisado: false, ya_avisado: true });

  const titulo = estado.saldo <= 0 ? "Google Ads se quedó sin saldo (estimado)" : "Google Ads: queda menos de un día de saldo";
  const cuerpo =
    estado.saldo <= 0
      ? `Según las recargas anotadas y el tope de ${soles(tope)} diarios, el saldo ya se habría acabado. Recargue para que los anuncios no se apaguen y anote la recarga en el CRM.`
      : `Quedan unos ${soles(estado.saldo)} (tope ${soles(tope)} diarios): alcanza hasta el ${horaLima(estado.agotamientoAt!)} aprox. Recargue antes para no perder la posición y anote la recarga en el CRM.`;
  const url = "/gerencia/marketing#saldo-google-ads";

  await notificar({ rol: "admin", tipo: "saldo_ads", titulo, cuerpo, url });
  const correo = await enviarCorreoN8n({
    para: CORREO_ALERTA,
    asunto: `⚠ ${titulo}`,
    html: armarAviso({
      empresa: "EFAMEINSA",
      paraArea: "Marketing",
      titulo,
      cuerpo,
      enlace: enlaceApp(url),
      tabla: [
        { etiqueta: "Saldo estimado", valor: soles(estado.saldo) },
        { etiqueta: "Tope diario", valor: soles(tope) },
        ...(estado.agotamientoAt ? [{ etiqueta: "Se acabaría", valor: horaLima(estado.agotamientoAt) }] : []),
      ],
    }),
  });
  return NextResponse.json({ ...resumen, avisado: true, correo: correo.error ?? correo.por });
}
