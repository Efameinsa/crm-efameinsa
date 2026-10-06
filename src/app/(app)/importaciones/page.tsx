import { redirect } from "next/navigation";
import { PackageSearch } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { pendientesDeImportacion } from "@/lib/acciones/importaciones";
import { ListaImportaciones } from "@/components/crm/lista-importaciones";
import { hoyLima } from "@/lib/periodo";

// POR IMPORTAR (0402, 06-10). La pantalla del área de importaciones: las
// máquinas de pedidos abiertos que esperan llegar, con la fecha estimada que
// anota importaciones. Almacén, operaciones y gerencia la ven igual.
export const dynamic = "force-dynamic";

export default async function ImportacionesPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string }> }) {
  const perfil = await requerirPerfil();
  const entra =
    perfil.es_importaciones || perfil.es_almacen || perfil.es_operaciones || perfil.es_soporte || ["gerencia", "admin", "operaciones"].includes(perfil.rol);
  if (!entra) redirect("/nuevo");
  const sp = await searchParams;
  const { filas, error } = await pendientesDeImportacion();

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-[linear-gradient(135deg,rgb(139_21_16/0.07),transparent_60%)] p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#8B1510] text-white">
          <PackageSearch className="size-5" />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Por importar</h1>
          <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">
            Las máquinas de pedidos vendidos que todavía no tienen serie porque no hay stock. Anote la fecha estimada de
            llegada: postventa y el almacén la ven en el pedido y pueden avisar al cliente.
          </p>
        </div>
      </div>
      {error ? (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">No se pudo cargar la lista: {error}</p>
      ) : (
        <ListaImportaciones filas={filas} hoy={hoyLima()} verInicial={sp.ver ?? "importacion"} qInicial={sp.q ?? ""} />
      )}
    </div>
  );
}
