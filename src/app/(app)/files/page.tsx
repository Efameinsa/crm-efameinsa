import { Archive, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AccionFile, PedirFiles } from "@/components/crm/files-acciones";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * FILES — EL CUADERNO DE CARGOS EN EL CRM (0334).
 *
 * Carlos, reunión del 24-09: los archivadores físicos se piden a Central por
 * correo y ella los entrega con su cuaderno de cargos; «cero control», nadie
 * sabe quién tiene qué y se pasan el día buscándolos. Acá queda: quién lo
 * pidió y cuándo, cuándo lo entregó Central, cuándo firmó quien lo recibió y
 * cuándo volvió. Y la pregunta del día: ¿quién tiene cada file?
 *
 * Todos piden y ven lo suyo. Central —y quien supervisa: operaciones,
 * gerencia— lleva el cuaderno: entrega, recibe de vuelta y ve lo prestado.
 * Un file prestado de un día para otro sale en rojo: «máximo al final del
 * día… mañana me lo devuelves».
 */

type Fila = {
  id: string;
  grupo: string;
  solicitado_at: string;
  nota: string | null;
  entregado_at: string | null;
  recibido_at: string | null;
  devuelto_at: string | null;
  anulado_at: string | null;
  cliente_texto: string | null;
  cliente_doc: string | null;
  empresa: "open" | "efameinsa" | "ambos" | null;
  cuentas: { razon_social: string; num_doc: string | null } | null;
  solicitante: { id: string; nombre: string; codigo_comercial: string | null } | null;
  entrego: { nombre: string } | null;
  recibio_vuelta: { nombre: string } | null;
};

const diaLima = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Lima" });
// De qué empresa es el archivador (0341); los pedidos anteriores no lo decían.
const EMPRESA: Record<NonNullable<Fila["empresa"]>, string> = { open: "OPEN", efameinsa: "EFAMEINSA", ambos: "OPEN y EFAMEINSA" };
const quien = (p: Fila["solicitante"]) => (p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "—");

