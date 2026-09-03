import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { cargarBorradorInforme, prellenarInforme } from "@/lib/acciones/informes";
import { FormularioInforme } from "@/components/crm/formulario-informe";
import { SeccionPanel } from "@/components/crm/seccion-panel";

export const dynamic = "force-dynamic";

/**
 * Seguir un borrador de cierre donde quedó.
 *
 * Santos, 03-09: «los cierres que están en borradores deberían tener la opción
 * para editarse, no tiene sentido que se guarden en borrador si no se pueden
 * editar». Es el mismo formulario de `/comercial/informes/nuevo`, pero
 * arrancando con lo que el comercial ya había escrito —renglones, pago,
 * entrega, expediente— en vez de en blanco.
 *
 * Sin código: un borrador no tiene número, no llegó a Central y no cuenta. El
 * código de operaciones o gerencia se pide recién cuando el informe está
 * numerado (0153/0154), y ese camino sigue siendo el de `/comercial/cierres/[id]`.
 * Si el documento ya se emitió, esta ruta manda para allá.
 */
export default async function EditarBorradorCierrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [perfil, resultado] = await Promise.all([requerirPerfil(), cargarBorradorInforme(id)]);
  if (resultado.estado === "no-existe") notFound();
  if (resultado.estado !== "borrador") redirect(`/comercial/cierres/${id}`);

  const { borrador } = resultado;
  // Lo edita el comercial de la cartera o backoffice —lo mismo que exige la
  // política `informes_edita` (0049)—. Central lo ve en su pantalla, no acá.
  const puedeEditar = borrador.comercialId === perfil.id || ["gerencia", "admin", "operaciones"].includes(perfil.rol);
  if (!puedeEditar) redirect(`/comercial/cierres/${id}`);
  // El prellenado va con la sesión del usuario: si la cuenta no es suya, RLS
  // no devuelve nada y la página no existe.
  const { error, datos } = await prellenarInforme(borrador.cuentaId);
  if (error || !datos) notFound();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <Link
        href={`/comercial/cierres/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" /> Volver al borrador
      </Link>

      <SeccionPanel titulo="Borrador de cierre de ventas">
        <p className="mb-4 text-sm text-muted-foreground">
          Todavía sin número: cambie lo que haga falta y emítalo cuando esté listo. Central lo recibe recién al
          emitirlo.
        </p>
        <FormularioInforme prellenado={datos} borrador={borrador} />
      </SeccionPanel>
    </div>
  );
}
