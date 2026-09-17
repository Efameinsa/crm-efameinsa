import Link from "next/link";
import { Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { etiquetaTipoServicio } from "@/lib/postventa";
import { fechaLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

interface Fila {
  id: string;
  correlativo: number | null;
  anio: number;
  tipo: string;
  ejecutado_at: string;
  tecnico: string | null;
  cliente_texto: string | null;
  equipo_texto: string | null;
  cuentas: { razon_social: string } | null;
}

/** Los informes técnicos, para el almacén (0246): «me tienen que llegar los reportes técnicos en detalle» (Lesly, 16-09). */
export default async function InformesAlmacenPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("informes_servicio")
    .select("id, correlativo, anio, tipo, ejecutado_at, tecnico, cliente_texto, equipo_texto, cuentas(razon_social)")
    .not("emitido_at", "is", null)
    .order("ejecutado_at", { ascending: false })
    .limit(150);
  const filas = (data ?? []) as unknown as Fila[];
  return (
    <SeccionPanel titulo="Informes técnicos">
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay informes emitidos.</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
              <span className="w-24 flex-none font-mono text-xs text-muted-foreground">
                {i.correlativo != null ? `${String(i.correlativo).padStart(3, "0")}-${i.anio}` : "s/n"}
              </span>
              <span className="min-w-0 flex-1">
                <Link href={`/postventa/informes/${i.id}`} className="block font-semibold text-foreground hover:underline">
                  {i.cuentas?.razon_social ?? i.cliente_texto ?? "Cliente sin nombre"}
                </Link>
                <span className="line-clamp-1 break-words text-xs text-muted-foreground">
                  {etiquetaTipoServicio(i.tipo)} · {fechaLima(i.ejecutado_at)}
                  {i.tecnico ? ` · ${i.tecnico}` : ""}
                  {i.equipo_texto ? ` · ${i.equipo_texto}` : ""}
                </span>
              </span>
              <Link href={`/postventa/informes/${i.id}/imprimir`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Printer className="size-3.5" /> Imprimir
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SeccionPanel>
  );
}
