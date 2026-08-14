import { SeccionPanel } from "@/components/crm/seccion-panel";
import { CapturaForm } from "./captura-form";

export default function CapturaPage() {
  return (
    <SeccionPanel titulo="Registrar contacto">
      <CapturaForm />
    </SeccionPanel>
  );
}
