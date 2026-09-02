import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Lock, ShieldCheck, Truck, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AdjuntosCierre } from "@/components/crm/adjuntos-cierre";
import { CompendioGestion } from "@/components/crm/compendio-gestion";
import { firmarAdjuntosDeCierres, type AdjuntoCierre } from "@/lib/adjuntos-cierre";
import { cargarCompendio, oportunidadDelInforme } from "@/lib/compendio-cierre";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { IGV } from "@/lib/pdf/series";
import type { ContactoInforme, ItemInforme } from "@/lib/pdf/informe-cierre-pdf";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * El cierre de venta abierto como pantalla, no como PDF.
 *
 * Gerencia, Word de observaciones del 01.09, punto 3: «en los cierres, que
 * permita ingresar al cierre y ver el detalle, pero si requiere modificar algo
 * debe solicitar PIN». Hasta hoy la fila de «Mis cierres» abría el PDF en otra
 * pestaña y el expediente —los documentos, el compendio de cómo se hizo la
 * venta— solo lo veía Central en su modal. El comercial no tenía dónde mirar
 * su propio cierre entero.
 *
 * QUÉ SE VE. Todo lo que el informe tiene guardado: de quién es, cuánto, cómo
 * paga, dónde y cuándo se entrega, los contactos, los equipos con su desglose
 * de IGV, lo que incluye y lo que va gratis, los documentos del expediente y
 * el compendio de la gestión (las mismas piezas que ve Central).
 *
 * QUÉ NO SE PUEDE. Un cierre emitido no se edita desde acá ni desde ningún
 * lado: es un documento con número que ya salió (regla 2 de docs/19 §3:
 * anular, no borrar; y 0142: emitido = sellado). Lo único que admite es
 * AGREGAR un documento, y eso pide el código de operaciones o gerencia —el
 * PIN que gerencia pidió—, que ya vive en el propio bloque de adjuntos. Para
 * dejarlo sin efecto se anula desde Central, también con código. Un borrador
 * todavía no es nada de eso: se mira, y se termina o se borra desde la lista.
 */

interface ItemGuardado extends ItemInforme {
  bloque?: "venta" | "gratuito";
}

// Los enums de la 0049, en palabras.
const COMPROBANTE: Record<string, string> = { factura: "Factura", boleta_ruc: "Boleta con RUC", boleta_dni: "Boleta con DNI" };
const FORMA_PAGO: Record<string, string> = { transferencia: "Transferencia", deposito: "Depósito" };

