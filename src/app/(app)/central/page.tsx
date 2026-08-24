import { fechaHoraLima } from "@/lib/fechas";
import { Phone, MessageCircle, Globe, Megaphone, Camera, Mail, User, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AsignarLeadDialog } from "@/components/crm/asignar-lead-dialog";
import { DescartarLeadBoton } from "@/components/crm/descartar-lead-boton";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CargaDerivacion } from "@/components/crm/carga-derivacion";
import { CargaCotizaciones } from "@/components/crm/carga-cotizaciones";
import { SolicitudLead } from "@/components/crm/solicitud-lead";
import { ConsolidadoCentral } from "@/components/crm/consolidado-central";
import { DerivadosOtrasAreas } from "@/components/crm/derivados-otras-areas";

// La bandeja tiene que mostrar lo que acaba de entrar: sin esto Next servía
// una versión cacheada y un contacto recién registrado no aparecía hasta que
// algo más invalidara la página.
export const dynamic = "force-dynamic";

// Tope de la bandeja. Alto a propósito: recortar la cola de triaje sin avisar
// es lo que dejaba invisibles los contactos del día.
const TOPE_BANDEJA = 300;

const ICONO_CANAL: Record<string, LucideIcon> = {
  whatsapp: MessageCircle,
  llamada: Phone,
  formulario_web: Globe,
  facebook: Megaphone,
  instagram: Camera,
  email: Mail,
  presencial: User,
  referido: Users,
  otro: Globe,
};

const ETIQUETA_CANAL: Record<string, string> = {
  whatsapp: "WhatsApp",
  llamada: "Llamada",
  formulario_web: "Formulario web",
  facebook: "Facebook",
  instagram: "Instagram",
  email: "Correo",
  presencial: "Presencial",
  referido: "Referido",
  otro: "Otro",
};

export default async function CentralPage() {
  const supabase = await createClient();

  const [{ data: leads, count: totalPendientes }, { data: comerciales }, { data: derivados }] = await Promise.all([
    // ⚠️ El orden es de MÁS ANTIGUO a más nuevo a propósito: la cola se atiende
    // por antigüedad, que es de lo que se trata bajar las 36 horas de
    // asignación. Pero con `limit(50)` y 62 pendientes, los 12 más recientes
    // —o sea, TODO lo que entraba hoy— quedaban fuera de la consulta y Central
    // no los veía nunca. Se pide el conteo exacto y un tope que no recorte en
    // silencio; si algún día se pasa, la pantalla lo dice.
    supabase
      .from("leads")
      .select(
        "id, codigo, canal, nombre_contacto, razon_social, telefono, num_doc, email, mensaje, utm_campaign, recibido_at",
        { count: "exact" },
      )
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: true })
      .limit(TOPE_BANDEJA),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial, codigo_anterior")
      .eq("rol", "comercial")
      .eq("activo", true)
      .order("nombre"),
    // Red de seguridad, ya no una función de la pantalla. El ing. Carlos quitó
    // la opción de derivar a otras áreas el 24-08 («que no tenga la opción de
    // otras áreas»; lo no comercial se queda en el ERP), así que Central no
    // puede volver a crear uno de estos desde el formulario.
    //
    // Pero la API pública /api/leads todavía acepta `area_destino`, y un
    // contacto en ese estado no aparece en ninguna otra pantalla: fue así como
    // el 24-08 se perdió un prospecto que pedía cotización de equipos. Se
    // sigue consultando y el panel se muestra SOLO si hay algo — en operación
    // normal no está, y si alguna vez entra uno, se ve y se puede devolver.
    supabase
      .from("leads")
      .select("id, codigo, canal, area_destino, nombre_contacto, razon_social, mensaje, recibido_at")
      .eq("estado", "derivado_area")
      .order("recibido_at", { ascending: false })
      .limit(50),
  ]);

  return (
    <div className="space-y-4">
    <SeccionPanel
      titulo="Bandeja de triaje"
      accion={
        leads && leads.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {(totalPendientes ?? leads.length).toLocaleString("es-PE")} pendiente
            {(totalPendientes ?? leads.length) === 1 ? "" : "s"}
          </span>
        ) : undefined
      }
    >
      {!leads || leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay contactos comerciales pendientes de asignar.</p>
      ) : (
        <div className="space-y-2">
          {leads.map((lead) => {
            const Icono = ICONO_CANAL[lead.canal] ?? Globe;
            return (
              <div
                key={lead.id}
                className="rounded-lg border border-border bg-background p-3.5 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-full bg-secondary text-foreground">
                    <Icono className="size-4" />
                  </span>
                  <div className="min-w-[180px] flex-1">
                    <p className="text-sm font-semibold text-foreground">{lead.nombre_contacto ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {lead.razon_social ?? "Sin razón social"} · {ETIQUETA_CANAL[lead.canal] ?? lead.canal}
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{lead.codigo}</span>
                    <br />
                    {fechaHoraLima(lead.recibido_at)}
                  </div>
                  <div className="ml-auto flex gap-2">
                    <AsignarLeadDialog
                      leadId={lead.id}
                      nombre={lead.nombre_contacto}
                      razonSocial={lead.razon_social}
                      telefono={lead.telefono}
                      numDoc={lead.num_doc}
                      email={lead.email}
                      mensaje={lead.mensaje}
                      comerciales={comerciales ?? []}
                    />
                    <DescartarLeadBoton leadId={lead.id} />
                  </div>
                </div>

                {/* QUÉ PIDIÓ el prospecto. El dato siempre se guardó en
                    leads.mensaje pero no se mostraba en ninguna pantalla, así
                    que Central derivaba a ciegas y el comercial recibía un
                    nombre y un teléfono. Brenda lo pidió el primer día de uso:
                    «necesito ver el detalle de la solicitud de cada prospecto
                    nuevo, ya que cada uno tiene diferente interés de compra». */}
                <SolicitudLead mensaje={lead.mensaje} campania={lead.utm_campaign} />
              </div>
            );
          })}
        </div>
      )}
      {leads && totalPendientes != null && totalPendientes > leads.length && (
        <p className="mt-3 text-xs text-amber-700">
          Se muestran los {leads.length} más antiguos de {totalPendientes.toLocaleString("es-PE")}. Al asignar o
          descartar, aparecen los siguientes.
        </p>
      )}
    </SeccionPanel>
    {derivados && derivados.length > 0 && <DerivadosOtrasAreas leads={derivados} />}
    <ConsolidadoCentral />
    <CargaDerivacion />
    <CargaCotizaciones />
    </div>
  );
}
