import { createClient } from "@/lib/supabase/server";
import { duracionLegible, fechaLima, numeroParaMostrar } from "@/lib/llamadas";
import { SeccionPlegable } from "@/components/crm/seccion-panel";
import { FilaLlamada, type LlamadaVista } from "@/components/crm/fila-llamada";

/**
 * LAS LLAMADAS DE ESTE CLIENTE, en su ficha (Santos, 19-10-2026): las más recientes
 * primero, con su audio, transcripción y resumen. Lo que cada persona ve lo decide
 * la RLS de `llamadas`: un comercial, las suyas; gerencia y admin, todas.
 * En la ficha clásica es una sección que no se pinta si no hay llamadas; en la pestaña
 * «Llamadas» de la ficha nueva (`comoPestana`) siempre se pinta y, vacía, dice por qué.
 */
export async function LlamadasDelCliente({ cuentaId, comoPestana = false }: { cuentaId: string; comoPestana?: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("llamadas")
    .select("id, user_id, cuenta_id, numero, iniciada_at, duracion_s, contestada, origen, estado_audio, estado_ia, resumen, ia, contactos(nombre), perfiles:user_id(nombre, codigo_comercial)")
    .eq("cuenta_id", cuentaId)
    .order("iniciada_at", { ascending: false })
    .limit(30);
  const filas = (data ?? []) as unknown as {
    id: string;
    cuenta_id: string | null;
    numero: string;
    iniciada_at: string;
    duracion_s: number;
    contestada: boolean;
    origen: string;
    estado_audio: string;
    estado_ia: string;
    resumen: string | null;
    ia: { proxima_accion?: string | null; tono?: string | null } | null;
    contactos: { nombre: string } | null;
    perfiles: { nombre: string; codigo_comercial: string | null } | null;
  }[];
  if (filas.length === 0) {
    if (!comoPestana) return null;
    return (
      <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
        Todavía no hay llamadas hechas con el botón «Llamar» a este cliente. Cuando un comercial llame desde su ficha, aparecen aquí con su audio, la
        transcripción y un resumen (cada comercial ve las suyas; gerencia y administración, todas).
      </div>
    );
  }

  const vista: LlamadaVista[] = filas.map((f) => {
    const dia = fechaLima(f.iniciada_at).fecha.split("-").reverse().join("-");
    return {
      id: f.id,
      hora: `${dia} ${fechaLima(f.iniciada_at).horaPantalla}`,
      comercial: f.perfiles ? `${f.perfiles.codigo_comercial ? `${f.perfiles.codigo_comercial} · ` : ""}${f.perfiles.nombre}` : "—",
      cuentaId: null, // ya estamos en su ficha: no hace falta el enlace
      cliente: null,
      contacto: f.contactos?.nombre ?? null,
      numero: numeroParaMostrar(f.numero),
      duracion: f.contestada ? duracionLegible(f.duracion_s) : "no contestó",
      contestada: f.contestada,
      origen: f.origen,
      estadoAudio: f.estado_audio,
      estadoIa: f.estado_ia,
      resumen: f.resumen,
      proximaAccion: f.ia?.proxima_accion ?? null,
      tono: f.ia?.tono ?? null,
    };
  });

  const lista = (
    <ul className="divide-y divide-border">
      {vista.map((l) => (
        <FilaLlamada key={l.id} l={l} sinCliente />
      ))}
    </ul>
  );
  if (comoPestana) return <div className="max-w-4xl rounded-xl border border-border bg-card p-4 shadow-sm">{lista}</div>;
  return (
    <SeccionPlegable titulo="Llamadas" cantidad={vista.length}>
      {lista}
    </SeccionPlegable>
  );
}
