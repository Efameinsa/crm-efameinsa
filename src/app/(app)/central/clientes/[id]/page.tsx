import { FichaCuenta } from "@/components/crm/ficha-cuenta";

/**
 * La ficha del cliente en modo lectura, para Central (10-09).
 *
 * Es la misma ficha del comercial y de gerencia. Lo que cambia con
 * `comoCentral`: se ve de quién es la cartera, no hay botones de corregir ni
 * de registrar, y cada expediente lleva a la derivación con la que entró
 * (/central/derivados/[lead]) en vez de a /comercial/*, que a este rol le
 * está cerrado.
 */
export default async function ClienteCentralDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FichaCuenta cuentaId={id} comoCentral />;
}
