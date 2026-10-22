import Link from "@/components/enlace";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaCalendario, fechaLimaCorta } from "@/lib/fechas";
import { hoyLima } from "@/lib/periodo";
import { sumarDias } from "@/lib/calendario";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * EQUIPOS QUE LLEGAN A PLANTA: la lista (21-10).
 *
 * La recepción (0557) nació con su ficha (`/recepciones/[id]`) y sin lista: la
 * tarjeta «Equipos que llegan a planta» del macro y el enlace del menú
 * mandaban a `/recepciones` y daban 404. Acá están las abiertas, en el orden
 * en que hay que atenderlas (sin recibir → sin revisar → sin informe), y las
 * cerradas de los últimos días, para buscar una.
 */
const MOTIVO: Record<string, string> = { garantia: "Garantía", reparacion: "Reparación", revision: "Revisión", otro: "Otro" };
const LLEGA: Record<string, string> = { cliente: "Lo trae el cliente", agencia: "Por agencia", tecnico: "Lo trae el técnico", otro: "Otro" };
const sinRuc = (s: string | null | undefined) => (s ?? "Cliente sin nombre").replace(/^\d{8,11}\s*-\s*/, "");

type Fila = {
  id: string;
  codigo: string;
  equipo_texto: string;
  serie: string | null;
  motivo: string;
  llega_por: string;
  fecha_estimada: string | null;
  created_at: string;
  recibido_at: string | null;
  revisado_at: string | null;
  listo_at: string | null;
  resultado: string | null;
  cuentas: { razon_social: string } | null;
  atenciones: { codigo: string } | null;
};

function Paso({ hecho, texto }: { hecho: boolean; texto: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px]", hecho ? "text-[#1E7F4F]" : "text-muted-foreground")}>
      {hecho ? <CheckCircle2 className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
      {texto}
    </span>
  );
}

function FilaRecepcion({ r }: { r: Fila }) {
  const falta = !r.recibido_at ? "Recibir con fotos" : !r.revisado_at ? "Revisar con el técnico" : !r.listo_at ? "Dejar el informe" : null;
  return (
    <li>
      <Link href={`/recepciones/${r.id}`} className="flex flex-col gap-1.5 rounded-lg border border-border bg-background p-3 hover:bg-accent sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{r.codigo}</span>
            <span className="text-sm font-semibold text-foreground">{sinRuc(r.cuentas?.razon_social)}</span>
            {r.atenciones?.codigo && <span className="text-[11px] text-muted-foreground">· caso {r.atenciones.codigo}</span>}
          </div>
          <p className="line-clamp-1 text-xs text-foreground/80">
            {r.equipo_texto}
            {r.serie ? ` · serie ${r.serie}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {MOTIVO[r.motivo] ?? r.motivo} · {LLEGA[r.llega_por] ?? r.llega_por}
            {r.fecha_estimada ? ` · llega ${fechaCalendario(r.fecha_estimada)}` : ""}
            {r.listo_at && r.resultado ? ` · ${r.resultado}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-1">
          <div className="flex gap-2">
            <Paso hecho={Boolean(r.recibido_at)} texto="Recibido" />
            <Paso hecho={Boolean(r.revisado_at)} texto="Revisado" />
            <Paso hecho={Boolean(r.listo_at)} texto="Informe" />
          </div>
          {falta && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-px text-[11px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{falta}</span>}
        </div>
      </Link>
    </li>
  );
}

export default async function RecepcionesPage() {
  await requerirPerfil();
  const supabase = await createClient();
  const hace30 = `${sumarDias(hoyLima(), -30)}T00:00:00-05:00`;
  const columnas = "id, codigo, equipo_texto, serie, motivo, llega_por, fecha_estimada, created_at, recibido_at, revisado_at, listo_at, resultado, cuentas(razon_social), atenciones(codigo)";
  const [{ data: abiertas }, { data: cerradas }] = await Promise.all([
    supabase.from("recepciones_equipo").select(columnas).is("listo_at", null).is("anulada_at", null).order("created_at", { ascending: true }).limit(200),
    supabase.from("recepciones_equipo").select(columnas).not("listo_at", "is", null).is("anulada_at", null).gte("listo_at", hace30).order("listo_at", { ascending: false }).limit(100),
  ]);
  const filas = (abiertas ?? []) as unknown as Fila[];
  // Primero lo que ni se recibió, después lo recibido sin revisar, al final lo revisado sin informe.
  const peso = (r: Fila) => (!r.recibido_at ? 0 : !r.revisado_at ? 1 : 2);
  filas.sort((a, b) => peso(a) - peso(b) || a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <Link href="/almacen" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-3.5" aria-hidden />
            Agenda del almacén
          </Link>
          <h1 className="text-lg font-bold text-foreground">Equipos que llegan a planta</h1>
          <p className="text-xs text-muted-foreground">Postventa avisa que un equipo viene (garantía, reparación, revisión); el almacén lo recibe con fotos, lo revisa con el técnico y deja el informe.</p>
        </div>
      </div>
      <SeccionPanel titulo={`Abiertas · ${filas.length}`}>
        {filas.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">Ningún equipo por recibir ni por revisar. Cuando postventa abra una recepción aparece acá.</p>
        ) : (
          <ul className="space-y-1.5">{filas.map((r) => <FilaRecepcion key={r.id} r={r} />)}</ul>
        )}
      </SeccionPanel>
      {(cerradas ?? []).length > 0 && (
        <SeccionPanel titulo={`Con informe en los últimos 30 días · ${(cerradas ?? []).length}`}>
          <ul className="space-y-1.5">
            {((cerradas ?? []) as unknown as Fila[]).map((r) => (
              <li key={r.id} className="text-[11px] text-muted-foreground">
                <FilaRecepcion r={r} />
                <span className="sr-only">{fechaLimaCorta(r.listo_at)}</span>
              </li>
            ))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}
