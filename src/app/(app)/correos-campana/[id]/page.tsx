import { notFound } from "next/navigation";
import Link from "@/components/enlace";
import { ArrowLeft } from "lucide-react";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fechaHoraLima } from "@/lib/fechas";

export const dynamic = "force-dynamic";

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** {{nombre}} y {{nombre|Oiga}} con los datos con que salió el correo (igual que en mkt). */
function conDatos(html: string, datos: Record<string, string>): string {
  return html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^{}]*))?\}\}/gi, (entero, clave: string, respaldo: string | undefined) => {
    if (clave.toLowerCase() === "baja_url") return "#";
    const v = datos[clave.toLowerCase()];
    if (v) return escapar(v);
    return respaldo !== undefined ? escapar(respaldo) : entero;
  });
}

/**
 * EL CORREO QUE RECIBIÓ EL CLIENTE (Santos, 15-10, migración 0496): la copia fija que
 * guardó el emailing al enviarlo, con su nombre y su empresa tal como le llegaron. Es
 * solo de referencia para el comercial: abrirla aquí no cuenta como apertura ni clic, y
 * los enlaces no funcionan (el correo va en un marco aislado, sin scripts).
 */
export default async function CorreoCampanaPage({ params }: { params: Promise<{ id: string }> }) {
  await requerirPerfil();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("correos_campana_recibidos")
    .select("id, email, cuenta_id, datos, enviado_at, correos_campana(codigo, nombre, asunto, html)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const fila = data as unknown as {
    email: string;
    cuenta_id: string | null;
    datos: Record<string, string>;
    enviado_at: string | null;
    correos_campana: { codigo: string | null; nombre: string; asunto: string; html: string } | null;
  };
  const correo = fila.correos_campana;
  if (!correo) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      {fila.cuenta_id && (
        <Link href={`/nuevo/cliente/${fila.cuenta_id}?tab=correos`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-4" /> Volver a la ficha
        </Link>
      )}
      <div className="rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Correo de campaña{correo.codigo ? ` · ${correo.codigo}` : ""}</p>
        <h1 className="mt-1 text-lg font-bold">{correo.asunto}</h1>
        <p className="text-sm text-muted-foreground">
          Enviado el {fechaHoraLima(fila.enviado_at)} a {fila.email}
        </p>
        <p className="mt-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
          Copia de referencia de lo que recibió el cliente. No cambia aunque después se corrija la plantilla. Verla aquí no cuenta como apertura y sus botones no funcionan.
        </p>
      </div>
      <iframe
        title={`Correo ${correo.codigo ?? ""} enviado a ${fila.email}`}
        srcDoc={conDatos(correo.html, fila.datos ?? {})}
        sandbox=""
        className="h-[80vh] w-full rounded-xl border bg-white"
      />
    </div>
  );
}
