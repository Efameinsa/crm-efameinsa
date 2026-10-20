import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fechaHoraLima, fechaLima } from "@/lib/fechas";
import { PasoRecepcion } from "@/components/crm/recepcion-equipo";
import { GaleriaAlmacen } from "@/components/crm/galeria-almacen";

export const dynamic = "force-dynamic";

const MOTIVO: Record<string, string> = { garantia: "Garantía", reparacion: "Reparación", revision: "Revisión", otro: "Otro" };
const LLEGA: Record<string, string> = { cliente: "lo trae el cliente", agencia: "llega por agencia", tecnico: "lo trae el técnico", otro: "otro" };
const RESULTADO: Record<string, string> = { devolver: "Devolver al cliente", cotizar: "Cotizar la reparación", otro: "Otro" };

/**
 * LA ORDEN DE RECEPCIÓN Y REVISIÓN DE UN EQUIPO (0557, gerencia 20-10). Los
 * tres pasos del almacén con quién y cuándo, las fotos y el caso de donde
 * salió. El almacén registra; postventa lee y avisa al cliente desde el caso.
 */
export default async function RecepcionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: r } = await supabase
    .from("recepciones_equipo")
    .select("*, cuentas(razon_social), atenciones(codigo)")
    .eq("id", id)
    .maybeSingle();
  if (!r) notFound();

  const ids = [r.creada_por, r.recibido_por, r.revisado_por, r.listo_por].filter(Boolean) as string[];
  const admin = createAdminClient();
  const { data: perfiles } = ids.length ? await admin.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (x: string | null) => (x ? ((perfiles ?? []).find((p) => p.id === x)?.nombre as string | undefined) ?? null : null);
  const fotos = [...((r.recibido_fotos ?? []) as { path: string }[]), ...((r.revisado_fotos ?? []) as { path: string }[])];
  const { data: firmadas } = fotos.length ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600) : { data: [] };
  const url = new Map((firmadas ?? []).map((x) => [x.path, x.signedUrl]));
  const conUrl = (lista: unknown, etiqueta: string) =>
    ((lista ?? []) as { path: string; nombre: string; tipo: string }[]).map((f) => ({ ...f, etiqueta, url: url.get(f.path) ?? null }));

  const esAlmacen = Boolean(perfil.es_almacen) || Boolean(perfil.es_operaciones) || ["gerencia", "admin", "operaciones"].includes(perfil.rol);
  const siguiente = r.anulada_at ? null : !r.recibido_at ? "recibido" : !r.revisado_at ? "revisado" : !r.listo_at ? "listo" : null;
  const pasos = [
    { titulo: "Orden de postventa", at: r.created_at as string, por: nombre(r.creada_por), detalle: r.nota as string | null },
    { titulo: "El equipo llegó a planta", at: r.recibido_at as string | null, por: nombre(r.recibido_por), detalle: r.recibido_nota as string | null },
    {
      titulo: "Revisado",
      at: r.revisado_at as string | null,
      por: nombre(r.revisado_por),
      detalle: [r.tecnico ? `Técnico: ${r.tecnico}` : null, r.diagnostico, r.repuestos ? `Repuestos: ${r.repuestos}` : null].filter(Boolean).join(" · ") || null,
    },
    {
      titulo: r.resultado ? `Listo · ${RESULTADO[r.resultado as string] ?? r.resultado}` : "Listo (devolver o cotizar)",
      at: r.listo_at as string | null,
      por: nombre(r.listo_por),
      detalle: r.resultado_nota as string | null,
    },
  ];
  const atencion = r.atenciones as unknown as { codigo: string | null } | null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {r.atencion_id && (
        <Link href={`/postventa/atenciones/${r.atencion_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          <ArrowLeft className="size-3.5" /> Volver al caso {atencion?.codigo ?? ""}
        </Link>
      )}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="font-mono text-xs text-primary">{r.codigo as string}</p>
        <h1 className="text-lg font-bold text-foreground">{(r.cuentas as unknown as { razon_social: string } | null)?.razon_social ?? "Cliente"}</h1>
        <p className="mt-1 text-sm text-foreground">
          {r.equipo_texto as string}
          {r.serie ? <span className="ml-1 font-mono text-muted-foreground">· serie {r.serie as string}</span> : null}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {MOTIVO[r.motivo as string] ?? r.motivo} · {LLEGA[r.llega_por as string] ?? r.llega_por}
          {r.fecha_estimada ? ` · llega aprox. el ${fechaLima(`${r.fecha_estimada}T12:00:00`)}` : ""}
        </p>
        {r.anulada_at && <p className="mt-2 text-sm font-semibold text-destructive">Anulada: {r.anulada_motivo as string}</p>}
      </div>

      <ol className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
        {pasos.map((p) => (
          <li key={p.titulo} className="flex items-start gap-2 text-sm">
            {p.at ? <CheckCircle2 className="mt-0.5 size-4 text-[#1E7F4F]" /> : <Circle className="mt-0.5 size-4 text-muted-foreground" />}
            <div>
              <p className={p.at ? "font-medium text-foreground" : "text-muted-foreground"}>{p.titulo}</p>
              {p.at && (
                <p className="text-xs text-muted-foreground">
                  {fechaHoraLima(p.at)}
                  {p.por ? ` · ${p.por}` : ""}
                </p>
              )}
              {p.detalle && <p className="text-xs text-foreground">{p.detalle}</p>}
            </div>
          </li>
        ))}
      </ol>

      {siguiente && (esAlmacen || siguiente === "listo") && <PasoRecepcion id={id} paso={siguiente} />}
      {siguiente && !esAlmacen && siguiente !== "listo" && (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          Le toca al almacén: {siguiente === "recibido" ? "registrar que el equipo llegó, con fotos" : "registrar la revisión con el técnico"}. Usted recibe el aviso.
        </p>
      )}

      {fotos.length > 0 && (
        <GaleriaAlmacen
          titulo="Fotos"
          fotos={[...conUrl(r.recibido_fotos, "Al llegar"), ...conUrl(r.revisado_fotos, "Revisión")] as Parameters<typeof GaleriaAlmacen>[0]["fotos"]}
        />
      )}
    </div>
  );
}
