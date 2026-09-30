import Link from "@/components/enlace";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { cargarBorradorInforme, prellenarInforme } from "@/lib/acciones/informes";
import { FormularioInforme } from "@/components/crm/formulario-informe";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario } from "@/lib/fechas";
import { AvisoDevolucionCierre, devolucionAbierta } from "@/components/crm/aviso-devolucion-cierre";

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
 *
 * CORRECCIÓN CON CÓDIGO EN EL MISMO FORMULARIO (Santos, 30-09). Con el código
 * de Lesly ya pedido, el cierre emitido se corrige AQUÍ, en la pantalla que la
 * comercial ya conoce, y no en otra vista armada aparte: Gabriela se frustró
 * porque «Editar» le abría algo que no reconocía y no encontraba dónde subir
 * el voucher. Lo que la corrección no puede tocar (venta, presupuesto, serie,
 * condición de despacho) se ve igual pero bloqueado. Sin corrección abierta,
 * esta ruta vuelve al cierre, que es donde se pide el código.
 */
export default async function EditarBorradorCierrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [perfil, resultado] = await Promise.all([requerirPerfil(), cargarBorradorInforme(id)]);
  if (resultado.estado === "no-existe") notFound();
  if (resultado.estado === "anulado") redirect(`/comercial/cierres/${id}`);

  const { borrador } = resultado;
  if (resultado.estado === "emitido") {
    const supabase = await createClient();
    const [{ data: ventana }, { data: venta }, { data: datos }, devolucion] = await Promise.all([
      supabase.rpc("correccion_informe_abierta", { p_informe: id }),
      borrador.ventaId
        ? supabase.from("ventas").select("fecha, monto, moneda").eq("id", borrador.ventaId).maybeSingle()
        : Promise.resolve({ data: null }),
      prellenarInforme(borrador.cuentaId).then((r) => ({ data: r.datos ?? null })),
      devolucionAbierta(supabase, id),
    ]);
    const v = ventana as { expira_at: string; autorizo: string; motivo: string } | null;
    if (!v || !datos) redirect(`/comercial/cierres/${id}`);
    const vt = venta as { fecha: string; monto: number; moneda: string } | null;
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <Link href={`/comercial/cierres/${id}`} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> Volver al cierre sin guardar
        </Link>
        {devolucion && <AvisoDevolucionCierre informeId={id} devolucion={devolucion} puedeReenviar={false} enCorreccion />}
        <SeccionPanel titulo={`Corregir el cierre N.º ${resultado.codigo}`}>
          <FormularioInforme
            prellenado={datos}
            borrador={borrador}
            correccion={{
              codigo: resultado.codigo,
              autorizo: v.autorizo,
              expiraAt: v.expira_at,
              motivo: v.motivo,
              ventaTexto: vt ? `${fechaCalendario(vt.fecha)} · ${vt.moneda} ${Number(vt.monto).toLocaleString("es-PE")}` : null,
            }}
          />
        </SeccionPanel>
      </div>
    );
  }
  // Lo edita el comercial de la cartera o backoffice —lo mismo que exige la
  // política `informes_edita` (0049)— y, desde la 0245, quien lo creó desde
  // postventa sobre un cliente ajeno. Central lo ve en su pantalla, no acá.
  const puedeEditar =
    borrador.comercialId === perfil.id || borrador.creadoPor === perfil.id || ["gerencia", "admin", "operaciones"].includes(perfil.rol);
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
