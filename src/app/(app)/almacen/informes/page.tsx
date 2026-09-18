import Link from "next/link";
import { Printer, Package, ArrowUpToLine, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { InformeAlmacenNuevo } from "@/components/crm/informe-almacen-nuevo";
import { SubirAPostventaBoton } from "@/components/crm/subir-a-postventa-boton";
import { deQuePuedeSerElInforme } from "@/lib/acciones/almacen";
import { etiquetaTipoServicio, etiquetaClaseAlmacen, CLASES_INFORME_ALMACEN } from "@/lib/postventa";
import { fechaLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Fila {
  id: string;
  correlativo: number | null;
  anio: number;
  tipo: string;
  clase_almacen: string | null;
  servicio_id: string | null;
  atencion_id: string | null;
  elevado_a_postventa_at: string | null;
  ejecutado_at: string;
  tecnico: string | null;
  cliente_texto: string | null;
  equipo_texto: string | null;
  cuentas: { razon_social: string } | null;
}

const VISTAS: Record<string, string> = {
  "": "Todos los informes",
  almacen: "Los del almacén",
  por_subir: "Por subir a postventa",
  postventa: "Los de postventa",
};

/**
 * Los informes técnicos, para el almacén (0246 → 0252): la vista macro de
 * todo lo hecho. Los del almacén se crean acá (puesta en marcha, soporte por
 * videollamada, mtto en planta) y se suben a postventa con un check; los de
 * postventa se leen. Desde cada informe se va al pedido —sin precios— o a la
 * atención.
 */
export default async function InformesAlmacenPage({ searchParams }: { searchParams: Promise<{ ver?: string; q?: string; clase?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const ver = sp.ver && sp.ver in VISTAS ? sp.ver : "";
  const claseFiltro = CLASES_INFORME_ALMACEN.some((c) => c.clave === sp.clase) ? sp.clase! : "";
  const supabase = await createClient();
  let consulta = supabase
    .from("informes_servicio")
    .select("id, correlativo, anio, tipo, clase_almacen, servicio_id, atencion_id, elevado_a_postventa_at, ejecutado_at, tecnico, cliente_texto, equipo_texto, cuentas(razon_social)")
    .not("emitido_at", "is", null)
    .order("ejecutado_at", { ascending: false })
    .limit(200);
  // `.filter()` en vez de `.not()/.is()/.eq()` encadenados: reasignar la consulta
  // con esos tres hacía que TypeScript se perdiera en los tipos (TS2589).
  if (ver === "almacen") consulta = consulta.filter("clase_almacen", "not.is", null);
  if (ver === "por_subir") consulta = consulta.filter("clase_almacen", "not.is", null).filter("elevado_a_postventa_at", "is", null);
  if (ver === "postventa") consulta = consulta.filter("clase_almacen", "is", null);
  if (claseFiltro) consulta = consulta.filter("clase_almacen", "eq", claseFiltro);
  const [{ data }, deQue] = await Promise.all([consulta, deQuePuedeSerElInforme()]);
  const filas = (data ?? []) as unknown as Fila[];
  const porSubir = filas.filter((f) => f.clase_almacen && !f.elevado_a_postventa_at).length;

  return (
    <SeccionPanel titulo="Informes técnicos" accion={<InformeAlmacenNuevo pedidos={deQue.pedidos} atenciones={deQue.atenciones} />}>
      <p className="mb-3 text-xs text-muted-foreground">
        Prueba y embalaje y el despacho van con fotos y check en el pedido. Acá se escriben los informes de puesta en marcha,
        soporte por videollamada y mantenimiento en planta, y se suben a postventa.
        {porSubir > 0 && <span className="ml-1 font-semibold text-amber-700">{porSubir} sin subir.</span>}
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {Object.entries(VISTAS).map(([k, v]) => (
          <Link key={k} href={k ? `/almacen/informes?ver=${k}` : "/almacen/informes"} className={cn("rounded-full border px-2.5 py-0.5 text-xs", ver === k ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary")}>
            {v}
          </Link>
        ))}
        {/* La vista por cliente → por máquina (Carlos, 18-09): todo lo hecho en orden. */}
        <Link href="/almacen/informes/clientes" className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold hover:bg-secondary">
          Por cliente →
        </Link>
        <span className="mx-1 text-border">|</span>
        {CLASES_INFORME_ALMACEN.map((c) => (
          <Link key={c.clave} href={`/almacen/informes?clase=${c.clave}`} className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", claseFiltro === c.clave ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary")}>
            {c.etiqueta}
          </Link>
        ))}
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay informes en esta vista. Los del almacén se crean con «Nuevo informe».</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.map((i) => {
            const clase = etiquetaClaseAlmacen(i.clase_almacen);
            return (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <span className="w-24 flex-none font-mono text-xs text-muted-foreground">
                  {i.correlativo != null ? `${String(i.correlativo).padStart(3, "0")}-${i.anio}` : "s/n"}
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={`/postventa/informes/${i.id}`} className="block font-semibold text-foreground hover:underline">
                    {i.cuentas?.razon_social ?? i.cliente_texto ?? "Cliente sin nombre"}
                  </Link>
                  <span className="line-clamp-1 break-words text-xs text-muted-foreground">
                    {clase ?? etiquetaTipoServicio(i.tipo)} · {fechaLima(i.ejecutado_at)}
                    {i.tecnico ? ` · ${i.tecnico}` : ""}
                    {i.equipo_texto ? ` · ${i.equipo_texto}` : ""}
                  </span>
                </span>
                {i.clase_almacen &&
                  (i.elevado_a_postventa_at ? (
                    <span className="inline-flex items-center gap-1 text-xs text-[#1E7F4F]">
                      <CheckCircle2 className="size-3.5" /> En postventa · {fechaLima(i.elevado_a_postventa_at)}
                    </span>
                  ) : (
                    <SubirAPostventaBoton informeId={i.id} />
                  ))}
                {i.servicio_id && (
                  <Link href={`/almacen/pedidos/${i.servicio_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <Package className="size-3.5" /> Ver el pedido
                  </Link>
                )}
                {i.atencion_id && (
                  <Link href={`/postventa/atenciones/${i.atencion_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <ArrowUpToLine className="size-3.5 rotate-90" /> Ver la atención
                  </Link>
                )}
                <Link href={`/postventa/informes/${i.id}/imprimir`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Printer className="size-3.5" /> Imprimir
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </SeccionPanel>
  );
}