export default async function CierrePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();

  // RLS ya limita: el comercial ve los informes de SU cartera (0049); gerencia,
  // Central y operaciones ven todo. Si no es suyo, no existe para él.
  const { data: informe } = await supabase
    .from("informes_cierre")
    .select("*, perfiles!informes_cierre_creado_por_fkey(nombre, codigo_comercial)")
    .eq("id", id)
    .maybeSingle();
  if (!informe) notFound();

  const guardados = (informe.items ?? []) as ItemGuardado[];
  const items = guardados.filter((i) => i.bloque !== "gratuito");
  const gratuitos = guardados.filter((i) => i.bloque === "gratuito");
  const subtotal = items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_unitario), 0);
  const simbolo = informe.moneda === "PEN" ? "S/" : "US$";
  const dinero = (n: number) => `${simbolo} ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const emitido = informe.emitido_at != null;
  const anulado = informe.anulado_at != null;
  const creadoPor = informe.perfiles as unknown as { nombre: string; codigo_comercial: string | null } | null;

  const [adjuntosPorInforme, compendio] = await Promise.all([
    firmarAdjuntosDeCierres(supabase, [{ id: informe.id, adjuntos: (informe.adjuntos ?? []) as AdjuntoCierre[] }]),
    cargarCompendio(await oportunidadDelInforme(informe)).catch(() => null),
  ]);
  const adjuntos = adjuntosPorInforme.get(informe.id) ?? [];

  const contactos: { titulo: string; c: ContactoInforme | null }[] = [
    { titulo: "Contacto de la venta", c: informe.contacto_venta as ContactoInforme | null },
    { titulo: "Contabilidad", c: informe.contacto_contabilidad as ContactoInforme | null },
    { titulo: "Recibe el despacho", c: informe.contacto_despacho as ContactoInforme | null },
  ].filter((x) => x.c && (x.c.nombre || x.c.telefono || x.c.correo));

  const titulo = emitido ? `Informe N.º ${informe.codigo}` : "Borrador de cierre";

  return (
    <div className="space-y-4">
      <Link
        href="/comercial/cierres"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Mis cierres
      </Link>

      <SeccionPanel
        titulo={`${titulo} · ${informe.serie === "OPEN" ? "Open Investments" : "Efameinsa"}`}
        accion={
          <a
            href={`/api/informes/${informe.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90"
          >
            <FileText className="size-3.5" /> {emitido ? "Abrir el PDF" : "Ver el borrador en PDF"}
          </a>
        }
      >
        {/* El estado del documento, dicho primero: es lo que decide qué se
            puede hacer con él. */}
        <div
          className={cn(
            "mb-4 flex items-start gap-2 rounded-md border p-3 text-xs leading-snug",
            anulado
              ? "border-dashed border-border bg-secondary/40 text-muted-foreground"
              : emitido
                ? "border-border bg-secondary/40 text-muted-foreground"
                : "border-amber-500/40 bg-amber-500/5 text-amber-800",
          )}
        >
          {anulado ? (
            <>
              <Lock className="mt-0.5 size-3.5 flex-none" />
              <span>
                <b className="uppercase text-foreground">Anulado</b>
                {informe.anulado_motivo ? ` · ${informe.anulado_motivo}` : ""}. Conserva su número y no cuenta en
                ningún reporte; para esta venta hay que emitir un cierre nuevo.
              </span>
            </>
          ) : emitido ? (
            <>
              <ShieldCheck className="mt-0.5 size-3.5 flex-none" />
              <span>
                <b className="text-foreground">Emitido el {fechaHoraLima(informe.emitido_at)}</b>
                {creadoPor ? ` por ${creadoPor.nombre}${creadoPor.codigo_comercial ? ` (${creadoPor.codigo_comercial})` : ""}` : ""}.
                Este informe ya salió con número y no se modifica. Lo único que admite es <b className="text-foreground">agregar
                un documento</b> al expediente, y eso pide el código de operaciones o gerencia. Si hay que dejarlo sin
                efecto, se anula desde Central con ese mismo código.
              </span>
            </>
          ) : (
            <>
              <Lock className="mt-0.5 size-3.5 flex-none" />
              <span>
                <b>Borrador sin numerar.</b> Todavía no llegó a Central ni cuenta en ningún reporte. Se termina y se emite
                desde el formulario de cierre del cliente; si sobra, se borra desde la lista.
              </span>
            </>
          )}
        </div>

        {/* De quién es y cuánto: lo que se lee primero. */}
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-base font-semibold leading-tight text-foreground">{informe.cliente_nombre}</p>
            {informe.cliente_doc && <p className="font-mono text-xs text-muted-foreground">{informe.cliente_doc}</p>}
            {informe.cliente_direccion && <p className="mt-1 text-xs text-muted-foreground">{informe.cliente_direccion}</p>}
            {informe.cliente_correo && <p className="text-xs text-muted-foreground">{informe.cliente_correo}</p>}
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>Fecha: <b className="text-foreground">{fechaCalendario(informe.fecha)}</b></span>
              {informe.presupuesto_ref && <span>Presupuesto: <b className="text-foreground">{informe.presupuesto_ref}</b></span>}
              {informe.orden_compra && <span>O/C del cliente: <b className="text-foreground">{informe.orden_compra}</b></span>}
              {informe.cliente_nuevo && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">Cliente nuevo</span>}
              {informe.urgente && !anulado && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 font-bold text-destructive">URGENTE</span>
              )}
            </p>
          </div>
          <div className="rounded-md border border-border p-3 text-right md:min-w-48">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Total con IGV</p>
            <p className="text-xl font-semibold tabular-nums text-foreground">{dinero(Number(informe.monto_total))}</p>
          </div>
        </div>

        {(informe.referencia || informe.asunto) && (
          <div className="mt-3 rounded-md border border-border bg-secondary/30 p-3 text-sm">
            {informe.referencia && (
              <p>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Ref.</span>{" "}
                {informe.referencia}
              </p>
            )}
            {informe.asunto && (
              <p>
                <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Asunto</span>{" "}
                {informe.asunto}
              </p>
            )}
          </div>
        )}

        {/* Cómo paga y cómo se entrega: las dos preguntas de Central. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Dato icono={<Wallet className="size-3.5" />} titulo="Forma de pago">
            {(informe.modalidad_pago ?? []).length ? (informe.modalidad_pago as string[]).join(" + ") : "—"}
            {informe.forma_pago && (
              <span className="block text-xs text-muted-foreground">{FORMA_PAGO[informe.forma_pago] ?? informe.forma_pago}</span>
            )}
          </Dato>
          <Dato icono={<FileText className="size-3.5" />} titulo="Comprobante">
            {informe.comprobante ? (COMPROBANTE[informe.comprobante] ?? informe.comprobante) : "—"}
          </Dato>
          <Dato icono={<Truck className="size-3.5" />} titulo="Entrega">
            {informe.entrega_fecha ? fechaCalendario(informe.entrega_fecha) : "sin fecha"}
            {informe.entrega_hora && ` · ${informe.entrega_hora}`}
            {(informe.entrega_lugar || informe.entrega_direccion) && (
              <span className="block whitespace-pre-line text-xs text-muted-foreground">
                {[informe.entrega_lugar, informe.entrega_direccion].filter(Boolean).join("\n")}
              </span>
            )}
          </Dato>
        </div>
        {informe.nota_condiciones && (
          <p className="mt-2 text-xs text-muted-foreground">
            <b className="text-foreground">Condiciones:</b> {informe.nota_condiciones}
          </p>
        )}
        {informe.nota_despacho && (
          <p className="mt-1 text-xs text-muted-foreground">
            <b className="text-foreground">Nota de despacho:</b> {informe.nota_despacho}
          </p>
        )}

        {contactos.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {contactos.map(({ titulo: t, c }) => (
              <div key={t} className="rounded-md border border-border p-2.5 text-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{t}</p>
                <p className="mt-0.5 font-medium text-foreground">{c?.nombre ?? "—"}</p>
                {c?.area && <p className="text-xs text-muted-foreground">{c.area}</p>}
                {c?.telefono && <p className="text-xs text-muted-foreground">{c.telefono}</p>}
                {c?.correo && <p className="text-xs text-muted-foreground">{c.correo}</p>}
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel titulo="Equipos">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin equipos cargados.</p>
        ) : (
          <TablaItems items={items} dinero={dinero} subtotal={subtotal} />
        )}
        {gratuitos.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Sin costo para el cliente</p>
            <TablaItems items={gratuitos} dinero={dinero} />
          </div>
        )}
        {((informe.incluye ?? []).length > 0 || informe.gratis || informe.garantia || informe.nota_final) && (
          <div className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            {(informe.incluye ?? []).length > 0 && (
              <p>
                <b className="text-foreground">Incluye:</b> {(informe.incluye as string[]).join(" · ")}
              </p>
            )}
            {informe.gratis && (
              <p>
                <b className="text-foreground">Gratis:</b> {informe.gratis}
              </p>
            )}
            {informe.garantia && (
              <p>
                <b className="text-foreground">Garantía:</b> {informe.garantia}
              </p>
            )}
            {informe.nota_final && (
              <p>
                <b className="text-foreground">Nota:</b> {informe.nota_final}
              </p>
            )}
          </div>
        )}
      </SeccionPanel>

      <div className={cn("grid gap-4", compendio && "lg:grid-cols-2")}>
        <SeccionPanel
          titulo="Documentos del expediente"
          accion={
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold tabular-nums text-foreground">
              {adjuntos.length}
            </span>
          }
        >
          <AdjuntosCierre informeId={informe.id} adjuntos={adjuntos} emitido={emitido} />
          {emitido && !anulado && (
            <p className="mt-3 text-[11px] text-muted-foreground">
              Agregar un documento a un cierre emitido pide el código de operaciones o gerencia y queda firmado con quién lo
              autorizó. Quitar no se puede: el expediente solo crece.
            </p>
          )}
        </SeccionPanel>

        {compendio && <CompendioGestion compendio={compendio} />}
      </div>
    </div>
  );
}

function Dato({ icono, titulo, children }: { icono: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {icono}
        {titulo}
      </p>
      <p className="mt-0.5 text-sm text-foreground">{children}</p>
    </div>
  );
}

function TablaItems({
  items,
  dinero,
  subtotal,
}: {
  items: ItemInforme[];
  dinero: (n: number) => string;
  /** Con subtotal se pinta el pie con IGV y total; sin él (los gratuitos) no. */
  subtotal?: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="pb-2 font-medium">Descripción</th>
            <th className="pb-2 pl-3 text-right font-medium">Cant.</th>
            <th className="pb-2 pl-3 text-right font-medium">P. unitario</th>
            <th className="pb-2 pl-3 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i, n) => (
            <tr key={n} className="border-b border-border align-top last:border-0">
              <td className="whitespace-pre-line py-2 text-foreground">{i.descripcion}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{i.cantidad}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{dinero(Number(i.precio_unitario))}</td>
              <td className="py-2 pl-3 text-right tabular-nums">{dinero(Number(i.cantidad) * Number(i.precio_unitario))}</td>
            </tr>
          ))}
        </tbody>
        {subtotal !== undefined && (
          <tfoot className="text-xs">
            <tr>
              <td colSpan={3} className="pt-2 text-right text-muted-foreground">Subtotal</td>
              <td className="pt-2 pl-3 text-right tabular-nums">{dinero(subtotal)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right text-muted-foreground">IGV {Math.round(IGV * 100)}%</td>
              <td className="pl-3 text-right tabular-nums">{dinero(subtotal * IGV)}</td>
            </tr>
            <tr className="font-semibold text-foreground">
              <td colSpan={3} className="pt-1 text-right">Total</td>
              <td className="pt-1 pl-3 text-right tabular-nums">{dinero(subtotal * (1 + IGV))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
