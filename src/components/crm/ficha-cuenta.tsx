import { fechaLima, fechaCalendario } from "@/lib/fechas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Phone, Mail, MapPin, FileText, User, FilePlus2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cargarHistorialCuenta } from "@/lib/historial-cuenta";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResumenCuenta } from "@/components/crm/resumen-cuenta";
import { HistorialCuenta } from "@/components/crm/historial-cuenta";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export async function FichaCuenta({ cuentaId, comoGerencia = false }: { cuentaId: string; comoGerencia?: boolean }) {
  const supabase = await createClient();

  const { data: cuenta } = await supabase
    .from("cuentas")
    .select(
      "id, razon_social, tipo_doc, num_doc, direccion, distrito, provincia, departamento, ultima_venta_at, cartera_desde, comercial_id, notas, perfiles(nombre, codigo_comercial), contactos(id, nombre, cargo, telefono, email, es_principal)",
    )
    .eq("id", cuentaId)
    .maybeSingle();

  if (!cuenta) notFound();

  const dueno = cuenta.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;
  const contactos =
    (cuenta.contactos as unknown as {
      id: string;
      nombre: string;
      cargo: string | null;
      telefono: string | null;
      email: string | null;
      es_principal: boolean;
    }[]) ?? [];

  const { eventos, ventasConDetalle } = await cargarHistorialCuenta(supabase, cuentaId);

  // Informes de cierre de este cliente. Los ve el comercial de la cartera,
  // gerencia y Central (política de la migración 0049).
  const { data: informes } = await supabase
    .from("informes_cierre")
    .select("id, codigo, serie, fecha, monto_total, moneda, emitido_at")
    .eq("cuenta_id", cuentaId)
    .order("created_at", { ascending: false });

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
            <Badge>Cartera de: {dueno?.nombre ?? "Sin asignar"}{dueno?.codigo_comercial ? ` (${dueno.codigo_comercial})` : ""}</Badge>
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

          {/* Informes de cierre: el documento que recibe Central para facturar,
              cobrar y despachar. Va junto a las compras porque es el paso
              siguiente de la misma historia: se cerró la venta, ahora hay que
              ejecutarla. */}
          <SeccionPanel
            titulo="Informes de cierre"
            accion={
              <Link
                href={`/comercial/informes/nuevo?cuenta=${cuenta.id}`}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
              >
                <FilePlus2 className="size-3.5" /> Nuevo informe
              </Link>
            }
          >
            {(informes ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay informes. Se genera al cerrar una venta y es lo que Central necesita para facturar y
                despachar.
              </p>
            ) : (
              <ul className="space-y-2">
                {(informes ?? []).map((inf) => (
                  <li
                    key={inf.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                  >
                    <span className="flex items-center gap-2.5 text-sm">
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {inf.emitido_at ? `Nº ${inf.codigo}` : "Borrador"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {inf.serie === "OPEN" ? "Open Investments" : "Efameinsa"}
                      </span>
                      <span className="tabular-nums text-muted-foreground">{fechaCalendario(inf.fecha)}</span>
                      <span className="font-semibold tabular-nums text-foreground">
                        {inf.moneda} {Number(inf.monto_total).toLocaleString("es-PE")}
                      </span>
                      {!inf.emitido_at && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          sin numerar
                        </span>
                      )}
                    </span>
                    <a
                      href={`/api/informes/${inf.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] text-foreground hover:bg-accent"
                    >
                      <FileText className="size-3" /> Ver PDF
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </SeccionPanel>

          {ventasConDetalle.length > 0 && (
            <SeccionPanel titulo="Compras anteriores">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Cotización</TableHead>
                    <TableHead>Equipos</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasConDetalle.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                        {fechaCalendario(v.fecha_venta)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {v.cotizaciones?.codigo ? (
                          <>{v.cotizaciones.codigo} · {v.cotizaciones.serie}</>
                        ) : v.referencia_historica ? (
                          // Antes decía que el documento "vive en el archivo
                          // físico/correo de esa época". Ya no: está subido y
                          // se abre desde acá. Cuando existe, el Nº es enlace.
                          v.documentoArchivo?.tienePdf ? (
                            <a
                              href={`/api/cotizaciones-historicas/${v.documentoArchivo.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              title="Abrir el presupuesto de esta compra"
                              className="text-primary hover:underline"
                            >
                              {v.referencia_historica}
                            </a>
                          ) : (
                            <span title="Nº de presupuesto del registro histórico. El documento no está en el archivo digitalizado.">
                              {v.referencia_historica} <span className="text-muted-foreground">(histórico)</span>
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground" title="La hoja histórica no registró el número de presupuesto">sin registro</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[360px] whitespace-normal text-xs text-muted-foreground">
                        {/* Tres fuentes, de la más precisa a la menos: los
                            ítems de la cotización del CRM (con marca, modelo y
                            precio); lo que la hoja de ventas anotó a mano (solo
                            39 de 626 ventas lo traen); y, para el resto, los
                            equipos que listaba el presupuesto del archivo del
                            que salió la venta — 4.493 de 5.559 cotizaciones sí
                            los traen, así que es lo que rescata la mayoría de
                            las compras históricas. */}
                        {(v.cotizaciones?.cotizacion_items ?? []).length > 0
                          ? (v.cotizaciones?.cotizacion_items ?? [])
                              .map(
                                (it) =>
                                  `${it.cantidad}× ${it.productos?.marca ?? ""} ${it.productos?.modelo ?? ""} — US$ ${it.precio_unitario.toLocaleString("es-PE")} c/u`,
                              )
                              .join(" · ")
                          : (v.equipo_historico ?? (v.documentoArchivo?.items ?? []).join(" · ") ?? "") || "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-foreground">
                        {v.moneda} {v.monto_total.toLocaleString("es-PE")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {/* Total al pie, que es donde se busca en una tabla de compras.
                    Se suma POR MONEDA: mezclar dólares y soles en un número
                    daría una cifra que no significa nada. */}
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-xs font-semibold text-foreground">
                      Total de {ventasConDetalle.length} compra{ventasConDetalle.length === 1 ? "" : "s"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totalesPorMoneda(ventasConDetalle).map((t) => (
                        <span key={t.moneda} className="block font-bold text-foreground">
                          {t.moneda} {t.total.toLocaleString("es-PE")}
                        </span>
                      ))}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </SeccionPanel>
          )}

          <SeccionPanel titulo="Historial del cliente">
            <HistorialCuenta eventos={eventos} />
          </SeccionPanel>
        </div>

        <SeccionPanel titulo={`Contactos (${contactos.length})`}>
          {contactos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>
          ) : (
            <div className="space-y-3">
              {contactos.map((c) => (
                <div key={c.id} className="rounded-lg border border-border p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <User className="size-3.5 text-muted-foreground" />
                    {c.nombre}
                    {c.es_principal && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        Principal
                      </span>
                    )}
                  </p>
                  {c.cargo && <p className="text-xs text-muted-foreground">{c.cargo}</p>}
                  <div className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                    {c.telefono && (
                      <p className="flex items-center gap-1">
                        <Phone className="size-3.5" />
                        {c.telefono}
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1">
                        <Mail className="size-3.5" />
                        {c.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </SeccionPanel>
      </div>
    </div>
  );
}

/** Suma las compras agrupando por moneda: sumar USD con PEN no significa nada. */
function totalesPorMoneda(ventas: { moneda: string; monto_total: number }[]): { moneda: string; total: number }[] {
  const acum = new Map<string, number>();
  for (const v of ventas) acum.set(v.moneda, (acum.get(v.moneda) ?? 0) + v.monto_total);
  return [...acum.entries()].map(([moneda, total]) => ({ moneda, total })).sort((a, b) => b.total - a.total);
}
