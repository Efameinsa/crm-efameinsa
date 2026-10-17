import { redirect } from "next/navigation";
import { FichaCuenta } from "@/components/crm/ficha-cuenta";
import { enVistaNueva } from "@/lib/propuesta/vista";

/**
 * La ficha del cliente en modo lectura, para Central (10-09).
 *
 * Es la misma ficha del comercial y de gerencia. Lo que cambia con
 * `comoCentral`: se ve de quién es la cartera, no hay botones de corregir ni
 * de registrar, y cada expediente lleva a la derivación con la que entró
 * (/central/derivados/[lead]) en vez de a /comercial/*, que a este rol le
 * está cerrado.
 *
 * Desde el 17-10 (buzón, Central: «el formato de la segunda imagen para hacer
 * más rápido las búsquedas de información de cada cliente») abre la Ficha 360
 * con pestañas, como gerencia; «Vista anterior de la ficha» vuelve acá con ?hoy=1.
 */
export default async function ClienteCentralDetallePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ hoy?: string }> }) {
  const { id } = await params;
  if (!(await searchParams).hoy && (await enVistaNueva())) redirect(`/nuevo/cliente/${id}`);
  return <FichaCuenta cuentaId={id} comoCentral />;
}
