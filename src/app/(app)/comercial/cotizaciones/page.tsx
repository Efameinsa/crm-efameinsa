import Link from "next/link";
import { FileDown, PencilLine, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AgregarCotizacionVieja } from "@/components/crm/agregar-cotizacion-vieja";
import { CorregirCotizacionBoton } from "@/components/crm/corregir-cotizacion-boton";
import { fechaLima } from "@/lib/fechas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * «Mis cotizaciones»: todas las del comercial, del CRM y del archivo, buscables
 * por número y por cliente.
 *
 * POR QUÉ EXISTE. Pedido textual del ing. Carlos el 21-08: «yo he cotizado el
 * mes pasado un equipo para este cliente, ¿cómo puedo filtrar mis
 * cotizaciones? ¿Dónde veo mis cotizaciones en general? Por día, semana, mes,
 * año». Y lo confirmó Brenda el 25-08 con un caso concreto: su 1549-25 de SAYWA
 * «no está en el sistema».
 *
 * Estaba. Lo que no había era cómo llegar: «Mi gestión» abre en la semana en curso
 * y su lista corta en 60 documentos por fecha, así que uno de septiembre de 2025
 * quedaba fuera del alcance por más que se eligiera «Todo». Con 2.142
 * documentos suyos en el archivo, filtrar por fecha no alcanza — hace falta
 * buscar por el número, que es como los nombran ellas.
 *
 * Las dos fuentes van juntas porque para la comercial son lo mismo: un
 * presupuesto que le mandó a un cliente. Se distinguen con una marca, no con
 * dos pantallas.
 *
 * LOS BORRADORES TAMBIÉN (03-09). Hasta hoy esta lista solo traía lo que ya
 * salió con número, así que un borrador del CRM no aparecía en ninguna
 * pantalla salvo la de su oportunidad. Santos: «lo mismo con las cotizaciones,
 * agregar esa opción para editar sin necesidad de pedir PIN; el PIN se pide
 * solo cuando ya hay una numeración». Van arriba, marcados, y la fila abre el
 * cotizador; lo numerado abre el PDF y ofrece «Corregir», que sí pide el
 * código (0123). Es la misma regla que en «Mis cierres».
 */

const POR_PAGINA = 40;

interface Fila {
  id: string;
  codigo: string | null;
  serie: string;
  cliente: string;
  fecha: string | null;
  monto: number | null;
  moneda: string;
  /** A dónde lleva la fila entera: el PDF, o el cotizador si es borrador. */
  href: string;
  /** Un borrador del CRM: sin número, se edita sin código. */
  borrador: boolean;
  /** Solo lo numerado del CRM: de dónde cuelga la corrección con código. */
  oportunidadHref: string | null;
  delArchivo: boolean;
  nota: string | null;
}

