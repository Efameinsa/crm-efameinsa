import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CapturaForm } from "./captura-form";
import { campaniasWhatsappActivas } from "@/lib/acciones/whatsapp-campanas";

export default async function CapturaPage() {
  // Fase 1 del WhatsApp de campañas (14-09-2026): la lista de códigos activos
  // se trae una sola vez acá, no en el formulario — así el cliente no hace su
  // propia consulta a la base cada vez que se abre el diálogo.
  const campaniasWhatsapp = await campaniasWhatsappActivas();
  return (
    <SeccionPanel titulo="Registrar contacto">
      <CapturaForm campaniasWhatsapp={campaniasWhatsapp} />
    </SeccionPanel>
  );
}
