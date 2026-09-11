import { PantallaDeCarga } from "@/components/crm/pantalla-de-carga";

/**
 * La pantalla de carga de TODAS las pantallas del CRM que no tienen la suya.
 *
 * Santos, 02-09: «al navegar de un lugar a otro se demora un poco en cargar…
 * pequeños tirones». Medido: de 46 pantallas solo 9 tenían esqueleto; en las
 * otras 37 el clic no mostraba nada durante 0,5–1 s y después aparecía todo
 * de golpe. Con este archivo en la raíz del área, Next pinta algo al instante
 * en cualquier navegación y los datos lo reemplazan cuando llegan.
 *
 * 11-09: deja de ser un esqueleto gris y pasa a ser la pantalla de carga de
 * la casa —anillo, logotipo, barra— que trajo Santos. Las pantallas que
 * tienen esqueleto propio (agenda, gerencia, postventa) lo conservan: un
 * esqueleto que imita la forma de la página informa más que un logo cuando
 * la espera es de medio segundo.
 */
export default function Loading() {
  return <PantallaDeCarga />;
}
