import Link from "next/link";
import { fechaLima } from "@/lib/fechas";
import { MapPin, FileText } from "lucide-react";
import { EtapaBadge } from "@/components/crm/etapa-badge";
import { cn } from "@/lib/utils";
import { RegistroNoDisponible } from "@/components/crm/registro-no-disponible";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResumenCuenta } from "@/components/crm/resumen-cuenta";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { GrupoEconomico } from "@/components/crm/grupo-economico";
import { ReasignarCarteraBoton } from "@/components/crm/reasignar-cartera-boton";
import { AccionNuevoInforme, ListaInformesCierre, TablaComprasAnteriores } from "@/components/crm/secciones-cliente";
import { firmarAdjuntosDeCierres } from "@/lib/adjuntos-cierre";
import { ContactosEditables } from "@/components/crm/contactos-editables";
import { IdentidadCuenta } from "@/components/crm/identidad-cuenta";
import { Badge } from "@/components/ui/badge";
import { TrabajarHistoricaBoton } from "@/components/crm/trabajar-historica-boton";

export async function FichaCuenta({ cuentaId, comoGerencia = false }: { cuentaId: string; comoGerencia?: boolean }) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, tipo_doc, num_doc, direccion, distrito, provincia, departamento, ultima_venta_at, cartera_desde, comercial_id, notas, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, documento, direccion, es_principal)",
    )
    .eq("id", cuentaId)
    .maybeSingle();

  if (!cuenta) {
    return comoGerencia ? (
      <RegistroNoDisponible volverHref="/gerencia/clientes" volverTexto="Volver a clientes" />
    ) : (
      <RegistroNoDisponible volverHref="/comercial/cartera" volverTexto="Volver a mi cartera" />
    );
  }

  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;

  // Para el botón de reasignar; solo en la vista de gerencia.
  const { data: comerciales } = comoGerencia
    ? await supabase
        .from("perfiles")
        .select("id, nombre, codigo_comercial")
        .eq("rol", "comercial")
        .eq("activo", true)
        .eq("es_prueba", false).eq("es_soporte", false)
        .order("codigo_comercial")
    : { data: null };
  const contactos =
    (cuenta.contactos as unknown as {
      id: string;
      nombre: string;
      cargo: string | null;
      telefono: string | null;
      email: string | null;
      documento: string | null;
      direccion: string | null;
      es_principal: boolean;
    }[]) ?? [];

  const { eventos, ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId);

  // DESDE ACÁ SE TIENE QUE PODER LLEGAR A GESTIONAR. Brenda, 31-08: encontró a
  // COINREFRI en Mi cartera y no tenía qué tocar para trabajarlo. Y era cierto
  // —la ficha mostraba informes, compras, historial y contactos, pero ni
  // listaba sus oportunidades—, y la gestión solo se registra en la ficha de la
  // oportunidad. El cliente estaba a un clic de distancia de sí mismo y ese clic
  // no existía.
  const { data: oportunidadesCuenta } = await supabase
    .from("oportunidades")
    .select(
      "id, etapa, intencion, monto_estimado, moneda, proxima_accion, proxima_accion_at, cerrada_at, comercial_id, perfiles:comercial_id(nombre, codigo_comercial)",
    )
    .eq("cuenta_id", cuentaId)
    .order("cerrada_at", { ascending: true, nullsFirst: true })
    .order("proxima_accion_at", { ascending: true, nullsFirst: false })
    .limit(50);

  // ACÁ SÍ SE VEN LAS DEL HISTÓRICO, a propósito (0130). Se archivaron para
  // que no llenen el Kanban ni «Mi día», no para esconderlas: la ficha del
  // cliente es justo donde se las va a buscar —«¿a este señor qué le
  // cotizamos en 2022?»— y desde acá se retoman con un clic.
  //
  // El orden lo pone el servidor por fecha; acá se reordena por lo que le
  // importa a quien mira: primero lo que se está trabajando, después el
  // archivo, y al final lo cerrado (que cuenta la historia pero no pide nada).
  // Son 34 como máximo en el cliente más cargado, así que ordenar en memoria
  // no tiene costo.
  const oportunidades = ((oportunidadesCuenta ?? []) as unknown as {
    id: string;
    etapa: string;
    intencion: string | null;
    monto_estimado: number | null;
    moneda: string;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    cerrada_at: string | null;
    comercial_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[]).sort((a, b) => rangoOportunidad(a) - rangoOportunidad(b));
  const enHistorico = oportunidades.filter((o) => o.etapa === "historico").length;

  // Informes de cierre de este cliente. Los ve el comercial de la cartera,
  // gerencia y Central (política de la migración 0049).
  const { data: informes } = await supabase
    .from("informes_cierre")
    .select("id, codigo, serie, fecha, monto_total, moneda, emitido_at, adjuntos")
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false });
  const adjuntosPorInforme = await firmarAdjuntosDeCierres(supabase, informes ?? []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">{cuenta.razon_social}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {cuenta.tipo_doc !== "SIN_DOC" && (
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" />
                  {cuenta.tipo_doc}: {cuenta.num_doc}
                </span>
              )}
              {cuenta.direccion && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {cuenta.direccion}
                </span>
              )}
            </div>
          </div>
          {comoGerencia && (
            <div className="flex items-center gap-2">
              <Badge>Cartera de: {dueno?.nombre ?? "Sin asignar"}{dueno?.codigo_comercial ? ` (${dueno.codigo_comercial})` : ""}</Badge>
              {/* Reasignar donde se LEE de quién es (pedido 25-08). Solo
                  gerencia/admin; la base lo vuelve a exigir (migración 0080). */}
              <ReasignarCarteraBoton
                cuentaId={cuenta.id}
                razonSocial={cuenta.razon_social}
                comercialActual={cuenta.comercial_id}
                comerciales={comerciales ?? []}
              />
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            Cliente desde{" "}
            <span className="font-medium text-foreground">
              {fechaLima(cuenta.cartera_desde)}
            </span>
          </span>
          <span>
            Última venta{" "}
            <span className="font-medium text-foreground">
              {cuenta.ultima_venta_at ? fechaLima(cuenta.ultima_venta_at) : "Nunca"}
            </span>
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ResumenCuenta cuentaId={cuenta.id} notasIniciales={cuenta.notas} />

          <SeccionPanel
            titulo={`Oportunidades (${oportunidades.length})`}
            accion={
              <span className="text-[11px] text-muted-foreground">
                {enHistorico > 0
                  ? `La gestión se registra dentro de cada una · ${enHistorico} en el histórico`
                  : "La gestión se registra dentro de cada una"}
              </span>
            }
          >
            <ListaOportunidadesCuenta
              oportunidades={oportunidades}
              duenoDeLaFicha={cuenta.comercial_id}
              comoGerencia={comoGerencia}
            />
          </SeccionPanel>

          <GrupoEconomico cuentaId={cuenta.id} comoGerencia={comoGerencia} />

          {/* Informes de cierre: el documento que recibe Central para facturar,
              cobrar y despachar. Va junto a las compras porque es el paso
              siguiente de la misma historia: se cerro la venta, ahora hay que
              ejecutarla. El contenido vive en secciones-cliente.tsx, compartido
              con la ficha de oportunidad (C5 del plan 11). */}
          <SeccionPanel titulo="Informes de cierre" accion={<AccionNuevoInforme cuentaId={cuenta.id} />}>
            <ListaInformesCierre informes={informes ?? []} adjuntosPorInforme={adjuntosPorInforme} />
          </SeccionPanel>

          {ventasConDetalle.length > 0 && (
            <SeccionPanel titulo="Compras anteriores">
              <TablaComprasAnteriores ventas={ventasConDetalle} />
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Historial del cliente">
            <HistorialCuenta eventos={eventos} />
          </SeccionPanel>
        </div>

        <SeccionPanel titulo={`Cliente y contactos (${contactos.length})`}>
          {/* Editables: es lo que se imprime en la cotización (24-08). El RUC y la
              razón social salen del bloque del cliente; el contacto principal, del
              "Atención:". */}
          <div className="mb-3">
            <IdentidadCuenta
              cuentaId={cuenta.id}
              tipoDoc={cuenta.tipo_doc}
              numDoc={cuenta.num_doc}
              razonSocial={cuenta.razon_social}
            />
          </div>
          <ContactosEditables cuentaId={cuenta.id} contactos={contactos} />
        </SeccionPanel>
      </div>
    </div>
  );
}

/** Vivo primero, archivo después, cerrado al final (0130). */
function rangoOportunidad(o: { etapa: string; cerrada_at: string | null }): number {
  if (o.cerrada_at) return 2;
  return o.etapa === "historico" ? 1 : 0;
}

/**
 * Las oportunidades del cliente, como puerta a gestionarlas.
 *
 * Las abiertas van arriba —son las que se trabajan hoy— y las cerradas debajo,
 * apagadas, porque cuentan la historia pero no piden nada.
 *
 * Se marca la que NO es de quien mira. En COINREFRI, cuatro de las ocho son de
 * Postventa (repuestos y mantenimiento vendidos entre 2023 y 2024): aparecen
 * porque son del mismo cliente y su dueña tiene que verlas, pero decirle por
 * qué no puede tocarlas evita la siguiente pregunta.
 */
function ListaOportunidadesCuenta({
  oportunidades,
  duenoDeLaFicha,
  comoGerencia,
}: {
  oportunidades: {
    id: string;
    etapa: string;
    intencion: string | null;
    monto_estimado: number | null;
    moneda: string;
    proxima_accion: string | null;
    proxima_accion_at: string | null;
    cerrada_at: string | null;
    comercial_id: string | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[];
  duenoDeLaFicha: string | null;
  comoGerencia: boolean;
}) {
  if (oportunidades.length === 0) {
    return <p className="text-sm text-muted-foreground">Este cliente todavía no tiene ninguna oportunidad.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {oportunidades.map((o) => {
        const cerrada = !!o.cerrada_at;
        const deOtro = !comoGerencia && o.comercial_id !== duenoDeLaFicha;
        // El botón solo donde puede funcionar: en lo que está archivado y es de
        // quien mira. La base vuelve a comprobarlo igual (0130).
        const enHistorico = o.etapa === "historico" && !cerrada;
        return (
          <li
            key={o.id}
            className={cn(
              "flex items-stretch rounded-lg border border-border transition-colors hover:bg-accent",
              cerrada && "opacity-70",
              enHistorico && "border-dashed",
            )}
          >
            <Link
              href={`/comercial/oportunidades/${o.id}`}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 p-2.5"
            >
              <EtapaBadge etapa={o.etapa} />
              <span className="min-w-[140px] flex-1 text-xs text-foreground">
                {o.proxima_accion ?? (cerrada ? "Cerrada" : enHistorico ? "Del archivo de los Excel" : "Sin próxima acción definida")}
                {o.proxima_accion_at && !cerrada && (
                  <span className="text-muted-foreground"> · {fechaLima(o.proxima_accion_at)}</span>
                )}
                {cerrada && <span className="text-muted-foreground"> · {fechaLima(o.cerrada_at!)}</span>}
              </span>
              {deOtro && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                  de {o.perfiles?.codigo_comercial ?? o.perfiles?.nombre ?? "otra área"} · solo lectura
                </span>
              )}
              {o.monto_estimado != null && (
                <span className="text-xs font-semibold tabular-nums text-foreground">
                  {o.moneda} {Number(o.monto_estimado).toLocaleString("es-PE")}
                </span>
              )}
            </Link>
            {enHistorico && !deOtro && (
              <span className="flex flex-none items-center py-2.5 pr-2.5">
                <TrabajarHistoricaBoton oportunidadId={o.id} compacto />
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
