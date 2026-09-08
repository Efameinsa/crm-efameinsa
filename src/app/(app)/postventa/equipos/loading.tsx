import { EsqueletoPanel } from "@/components/crm/esqueleto-panel";

// Una pantalla que tarda dos segundos sin decir nada se siente rota: se vuelve
// a hacer clic, se piensa que no cargó. Next muestra esto al instante mientras
// el servidor arma la página (Santos, 08-09, sobre «Preventivos por vender»).
export default function Loading() {
  return <EsqueletoPanel filas={2} kpis={4} />;
}
