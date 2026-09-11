import { PantallaDeCarga } from "@/components/crm/pantalla-de-carga";

/**
 * Lo que se ve mientras arranca lo que está fuera del CRM (la entrada, la
 * puerta de auditoría): la pantalla de carga de la casa, a pantalla completa.
 */
export default function Loading() {
  return <PantallaDeCarga completa mensaje="Entrando al CRM" />;
}
