import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaCalendario } from "@/lib/fechas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * «Mis cierres»: los informes de cierre de venta del comercial, buscables, y
 * cada uno se abre en su PDF de un clic.
 *
 * POR QUÉ EXISTE. Pedido de Darwin el 28-08: «los cierres deben poder
 * visualizarse como están las cotizaciones (una opción que se haga click y que
 * pueda visualizarse el informe de dicho cierre)».
 *
 * Y no había por dónde. El informe se abría UNA vez, al emitirlo, en una
 * pestaña nueva; después de eso el comercial solo podía volver a verlo entrando
 * a la ficha del cliente —si se acordaba de cuál era— o pidiéndoselo a Central,
 * que sí tenía su lista desde el 21-08. El documento que manda a facturar y a
 * despachar es justo el que más se vuelve a mirar: para confirmarle al cliente
 * qué se acordó, para rehacer un despacho, para saber si el voucher ya está.
 *
 * Es el espejo de «Mis cotizaciones» a propósito —misma fila, misma búsqueda,
 * mismo clic que abre el PDF—: son los dos documentos que produce el comercial
 * y no tienen por qué mirarse de dos maneras distintas.
 *
 * Los BORRADORES van en la misma lista, marcados. Un cierre sin numerar es
 * trabajo a medias que hay que terminar, y esconderlo en otra pantalla es lo
 * que hace que se olvide.
 */

const POR_PAGINA = 40;

export default async function MisCierresPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}) {
  const { q, pagina } = await searchParams;
  const busqueda = (q ?? "").trim();
  const pag = Math.max(1, Number(pagina) || 1);
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  // Por CARTERA, igual que «Mis cotizaciones» (que filtra por
  // oportunidades.comercial_id): el informe es del cliente que uno atiende,
  // aunque lo haya tecleado otra persona. RLS ya lo limita así para un
  // comercial (migración 0049); el filtro explícito es para que la pantalla
  // siga diciendo «mis» cuando la abre gerencia o postventa, que ven todo.
  let consulta = supabase
    .from("informes_cierre")
    .select(
      "id, codigo, serie, fecha, emitido_at, cliente_nombre, cliente_doc, monto_total, moneda, urgente, cuentas!inner(comercial_id)",
      { count: "exact" },
    )
    .eq("cuentas.comercial_id", perfil.id);

  if (busqueda) {
    // Se busca como lo nombran ellas: el Nº del informe ("004-2026" o solo
    // "004") o cualquier parte del nombre del cliente.
    const patron = `%${busqueda}%`;
    consulta = consulta.or(`codigo.ilike.${patron},cliente_nombre.ilike.${patron}`);
  }

  const { data, count } = await consulta
    // Por fecha del documento y, dentro del mismo día, el último primero. Un
    // borrador todavía no tiene emitido_at y queda arriba de los de su día,
    // que es donde conviene que esté: es lo que falta terminar.
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .range((pag - 1) * POR_PAGINA, pag * POR_PAGINA - 1);

  const filas = data ?? [];
  const hayMas = (count ?? 0) > pag * POR_PAGINA;
  const enlace = (p: number) =>
    `/comercial/cierres?${new URLSearchParams({ ...(busqueda ? { q: busqueda } : {}), pagina: String(p) })}`;

  return (
    <SeccionPanel
      titulo="Mis cierres"
      accion={
        <span className="text-xs text-muted-foreground">
          {(count ?? 0).toLocaleString("es-PE")} {count === 1 ? "informe" : "informes"}
        </span>
      }
    >
      <form className="mb-3 flex gap-2" action="/comercial/cierres">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={busqueda}
            placeholder="Nº del informe (004 o 004-2026) o nombre del cliente"
            className="pl-8"
          />
        </div>
        <Button type="submit" size="sm">
          Buscar
        </Button>
        {busqueda && (
          <Link
            href="/comercial/cierres"
            className="self-center text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Limpiar
          </Link>
        )}
      </form>

      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {busqueda
            ? `No se encontró ningún cierre suyo que diga «${busqueda}».`
            : "Todavía no tiene cierres. El informe se genera al cerrar una venta y es lo que Central necesita para facturar y despachar."}
        </p>
      ) : (
        <div className="space-y-1.5">
          {filas.map((f) => (
            // Toda la fila abre el PDF, como en «Mis cotizaciones»: no hay que
            // apuntarle a un botón chico.
            <a
              key={f.id}
              href={`/api/informes/${f.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              title="Abrir el informe de cierre"
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-md border p-2.5 transition-colors hover:bg-accent",
                f.urgente ? "border-destructive/40 bg-destructive/5" : "border-border",
              )}
            >
              <span className="w-24 flex-none font-mono text-xs font-semibold text-foreground">
                {f.emitido_at ? `Nº ${f.codigo}` : "Borrador"}
              </span>
              <span className="min-w-[200px] flex-1 text-sm text-foreground">
                {f.cliente_nombre}
                {f.cliente_doc && (
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{f.cliente_doc}</span>
                )}
              </span>
              <span className="w-24 text-xs tabular-nums text-muted-foreground">{fechaCalendario(f.fecha)}</span>
              <span className="w-28 text-right text-xs tabular-nums text-foreground">
                {f.moneda} {Number(f.monto_total).toLocaleString("es-PE")}
              </span>
              <span
                className={cn(
                  "w-24 rounded-full px-2 py-0.5 text-center text-[10px] font-semibold",
                  f.serie === "OPEN" ? "bg-secondary text-muted-foreground" : "bg-primary/10 text-primary",
                )}
              >
                {f.serie === "OPEN" ? "Open" : "Efameinsa"}
              </span>
              {/* Un cierre sin numerar todavía no llegó a Central: mientras se
                  vea así, se puede terminar. */}
              {!f.emitido_at && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  sin numerar
                </span>
              )}
              {f.urgente && (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-bold text-destructive">
                  URGENTE
                </span>
              )}
              <FileText className="size-3.5 text-muted-foreground" />
            </a>
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
