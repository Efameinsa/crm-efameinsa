import { PantallaDeCarga } from "@/components/crm/pantalla-de-carga";

// Se ve al entrar y al cambiar entre «Mi cartera» y «Toda la empresa», que son
// las dos únicas veces que esta pantalla vuelve al servidor (11-09).
export default function Loading() {
  return <PantallaDeCarga mensaje="Armando las ventas de la empresa" />;
}
