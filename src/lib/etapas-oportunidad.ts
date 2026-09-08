import type { EtapaOportunidad } from "@/types/database";

/**
 * LAS ETAPAS QUE SE PUEDEN PONER A MANO.
 *
 * `cotizada` y `venta` NO están, y esa ausencia es la regla que protege las
 * cifras: una venta tiene que nacer del botón «Registrar venta» —que crea la
 * fila en `ventas`, acepta la cotización y mueve la etapa sola—, nunca de
 * alguien eligiéndola en un desplegable.
 *
 * Desde el 08-09 el desplegable SÍ ofrece «Venta ejecutada», porque el
 * comercial la buscaba ahí y no la encontraba; pero es un cartel que lleva a
 * las cotizaciones, no una opción que se guarde. Esta lista es la que hace que
 * eso no dependa de la pantalla.
 *
 * POR QUÉ VIVE ACÁ Y NO JUNTO A LA ACCIÓN QUE LA USA. `acciones/oportunidades`
 * empieza con «use server», y un archivo así SOLO puede exportar funciones
 * asíncronas: exportar de ahí un arreglo rompe el módulo ENTERO al cargarlo,
 * y con él todas las acciones de la aplicación —incluida «Cerrar sesión», que
 * fue donde se notó el 08-09—. TypeScript no lo detecta y las pruebas
 * unitarias tampoco, porque importan el módulo sin la regla de Next.
 */
export const ETAPAS_MANUALES: EtapaOportunidad[] = [
  "asignada",
  "filtrada",
  "seguimiento",
  "potencial",
  "rechazada",
  "derivada",
  // Archivar, desde el 08-09. Hasta entonces solo llegaba por el import del
  // Excel, y la comercial que quería sacar de su lista un duplicado no tenía
  // más salida que rechazarlo — o escribir «no tengo pendiente» en una nota.
  "historico",
];
