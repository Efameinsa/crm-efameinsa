import Link from "next/link";
import { Phone, Mail, FileText, User, FilePlus2 } from "lucide-react";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fechaCalendario } from "@/lib/fechas";
import type { VentaConDetalle } from "@/lib/historial-cuenta";

// Las tres secciones que sabían del CLIENTE y solo vivían en "Ver ficha
// completa" (/comercial/cartera/[id]).
//
// C5 del plan 11: había dos pantallas del mismo cliente y la que se llamaba
// "completa" tenía MENOS cosas que la otra — Darwin, probando el 23-08: «si yo
// voy a ver ficha completa, ni siquiera está completa, porque son menos cosas.
// Entonces eso confunde al vendedor». Peor: el informe de cierre solo se podía
// crear desde allá, así que cerrar una venta obligaba a saltar de pantalla.
//
// Ahora estas secciones se montan también dentro de la ficha de oportunidad,
// plegadas. Se extrajeron acá en vez de copiarlas para que las dos pantallas no
// se separen con el tiempo.

export interface ContactoCuenta {
  id: string;
  nombre: string;
  cargo: string | null;
  telefono: string | null;
  email: string | null;
  es_principal: boolean;
  documento?: string | null;
}

export interface InformeCuenta {
  id: string;
  codigo: string | null;
  serie: string;
  fecha: string;
  monto_total: number;
  moneda: string;
  emitido_at: string | null;
}

export function AccionNuevoInforme({ cuentaId }: { cuentaId: string }) {
  return (
    <Link
      href={`/comercial/informes/nuevo?cuenta=${cuentaId}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-accent"
    >
      <FilePlus2 className="size-3.5" /> Nuevo informe
    </Link>
  );
}

export function ListaInformesCierre({ informes }: { informes: InformeCuenta[] }) {
  if (informes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay informes. Se genera al cerrar una venta y es lo que Central necesita para facturar y despachar.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {informes.map((inf) => (
        <li key={inf.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
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
  );
}

/** Suma las compras agrupando por moneda: sumar USD con PEN no significa nada. */
function totalesPorMoneda(ventas: { moneda: string; monto_total: number }[]): { moneda: string; total: number }[] {
  const acum = new Map<string, number>();
  for (const v of ventas) acum.set(v.moneda, (acum.get(v.moneda) ?? 0) + v.monto_total);
  return [...acum.entries()].map(([moneda, total]) => ({ moneda, total })).sort((a, b) => b.total - a.total);
}

export function TablaComprasAnteriores({ ventas }: { ventas: VentaConDetalle[] }) {
  return (
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
        {ventas.map((v) => (
          <TableRow key={v.id}>
            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
              {fechaCalendario(v.fecha_venta)}
            </TableCell>
            <TableCell className="whitespace-nowrap font-mono text-xs">
              {v.cotizaciones?.codigo ? (
                <>
                  {v.cotizaciones.codigo} · {v.cotizaciones.serie}
                </>
              ) : v.referencia_historica ? (
                // El documento del archivo está subido a R2: cuando existe, el
                // Nº de presupuesto es un enlace que lo abre.
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
                <span className="text-muted-foreground" title="La hoja histórica no registró el número de presupuesto">
                  sin registro
                </span>
              )}
            </TableCell>
            <TableCell className="max-w-[360px] whitespace-normal text-xs text-muted-foreground">
              {/* Tres fuentes, de la más precisa a la menos: los ítems de la
                  cotización del CRM (con marca, modelo y precio); lo que la
                  hoja de ventas anotó a mano (solo 39 de 626 ventas lo traen);
                  y, para el resto, los equipos que listaba el presupuesto del
                  archivo del que salió la venta — 4.493 de 5.559 cotizaciones
                  sí los traen. */}
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
      {/* Total al pie, que es donde se busca en una tabla de compras. */}
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3} className="text-xs font-semibold text-foreground">
            Total de {ventas.length} compra{ventas.length === 1 ? "" : "s"}
          </TableCell>
          <TableCell className="text-right tabular-nums">
            {totalesPorMoneda(ventas).map((t) => (
              <span key={t.moneda} className="block font-bold text-foreground">
                {t.moneda} {t.total.toLocaleString("es-PE")}
              </span>
            ))}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

export function ListaContactos({ contactos }: { contactos: ContactoCuenta[] }) {
  if (contactos.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin contactos registrados.</p>;
  }
  return (
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
            {/* DNI de quien recibe la entrega (migración 0057). */}
            {c.documento && <p className="flex items-center gap-1">DNI/CE: {c.documento}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
