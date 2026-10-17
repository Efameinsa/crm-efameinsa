import { FolderOpen, Wrench, PhoneIncoming, FileText } from "lucide-react";
import Link from "@/components/enlace";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { ETIQUETA_ETAPA, tituloDelTipo, type EtapaAtencion } from "@/lib/atenciones";
import { ETIQUETA_TIPO_EXPEDIENTE } from "@/lib/tipo-expediente";
import { fechaLimaCorta } from "@/lib/fechas";
import { QuedarmeConLaCarpeta, UnirAEstaCarpeta } from "@/components/crm/carpeta-postventa-botones";

type Persona = { nombre: string; codigo_comercial: string | null } | null;
const quien = (p: Persona) => (p ? `${p.codigo_comercial ? `${p.codigo_comercial} · ` : ""}${p.nombre}` : "sin asignar");

/**
 * LA CARPETA DE POSTVENTA DEL CLIENTE (0530, Santos 17-10).
 *
 * Un cliente tiene una sola carpeta de postventa, como la historia clínica del
 * ing. Carlos; cada asunto es un CASO dentro de ella, con su tipo y su
 * responsable. Este recuadro responde de un vistazo lo que el 16 y el 17-10
 * no se veía (ECOLAV, Choquehuanca): quién lleva la carpeta, qué casos están
 * abiertos y de quién es cada uno, qué derivó Central y cotizaciones vivas.
 * Nada se esconde por dueña: todas las del área actúan aquí, y cada acción
 * queda con su nombre.
 */
