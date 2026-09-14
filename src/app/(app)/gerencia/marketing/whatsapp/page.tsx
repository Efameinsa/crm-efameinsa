import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/periodo";
import { fechaCalendarioLarga } from "@/lib/fechas";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { WhatsappCampanasTabla } from "@/components/crm/whatsapp-campanas-tabla";
import { WhatsappStickersTabla } from "@/components/crm/whatsapp-stickers-tabla";
import { listarCampaniasWhatsapp } from "@/lib/acciones/whatsapp-campanas";
import { listarStickers } from "@/lib/acciones/whatsapp-chat";
import { cargarResumenWhatsapp, ETIQUETA_TIPIFICACION, type TipificacionWhatsapp } from "@/lib/whatsapp-marketing";

// WhatsApp de campañas, fase 1 sin API (14-09-2026). Plan completo en
// Downloads/plan-whatsapp-api-crm.md — PENDIENTE DE APROBACIÓN DE GERENCIA
// PARA DESPLEGAR. Esta pantalla junta las dos cosas que hacen falta para
// arrancar sin la Cloud API: administrar los códigos del mensaje prellenado
// y ver qué pasó con cada uno, para retroalimentar a Meta.
export const dynamic = "force-dynamic";

const ETIQUETA_PLATAFORMA: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", otro: "Otro" };

export default async function MarketingWhatsappPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "mes");
  const { desde, hasta } = periodo;

  const supabase = await createClient();
  const [campanias, resumen, stickers] = await Promise.all([
    listarCampaniasWhatsapp(),
    cargarResumenWhatsapp(supabase, desde, hasta),
    listarStickers(),
  ]);
  const rango = `desde=${desde}&hasta=${hasta}`;
  const totalInteresados = resumen.reduce((s, r) => s + (r.porEstado.interesado ?? 0) + (r.porEstado.cotizado ?? 0), 0);
  const totalExcluir = resumen.reduce((s, r) => s + (r.porEstado.no_interesado ?? 0) + (r.porEstado.equivocado ?? 0), 0);

  return (
    <div className="space-y-4">
      <p className="px-1 text-xs text-muted-foreground">
        <Link href="/gerencia/marketing" className="underline decoration-dotted underline-offset-2 hover:decoration-solid">
          ← Volver a Marketing
        </Link>
      </p>

      <SeccionPanel titulo="Códigos de campaña de WhatsApp">
        <p className="mb-3 text-xs text-muted-foreground">
          Cada anuncio de WhatsApp lleva su propio mensaje prellenado terminado en un código corto —por ejemplo,
          «Hola, vi su anuncio y quiero información. [M1-A]»—. Central y los comerciales eligen el código de esta
          lista al registrar el contacto; nunca lo tipean, para que el informe de abajo y el chip de origen siempre
          casen con un anuncio real.
        </p>
        <WhatsappCampanasTabla campanias={campanias} />
      </SeccionPanel>

      <SeccionPanel titulo="Stickers de la empresa">
        <p className="mb-3 text-xs text-muted-foreground">
          Se cargan una vez acá —cualquier imagen sirve, se convierte sola a lo único que WhatsApp acepta como sticker
          (WebP cuadrado, 512×512, menos de 100 KB)— y desde el chat solo se elige uno para mandarlo.
        </p>
        <WhatsappStickersTabla stickers={stickers} />
      </SeccionPanel>

      <FiltroPeriodo {...periodo} presetActivo={periodo.preset} presets={["mes", "mes_anterior", "30d", "90d", "anio"]} />
      <p className="px-1 text-xs text-muted-foreground">
        Del <span className="font-medium text-foreground">{fechaCalendarioLarga(desde)}</span> al{" "}
        <span className="font-medium text-foreground">{fechaCalendarioLarga(hasta)}</span>
      </p>

      {resumen.length === 0 ? (
        <SeccionPanel titulo="Sin contactos todavía">
          <p className="text-sm text-muted-foreground">
            Nadie registró un WhatsApp con código de campaña en este período. Se registran con el botón «Pasar
            contacto a Central» (comerciales) o en la captura de Central, eligiendo el código del anuncio.
          </p>
        </SeccionPanel>
      ) : (
        <SeccionPanel titulo="Qué pasó con cada campaña">
          <div className="space-y-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 pr-3 font-medium">Código</th>
                  <th className="py-1.5 pr-3 font-medium">Campaña</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Total</th>
                  {(["interesado", "cotizado", "no_interesado", "equivocado", "sin_respuesta"] as TipificacionWhatsapp[]).map((e) => (
                    <th key={e} className="py-1.5 pr-3 text-right font-medium">
                      {ETIQUETA_TIPIFICACION[e]}
                    </th>
                  ))}
                  <th className="py-1.5 text-right font-medium">Sin marcar</th>
                </tr>
              </thead>
              <tbody>
                {resumen.map((r) => (
                  <tr key={r.codigo} className="border-b border-border/60">
                    <td className="py-1.5 pr-3 font-mono font-semibold text-foreground">{r.codigo}</td>
                    <td className="py-1.5 pr-3 text-muted-foreground">
                      {r.nombre} <span className="text-[10px] opacity-70">({ETIQUETA_PLATAFORMA[r.plataforma]})</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right font-semibold tabular-nums text-foreground">{r.total}</td>
                    {(["interesado", "cotizado", "no_interesado", "equivocado", "sin_respuesta"] as TipificacionWhatsapp[]).map((e) => (
                      <td key={e} className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">
                        {r.porEstado[e] ?? 0}
                      </td>
                    ))}
                    <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.sinTipificar}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex flex-wrap gap-2 pt-1">
              <a
                href={`/api/marketing/whatsapp-publicos?tipo=interesados&${rango}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-secondary"
              >
                <Download className="size-3.5" /> Público «Interesados» para Meta ({totalInteresados})
              </a>
              <a
                href={`/api/marketing/whatsapp-publicos?tipo=excluir&${rango}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
              >
                <Download className="size-3.5" /> Lista de exclusión ({totalExcluir})
              </a>
            </div>
            <p className="text-[11px] leading-snug text-muted-foreground">
              Meta → Públicos → Crear público personalizado → Lista de clientes → subir el CSV de «Interesados» (y su
              similar al 1 %); la lista de exclusión se agrega como exclusión en el conjunto de anuncios, para no
              volver a pagarle el mismo anuncio a quien ya dijo que no. Meta cifra los teléfonos y correos al
              subirlos.
            </p>
          </div>
        </SeccionPanel>
      )}
    </div>
  );
}
