import Link from "@/components/enlace";
import { Building2, Package, Wrench, FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { BusquedaEnVivo } from "@/components/crm/busqueda-en-vivo";

export const dynamic = "force-dynamic";

/**
 * Informes técnicos POR CLIENTE (Carlos, reunión del 18-09): «yo ingreso acá
 * y debería ver todos mis clientes; entro a uno y veo sus máquinas; le doy
 * clic a la máquina y veo todo lo que se ha gestionado en orden». Esta es la
 * primera puerta: los clientes que tienen máquinas en el parque o pedidos en
 * el circuito, con cuánto hay de cada cosa.
 */
export default async function ClientesInformesAlmacenPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requerirPerfil();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const supabase = await createClient();

  // Tres consultas cortas y se juntan acá: las cuentas con máquinas, con pedidos
  // y con informes. Un cliente aparece si tiene al menos una de las tres.
  const [{ data: equipos }, { data: pedidos }, { data: informes }] = await Promise.all([
    supabase.from("equipos_instalados").select("cuenta_id, cliente_texto").not("cuenta_id", "is", null).limit(3000),
    supabase.from("servicios_postventa").select("cuenta_id, cliente_texto, completado").not("cuenta_id", "is", null).limit(3000),
    supabase.from("informes_servicio").select("cuenta_id, cliente_texto").not("emitido_at", "is", null).not("cuenta_id", "is", null).limit(3000),
  ]);
  const limpiar = (t: string | null | undefined) => (t ?? "").replace(/^\d{8,11}\s*-\s*/, "").trim();
  const porCuenta = new Map<string, { nombre: string; maquinas: number; pedidos: number; enCurso: number; informes: number }>();
  const fila = (id: string, nombre: string | null | undefined) => {
    let f = porCuenta.get(id);
    if (!f) {
      f = { nombre: limpiar(nombre) || "Cliente sin nombre", maquinas: 0, pedidos: 0, enCurso: 0, informes: 0 };
      porCuenta.set(id, f);
    } else if (f.nombre === "Cliente sin nombre" && limpiar(nombre)) f.nombre = limpiar(nombre);
    return f;
  };
  for (const e of equipos ?? []) fila(e.cuenta_id as string, e.cliente_texto).maquinas++;
  for (const p of pedidos ?? []) {
    const f = fila(p.cuenta_id as string, p.cliente_texto);
    f.pedidos++;
    if (!p.completado) f.enCurso++;
  }
  for (const i of informes ?? []) fila(i.cuenta_id as string, i.cliente_texto).informes++;

  const ids = [...porCuenta.keys()];
  const { data: cuentas } = ids.length ? await supabase.from("cuentas").select("id, razon_social, num_doc, departamento").in("id", ids.slice(0, 1000)) : { data: [] };
  for (const c of cuentas ?? []) {
    const f = porCuenta.get(c.id);
    if (f && c.razon_social) f.nombre = c.razon_social;
  }
  const docDe = new Map((cuentas ?? []).map((c) => [c.id, c]));

  const norm = (s: string) => s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nq = norm(q);
  const filas = [...porCuenta.entries()]
    .map(([id, f]) => ({ id, ...f, doc: docDe.get(id)?.num_doc ?? null, zona: docDe.get(id)?.departamento ?? null }))
    .filter((f) => !nq || norm(`${f.nombre} ${f.doc ?? ""}`).includes(nq))
    .sort((a, b) => b.enCurso - a.enCurso || b.maquinas - a.maquinas || a.nombre.localeCompare(b.nombre));

  return (
    <SeccionPanel titulo="Informes técnicos · por cliente">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/almacen/informes" className="rounded-full border border-border px-2.5 py-0.5 text-xs hover:bg-secondary">Todos los informes</Link>
        <span className="rounded-full border border-primary bg-primary px-2.5 py-0.5 text-xs text-primary-foreground">Por cliente</span>
      </div>
      <form method="get" className="mb-3">
        <BusquedaEnVivo inicial={q} placeholder="Buscar cliente por nombre o RUC" />
      </form>
      <p className="mb-3 text-xs text-muted-foreground">
        {filas.length} clientes con máquinas, pedidos o informes. Entre a uno para ver sus máquinas y, en cada una, todo lo hecho en orden.
      </p>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún cliente coincide con «{q}».</p>
      ) : (
        <ul className="divide-y divide-border">
          {filas.slice(0, 300).map((f) => (
            <li key={f.id}>
              <Link href={`/almacen/informes/clientes/${f.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 hover:bg-accent">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Building2 className="size-3.5 text-muted-foreground" /> {f.nombre}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {f.doc ?? "sin RUC"}
                    {f.zona ? ` · ${f.zona}` : ""}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Máquinas en el parque">
                  <Wrench className="size-3.5" /> {f.maquinas}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Pedidos (en curso)">
                  <Package className="size-3.5" /> {f.pedidos}
                  {f.enCurso > 0 && <span className="font-semibold text-amber-700">({f.enCurso} en curso)</span>}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Informes">
                  <FileText className="size-3.5" /> {f.informes}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SeccionPanel>
  );
}
