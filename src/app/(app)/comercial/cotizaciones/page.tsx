import Link from "next/link";
import { FileDown, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AgregarCotizacionVieja } from "@/components/crm/agregar-cotizacion-vieja";
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
 * Estaba. Lo que no había era cómo llegar: «Mi gestión» abre en el mes en curso
 * y su lista corta en 60 documentos por fecha, así que uno de septiembre de 2025
 * quedaba fuera del alcance por más que se eligiera «Todo». Con 2.142
 * documentos suyos en el archivo, filtrar por fecha no alcanza — hace falta
 * buscar por el número, que es como los nombran ellas.
 *
 * Las dos fuentes van juntas porque para la comercial son lo mismo: un
 * presupuesto que le mandó a un cliente. Se distinguen con una marca, no con
 * dos pantallas.
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
  href: string;
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
    .select("id, codigo, serie, total, moneda, enviada_at, oportunidades!inner(comercial_id, cuentas(razon_social))")
    .eq("oportunidades.comercial_id", perfil.id)
    .not("enviada_at", "is", null);

  if (busqueda) {
    // El número se busca tal como lo dicen ellas —"1549" o "1549-25"— y el
    // cliente por cualquier parte del nombre.
    const patron = `%${busqueda}%`;
    qArchivo = qArchivo.or(`codigo.ilike.${patron},cliente.ilike.${patron}`);
    qCrm = qCrm.ilike("codigo", patron);
  }

  const [{ data: archivo, count: totalArchivo }, { data: crm }] = await Promise.all([
    qArchivo
      .order("fecha", { ascending: false, nullsFirst: false })
      .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1),
    qCrm.order("enviada_at", { ascending: false }).limit(POR_PAGINA),
  ]);

  const filas: Fila[] = [
    ...(crm ?? []).map((c) => {
      const op = c.oportunidades as unknown as { cuentas: { razon_social: string } | null } | null;
      return {
        id: c.id,
        codigo: c.codigo,
        serie: c.serie as string,
        cliente: op?.cuentas?.razon_social ?? "Cliente sin nombre",
        fecha: c.enviada_at as string,
        monto: Number(c.total),
        moneda: c.moneda as string,
        href: `/api/cotizaciones/${c.id}/pdf`,
        delArchivo: false,
        nota: null,
      };
    }),
    ...(archivo ?? []).map((c) => ({
      id: c.id,
      codigo: c.codigo,
      serie: c.serie as string,
      cliente: c.cliente as string,
      fecha: c.fecha as string | null,
      monto: c.monto_sin_igv != null ? Number(c.monto_sin_igv) : null,
      moneda: "USD",
      href: `/api/cotizaciones-historicas/${c.id}/pdf`,
      delArchivo: true,
      nota: c.cargada_por ? "cargada a mano" : null,
    })),
  ].sort((a, b) => (a.fecha ?? "") < (b.fecha ?? "") ? 1 : -1);

  const hayMas = (totalArchivo ?? 0) > pag * POR_PAGINA;

  return (
    <SeccionPanel
      titulo="Mis cotizaciones"
      accion={
        <div className="flex items-center gap-2">
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

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda
            ? `No se encontró ninguna cotización suya que diga «${busqueda}». Si está segura de que existe y es de un año anterior, puede agregarla con el botón de arriba.`
            : "Todavía no tiene cotizaciones."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((f) => (
            <a
              key={`${f.delArchivo ? "h" : "c"}-${f.id}`}
              href={f.href}
              target="_blank"
              rel="noreferrer"
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent"
            >
              <span className="w-24 flex-none font-mono text-xs font-semibold text-foreground">
                {f.codigo ?? "—"}
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
                  f.delArchivo ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {f.nota ?? (f.delArchivo ? "del archivo" : "del CRM")}
              </span>
              <FileDown className="size-3.5 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}

      {(pag > 1 || hayMas) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {pag > 1 ? (
            <Link
              href={`/comercial/cotizaciones?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), pagina: String(pag - 1) })}`}
              className="font-medium text-primary hover:underline"
            >
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">Página {pag}</span>
          {hayMas ? (
            <Link
              href={`/comercial/cotizaciones?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), pagina: String(pag + 1) })}`}
              className="font-medium text-primary hover:underline"
            >
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