export default async function MisCotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina } = await searchParams;
  const busqueda = (q ?? "").trim();
  const pag = Math.max(1, Number(pagina) || 1);
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const anioActual = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4));

  let qArchivo = supabase
    .from("cotizaciones_historicas")
    .select("id, codigo, serie, cliente, fecha, monto_sin_igv, anio, cargada_por", { count: "exact" })
    .eq("comercial_id", perfil.id);
  let qCrm = supabase
    .from("cotizaciones")
    .select("id, codigo, serie, total, moneda, enviada_at, oportunidad_id, oportunidades!inner(comercial_id, cuentas(razon_social))")
    .eq("oportunidades.comercial_id", perfil.id)
    .not("enviada_at", "is", null);
  // Los borradores no tienen número: se buscan por el cliente, en memoria, y
  // solo en la primera página — son pocos y son lo que falta terminar.
  const qBorradores =
    pag === 1
      ? supabase
          .from("cotizaciones")
          .select("id, codigo, serie, total, moneda, created_at, oportunidad_id, oportunidades!inner(comercial_id, cuentas(razon_social))")
          .eq("oportunidades.comercial_id", perfil.id)
          .eq("estado", "borrador")
          .is("enviada_at", null)
          .order("created_at", { ascending: false })
          .limit(POR_PAGINA)
      : null;

  if (busqueda) {
    // El número se busca tal como lo dicen ellas —"1549" o "1549-25"— y el
    // cliente por cualquier parte del nombre.
    const patron = `%${busqueda}%`;
    qArchivo = qArchivo.or(`codigo.ilike.${patron},cliente.ilike.${patron}`);
    qCrm = qCrm.ilike("codigo", patron);
  }

  const [{ data: archivo, count: totalArchivo }, { data: crm }, borradoresCrudos] = await Promise.all([
    qArchivo
      .order("fecha", { ascending: false, nullsFirst: false })
      .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1),
    qCrm.order("enviada_at", { ascending: false }).limit(POR_PAGINA),
    qBorradores ? qBorradores.then((r) => r.data ?? []) : Promise.resolve([]),
  ]);

  const razonSocial = (op: unknown) =>
    (op as { cuentas: { razon_social: string } | null } | null)?.cuentas?.razon_social ?? "Cliente sin nombre";
  const contiene = (texto: string) => texto.toLowerCase().includes(busqueda.toLowerCase());

  const borradores: Fila[] = borradoresCrudos
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as string,
      cliente: razonSocial(c.oportunidades),
      fecha: c.created_at as string,
      monto: Number(c.total),
      moneda: c.moneda as string,
      href: `/comercial/oportunidades/${c.oportunidad_id}/cotizar/${c.id}`,
      borrador: true,
      oportunidadHref: null,
      delArchivo: false,
      nota: null,
    }))
    .filter((f) => !busqueda || contiene(f.cliente) || (f.codigo != null && contiene(f.codigo)));

  const filas: Fila[] = [
    ...(crm ?? []).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as string,
      cliente: razonSocial(c.oportunidades),
      fecha: c.enviada_at as string,
      monto: Number(c.total),
      moneda: c.moneda as string,
      href: `/api/cotizaciones/${c.id}/pdf`,
      borrador: false,
      oportunidadHref: `/comercial/oportunidades/${c.oportunidad_id}`,
      delArchivo: false,
      nota: null,
    })),
    ...(archivo ?? []).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as string,
      cliente: c.cliente as string,
      fecha: c.fecha as string | null,
      monto: c.monto_sin_igv != null ? Number(c.monto_sin_igv) : null,
      moneda: "USD",
      href: `/api/cotizaciones-historicas/${c.id}/pdf`,
      borrador: false,
      oportunidadHref: null,
      delArchivo: true,
      nota: c.cargada_por ? "cargada a mano" : null,
    })),
  ].sort((a, b) => ((a.fecha ?? "") < (b.fecha ?? "") ? 1 : -1));

  const hayMas = (totalArchivo ?? 0) > pag * POR_PAGINA;
  const enlace = (p: number) =>
    `/comercial/cotizaciones?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), pagina: String(p) })}`;

  const FilaCotizacion = ({ f }: { f: Fila }) => (
    // La fila entera es un enlace estirado por encima: así adentro puede haber
    // un botón de verdad («Corregir» abre un cuadro) sin anidarlo en un <a>.
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent",
        f.borrador ? "border-amber-500/40 bg-amber-500/5" : "border-border",
      )}
    >
      {f.borrador ? (
        <Link
          href={f.href}
          title="Seguir editando el borrador"
          aria-label={`Editar el borrador de ${f.cliente}`}
          className="absolute inset-0 rounded-md"
        />
      ) : (
        <a
          href={f.href}
          target="_blank"
          rel="noreferrer"
          title="Abrir el PDF"
          aria-label={`Abrir el PDF de ${f.codigo ?? f.cliente}`}
          className="absolute inset-0 rounded-md"
        />
      )}
      <span
        className={cn(
          "w-24 flex-none font-mono text-xs font-semibold",
          f.borrador ? "text-amber-700" : "text-foreground",
        )}
      >
        {f.borrador ? "Borrador" : (f.codigo ?? "—")}
      </span>
      <span className="min-w-[200px] flex-1 text-sm text-foreground">{f.cliente}</span>
      <span className="w-24 text-xs tabular-nums text-muted-foreground">
        {f.fecha ? fechaLima(f.fecha) : "sin fecha"}
      </span>
      <span className="w-28 text-right text-xs tabular-nums text-foreground">
        {f.monto != null ? `${f.moneda} ${f.monto.toLocaleString("es-PE")}` : "—"}
      </span>
      <span
        className={cn(
          "w-24 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold",
          f.borrador
            ? "bg-amber-500/10 text-amber-700"
            : f.delArchivo
              ? "bg-secondary text-muted-foreground"
              : "bg-primary/10 text-primary",
        )}
      >
        {f.borrador ? "sin numerar" : (f.nota ?? (f.delArchivo ? "del archivo" : "del CRM"))}
      </span>
      <span className="relative z-10 flex w-28 items-center justify-end gap-2 text-[11px]">
        {f.borrador ? (
          <>
            <Link
              href={f.href}
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              <PencilLine className="size-3" /> Editar
            </Link>
            <a
              href={`/api/cotizaciones/${f.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              title="Abrir el borrador en PDF"
              aria-label={`Abrir el borrador en PDF de ${f.cliente}`}
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FileDown className="size-3.5" />
            </a>
          </>
        ) : (
          <>
            {/* Corregir conservando el número pide el código de operaciones o
                gerencia (0123): es el único camino sobre un documento que el
                cliente ya tiene. */}
            {f.oportunidadHref && (
              <CorregirCotizacionBoton cotizacionId={f.id} codigo={f.codigo} volverHref={f.oportunidadHref} variante="enlace" />
            )}
            <FileDown className="size-3.5 text-muted-foreground" />
          </>
        )}
      </span>
    </div>
  );

  return (
    <SeccionPanel
      titulo="Mis cotizaciones"
      accion={
        <div className="flex flex-wrap items-center gap-2">
          {borradores.length > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {borradores.length} {borradores.length === 1 ? "borrador" : "borradores"}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {(totalArchivo ?? 0).toLocaleString("es-PE")} en el archivo
          </span>
          <AgregarCotizacionVieja anioActual={anioActual} />
        </div>
      }
    >
      <form className="mb-3 flex gap-2" action="/comercial/cotizaciones">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={busqueda}
            placeholder="Número (1549 o 1549-25) o nombre del cliente"
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm">Buscar</Button>
        {busqueda && (
          <Link
            href="/comercial/cotizaciones"
            className="self-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </Link>
        )}
      </form>

      {borradores.length > 0 && (
        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Borradores sin número · se editan sin código; el número llega al confirmar
          </p>
          <div className="space-y-1.5">
            {borradores.map((f) => (
              <FilaCotizacion key={`b-${f.id}`} f={f} />
            ))}
          </div>
        </div>
      )}

      {filas.length === 0 && borradores.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda
            ? `No se encontró ninguna cotización suya que diga «${busqueda}». Si está segura de que existe y es de un año anterior, puede agregarla con el botón de arriba.`
            : "Todavía no tiene cotizaciones."}
        </p>
      ) : filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna cotización numerada dice «{busqueda}».</p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((f) => (
            <FilaCotizacion key={`${f.delArchivo ? "h" : "c"}-${f.id}`} f={f} />
          ))}
        </div>
      )}

      {(pag > 1 || hayMas) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {pag > 1 ? (
            <Link href={enlace(pag - 1)} className="font-medium text-primary hover:underline">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">Página {pag}</span>
          {hayMas ? (
            <Link href={enlace(pag + 1)} className="font-medium text-primary hover:underline">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </SeccionPanel>
  );
}
