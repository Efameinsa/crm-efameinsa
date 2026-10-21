import { Copy } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cargarSupervisores } from "@/lib/supervisores";
import { ListaFichasRepetidas, type FichaRepetida } from "@/components/crm/lista-fichas-repetidas";
import { ListaFichasParecidas, type ParParecido } from "@/components/crm/lista-fichas-parecidas";
import Link from "@/components/enlace";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * FICHAS REPETIDAS (0556, reunión de gerencia 20-10, Family Farm / Valle
 * Pampa). El mismo cliente con dos fichas —una con RUC y otra con el nombre
 * tipeado— parte el historial en dos: la cotización en una, las gestiones en
 * la otra, y el expediente que se abre después no encuentra nada. Aquí se ven
 * los grupos y se unen. Central, operaciones y gerencia.
 */
export default async function FichasRepetidasPage({ searchParams }: { searchParams: Promise<{ ver?: string; min?: string }> }) {
  await requerirRol(["admin", "gerencia", "operaciones", "central"]);
  const sp = await searchParams;
  // «Parecidas»: el mismo cliente registrado distinto, para revisarlo a mano (0571, Santos 21-10).
  const verParecidas = sp.ver === "parecidas";
  const min = [80, 60, 45].includes(Number(sp.min)) ? Number(sp.min) : 60;
  const supabase = await createClient();
  const parecidas = verParecidas
    ? await supabase.rpc("fichas_parecidas_para_revisar", { p_min: min, p_limite: 600 })
    : null;
  const pares = ((parecidas?.data ?? []) as (ParParecido & { calculado_at: string })[]);
  const [{ data, error }, supervisores] = await Promise.all([supabase.rpc("fichas_repetidas", { p_solo_comercial: null }), cargarSupervisores(supabase)]);
  const grupos = ((data ?? []) as { clave: string; cuentas: FichaRepetida[] }[]).filter((g) => Array.isArray(g.cuentas) && g.cuentas.length > 1);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Copy className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Fichas repetidas</h1>
          <p className="text-xs text-muted-foreground">
            Clientes con dos o más fichas que se llaman igual (sin contar tildes, puntos ni S.A.C.), con movimiento en al menos una, o con el mismo documento: el mismo RUC/DNI, o el DNI de una persona dentro de su RUC 10 (0569, gerencia 20-10). Unirlas junta
            expedientes, contactos, casos, máquinas y pedidos en una sola. Si no son el mismo, márquelo y el grupo no vuelve a salir.
          </p>
        </div>
      </div>
      <div className="flex gap-1 text-sm">
        <Link
          href="/fichas-repetidas"
          className={cn("rounded-md border px-3 py-1 font-medium", !verParecidas ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}
        >
          Iguales (mismo nombre o documento)
        </Link>
        <Link
          href="/fichas-repetidas?ver=parecidas"
          className={cn("rounded-md border px-3 py-1 font-medium", verParecidas ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent")}
        >
          Parecidas: revisar a mano
        </Link>
      </div>
      {verParecidas ? (
        parecidas?.error ? (
          <p className="text-sm text-destructive">No se pudo leer la lista: {parecidas.error.message}</p>
        ) : (
          <ListaFichasParecidas pares={pares} supervisores={supervisores} min={min} calculadoAt={pares[0]?.calculado_at ?? null} />
        )
      ) : error ? (
        <p className="text-sm text-destructive">No se pudo leer la lista: {error.message}</p>
      ) : grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No hay fichas repetidas con movimiento. Las que se marcaron como «no son el mismo» ya no salen.
        </p>
      ) : (
        <ListaFichasRepetidas grupos={grupos} supervisores={supervisores} />
      )}
    </div>
  );
}
