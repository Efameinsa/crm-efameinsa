import Link from "next/link";
import { FolderX } from "lucide-react";
import { requerirRol } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ListaFichasSueltas, type FichaSuelta } from "@/components/crm/lista-fichas-sueltas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * FICHAS SUELTAS (0513). Fichas sin expedientes, casos, máquinas, prospectos,
 * cierres, pedidos ni cotizaciones: casi siempre duplicados o cascarones que
 * nadie usa. Se archivan para que no confundan al buscar un cliente.
 */
export default async function FichasSueltasPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirRol(["admin", "gerencia", "operaciones"]);
  const archivadas = (await searchParams).ver === "archivadas";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fichas_sueltas", { p_archivadas: archivadas });
  const fichas = (data ?? []) as FichaSuelta[];

  const pestaña = (activa: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium",
      activa ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:bg-accent",
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FolderX className="size-5 text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">Fichas sueltas</h1>
          <p className="text-xs text-muted-foreground">
            Fichas de cliente sin expedientes, casos, máquinas, prospectos, cierres ni cotizaciones. Archívelas para que no
            confundan al buscar; si es un duplicado de otra ficha con historia, únalo desde su ficha.
          </p>
        </div>
      </div>
      <div className="flex gap-2">
        <Link href="/admin/fichas-sueltas" className={pestaña(!archivadas)}>
          Sueltas
        </Link>
        <Link href="/admin/fichas-sueltas?ver=archivadas" className={pestaña(archivadas)}>
          Archivadas
        </Link>
      </div>
      {error ? (
        <p className="text-sm text-destructive">No se pudo leer la lista: {error.message}</p>
      ) : (
        <ListaFichasSueltas fichas={fichas} archivadas={archivadas} />
      )}
    </div>
  );
}