export default async function FilesPage() {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const llevaElCuaderno = ["central", "gerencia", "admin", "operaciones"].includes(perfil.rol) || Boolean(perfil.es_operaciones);

  const { data } = await supabase
    .from("prestamos_file")
    .select(
      `id, grupo, solicitado_at, nota, entregado_at, recibido_at, devuelto_at, anulado_at, cliente_texto, cliente_doc, empresa,
       cuentas(razon_social, num_doc),
       solicitante:perfiles!prestamos_file_solicitado_por_fkey(id, nombre, codigo_comercial),
       entrego:perfiles!prestamos_file_entregado_por_fkey(nombre),
       recibio_vuelta:perfiles!prestamos_file_devuelto_recibido_por_fkey(nombre)`,
    )
    .order("solicitado_at", { ascending: false })
    .limit(400);
  const filas = (data ?? []) as unknown as Fila[];
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });

  const vivos = filas.filter((f) => !f.anulado_at && !f.devuelto_at);
  const porEntregar = vivos.filter((f) => !f.entregado_at).sort((a, b) => a.solicitado_at.localeCompare(b.solicitado_at));
  const prestados = vivos.filter((f) => f.entregado_at).sort((a, b) => a.entregado_at!.localeCompare(b.entregado_at!));
  const mios = filas.filter((f) => f.solicitante?.id === perfil.id);
  const misVivos = mios.filter((f) => !f.anulado_at && !f.devuelto_at);
  const historial = filas.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 60);

  const estado = (f: Fila) => {
    if (f.anulado_at) return { texto: "Anulado", tono: "bg-muted text-muted-foreground" };
    if (f.devuelto_at) return { texto: `Devuelto ${fechaHoraLima(f.devuelto_at)}`, tono: "bg-[#1E7F4F]/10 text-[#1E7F4F]" };
    if (f.entregado_at) {
      const vencido = diaLima(f.entregado_at) < hoy;
      return { texto: `${vencido ? "Prestado desde" : "Entregado"} ${fechaHoraLima(f.entregado_at)}${f.recibido_at ? "" : " · falta firmar «Recibí»"}`, tono: vencido ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-800" };
    }
    return { texto: `Pedido ${fechaHoraLima(f.solicitado_at)}`, tono: "bg-sky-500/10 text-sky-800" };
  };

  const fila = (f: Fila, acciones: React.ReactNode, conQuien = true) => {
    const e = estado(f);
    return (
      <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <Archive className="size-4 flex-none text-primary" />
        <div className="min-w-[12rem] flex-1">
          <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-foreground">
            <span className="max-w-full shrink-0 truncate">{f.cliente_texto ?? f.cuentas?.razon_social ?? "Cliente"}</span>
            {f.empresa && <span className="flex-none rounded border border-primary/30 px-1.5 py-px text-[10px] font-bold tracking-wide text-primary">{EMPRESA[f.empresa]}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {conQuien && <>Lo pidió <b className="font-semibold text-foreground">{quien(f.solicitante)}</b> · </>}
            {(f.cliente_doc ?? f.cuentas?.num_doc) ? `${f.cliente_doc ?? f.cuentas?.num_doc} · ` : ""}
            {f.nota ? `«${f.nota}»` : "sin nota"}
            {f.entrego ? ` · entregó ${f.entrego.nombre}` : ""}
            {f.recibio_vuelta ? ` · recibió de vuelta ${f.recibio_vuelta.nombre}` : ""}
          </p>
        </div>
        <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-semibold", e.tono)}>{e.texto}</span>
        <div className="flex gap-2">{acciones}</div>
      </li>
    );
  };

  const vencidos = prestados.filter((f) => diaLima(f.entregado_at!) < hoy).length;

  return (
    <div className="space-y-4">
      {/* Central lleva el archivador: no se pide files a sí misma. */}
      {perfil.rol !== "central" && (
        <SeccionPanel titulo="Pedir files a Central">
          <p className="mb-3 text-xs text-muted-foreground">
            El archivador físico del cliente. Agregue uno o varios y marque si es el de OPEN, el de EFAMEINSA o los dos; Central recibe el aviso, se lo entrega y usted firma con «Recibí el file». Devuélvalo al terminar el día.
          </p>
          <PedirFiles />
        </SeccionPanel>
      )}

      {misVivos.length > 0 && (
        <SeccionPanel titulo={`Mis files · ${misVivos.length}`}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {misVivos.map((f) =>
              fila(
                f,
                <>
                  {f.entregado_at && !f.recibido_at && <AccionFile id={f.id} accion="recibi" variante="default" />}
                  {!f.entregado_at && <AccionFile id={f.id} accion="anular" variante="ghost" />}
                </>,
                false,
              ),
            )}
          </ul>
        </SeccionPanel>
      )}

      {llevaElCuaderno && (
        <>
          <SeccionPanel titulo={`Por entregar · ${porEntregar.length}`}>
            {porEntregar.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No hay pedidos de files esperando.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {porEntregar.map((f) => fila(f, <><AccionFile id={f.id} accion="entregar" variante="default" /><AccionFile id={f.id} accion="anular" variante="ghost" /></>))}
              </ul>
            )}
          </SeccionPanel>
          <SeccionPanel titulo={`Prestados · ${prestados.length}${vencidos ? ` · ${vencidos} de días anteriores` : ""}`}>
            {vencidos > 0 && (
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="size-3.5" /> En rojo: entregados antes de hoy y todavía sin devolver.
              </p>
            )}
            {prestados.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">Todos los files están en el archivador.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">{prestados.map((f) => fila(f, <AccionFile id={f.id} accion="devolver" />))}</ul>
            )}
          </SeccionPanel>
        </>
      )}

      {(llevaElCuaderno ? historial : mios.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 30)).length > 0 && (
        <SeccionPanel titulo="Historial">
          <ul className="divide-y divide-border rounded-lg border border-border">
            {(llevaElCuaderno ? historial : mios.filter((f) => f.anulado_at || f.devuelto_at).slice(0, 30)).map((f) => fila(f, null, llevaElCuaderno))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}
