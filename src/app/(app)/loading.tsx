import { EsqueletoPanel } from "@/components/crm/esqueleto-panel";

/**
 * El esqueleto de carga de TODAS las pantallas del CRM que no tienen el suyo.
 *
 * Santos, 02-09: «al navegar de un lugar a otro se demora un poco en cargar…
 * pequeños tirones». Medido: de 46 pantallas solo 9 tenían esqueleto; en las
 * otras 37 el clic no mostraba nada durante 0,5–1 s y después aparecía todo
 * de golpe. Con este archivo en la raíz del área, Next pinta la estructura
 * al instante en cualquier navegación y los datos la rellenan cuando llegan.
 * Las pantallas que ya tenían esqueleto propio (agenda, mi gestión, los
 * paneles de gerencia) conservan el suyo.
 */
export default function Loading() {
  return <EsqueletoPanel filas={2} kpis={3} />;
}
