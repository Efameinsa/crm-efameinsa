import { fechaHoraLima } from "@/lib/fechas";
import { Phone, MessageCircle, Globe, Megaphone, Camera, Mail, User, Users, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AsignarLeadDialog } from "@/components/crm/asignar-lead-dialog";
import { DescartarLeadBoton } from "@/components/crm/descartar-lead-boton";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CargaDerivacion } from "@/components/crm/carga-derivacion";

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

  const [{ data: leads }, { data: comerciales }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, codigo, canal, nombre_contacto, razon_social, telefono, num_doc, recibido_at")
      .eq("estado", "pendiente_triaje")
      .order("recibido_at", { ascending: true })
      .limit(50),
    supabase
      .from("perfiles")
      .select("id, nombre, codigo_comercial")
      .eq("rol", "comercial")
      .eq("activo", true)
      .order("nombre"),
  ]);

  return (
    <div className="space-y-4">
    <SeccionPanel
      titulo="Bandeja de triaje"
      accion={
        leads && leads.length > 0 ? (
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
            {leads.length} pendiente{leads.length === 1 ? "" : "s"}
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
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3.5 shadow-sm"
              >
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
                    telefono={lead.telefono}
                    numDoc={lead.num_doc}
                    comerciales={comerciales ?? []}
                  />
                  <DescartarLeadBoton leadId={lead.id} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SeccionPanel>
    <CargaDerivacion />
    </div>
  );
}