export async function CarpetaPostventa({ oportunidadId }: { oportunidadId: string }) {
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data: o } = await supabase
    .from("oportunidades")
    .select("id, cuenta_id, comercial_id, tipo_postventa, etapa, perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)")
    .eq("id", oportunidadId)
    .maybeSingle();
  if (!o || !o.tipo_postventa) return null;

  const hace30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const [{ data: casos }, { data: derivaciones }, { data: cotizaciones }, { data: otros }] = await Promise.all([
    supabase
      .from("atenciones")
      .select("id, tipo, tipo_detalle, etapa, solicitado_at, asignado:asignado_a(nombre, codigo_comercial)")
      .eq("oportunidad_id", o.id)
      .is("cerrado_at", null)
      .order("solicitado_at", { ascending: false }),
    supabase
      .from("leads")
      .select("id, codigo, recibido_at, mensaje, asignado:asignado_a(nombre, codigo_comercial)")
      .eq("oportunidad_id", o.id)
      .gte("recibido_at", hace30)
      .order("recibido_at", { ascending: false })
      .limit(5),
    supabase
      .from("cotizaciones")
      .select("id, codigo, estado, estado_aprobacion, creada:creada_por(nombre, codigo_comercial)")
      .eq("oportunidad_id", o.id)
      .is("anulada_at", null)
      .in("estado", ["borrador", "enviada"])
      .order("created_at", { ascending: false })
      .limit(5),
    // Lo que todavía no se unió (debería ser nada desde el 17-10).
    supabase
      .from("oportunidades")
      .select("id, tipo_postventa, created_at, perfiles!oportunidades_comercial_id_fkey(nombre, codigo_comercial)")
      .eq("cuenta_id", o.cuenta_id)
      .neq("id", o.id)
      .not("tipo_postventa", "is", null)
      .in("etapa", ["asignada", "filtrada", "cotizada", "seguimiento", "potencial"]),
  ]);

  const duena = o.perfiles as unknown as Persona;
  const esMia = o.comercial_id === perfil.id;
  const delArea = Boolean(perfil.es_postventa || perfil.hace_postventa);
  const puedeUnir = delArea || ["gerencia", "admin", "central", "operaciones"].includes(perfil.rol);

  return (
    <section className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-xs dark:border-sky-900 dark:bg-sky-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-semibold text-foreground">
          <FolderOpen className="size-4 text-sky-700 dark:text-sky-400" />
          Carpeta de postventa del cliente
          <span className="font-normal text-muted-foreground">
            · la lleva <span className="font-medium text-foreground">{esMia ? "usted" : quien(duena)}</span>
            {o.tipo_postventa && ` · ahora: ${ETIQUETA_TIPO_EXPEDIENTE[o.tipo_postventa as keyof typeof ETIQUETA_TIPO_EXPEDIENTE] ?? o.tipo_postventa}`}
          </span>
        </p>
        {delArea && !esMia && !perfil.es_prueba && <QuedarmeConLaCarpeta oportunidadId={o.id} duena={duena?.nombre ?? "quien la tenía"} />}
      </div>
      <p className="mt-1 text-muted-foreground">
        Un cliente, una carpeta: cada pedido nuevo entra aquí como un caso. Cualquiera del área puede trabajarla; cada
        acción queda con el nombre de quien la hizo.
      </p>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <div>
          <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
            <Wrench className="size-3.5" /> Casos abiertos ({casos?.length ?? 0})
          </p>
          {(casos ?? []).length === 0 ? (
            <p className="text-muted-foreground">Ningún caso técnico abierto.</p>
          ) : (
            <ul className="space-y-1">
              {(casos ?? []).map((c) => (
                <li key={c.id}>
                  <Link href={`/postventa/atenciones/${c.id}`} className="font-medium text-foreground underline-offset-2 hover:underline">
                    {tituloDelTipo(c.tipo, c.tipo_detalle)}
                  </Link>
                  <span className="text-muted-foreground">
                    {" "}
                    · {ETIQUETA_ETAPA[c.etapa as EtapaAtencion] ?? c.etapa} · {quien(c.asignado as unknown as Persona)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
            <PhoneIncoming className="size-3.5" /> Derivado por Central (30 días)
          </p>
          {(derivaciones ?? []).length === 0 ? (
            <p className="text-muted-foreground">Nada derivado este mes.</p>
          ) : (
            <ul className="space-y-1">
              {(derivaciones ?? []).map((l) => (
                <li key={l.id} title={l.mensaje ?? ""}>
                  <span className="font-medium text-foreground">{fechaLimaCorta(l.recibido_at)}</span>
                  <span className="text-muted-foreground"> · a {quien(l.asignado as unknown as Persona)} · </span>
                  <span className="text-muted-foreground">{(l.mensaje ?? "").slice(0, 60)}{(l.mensaje ?? "").length > 60 ? "…" : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-1 flex items-center gap-1 font-semibold text-foreground">
            <FileText className="size-3.5" /> Cotizaciones vivas
          </p>
          {(cotizaciones ?? []).length === 0 ? (
            <p className="text-muted-foreground">Ninguna en curso.</p>
          ) : (
            <ul className="space-y-1">
              {(cotizaciones ?? []).map((z) => (
                <li key={z.id}>
                  <span className="font-medium text-foreground">{z.codigo ?? "Borrador"}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {z.estado === "enviada" ? "enviada" : z.estado_aprobacion === "aprobada_gerencia" ? "aprobada, falta confirmar" : z.estado_aprobacion === "pendiente_gerencia" ? "en gerencia" : "borrador"}
                    {" "}· la hizo {quien(z.creada as unknown as Persona)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {puedeUnir && (otros ?? []).length > 0 && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-950/30">
          <p className="font-semibold text-amber-900 dark:text-amber-200">
            Este cliente tiene {(otros ?? []).length} expediente(s) de postventa más abiertos. Únalos aquí para que nada se pierda:
          </p>
          <ul className="mt-1 space-y-1">
            {(otros ?? []).map((x) => {
              const desc = `${ETIQUETA_TIPO_EXPEDIENTE[x.tipo_postventa as keyof typeof ETIQUETA_TIPO_EXPEDIENTE] ?? x.tipo_postventa} del ${fechaLimaCorta(x.created_at)} · ${quien(x.perfiles as unknown as Persona)}`;
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-2">
                  <Link href={`/comercial/oportunidades/${x.id}`} className="underline-offset-2 hover:underline">
                    {desc}
                  </Link>
                  <UnirAEstaCarpeta haciaId={o.id} desdeId={x.id} descripcion={desc} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
