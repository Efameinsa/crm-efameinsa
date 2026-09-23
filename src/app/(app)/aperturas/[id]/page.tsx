import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { veTodoPostventa } from "@/lib/postventa";
import {
  ETIQUETA_ESTADO_APERTURA,
  ETIQUETA_TIPO_APERTURA,
  aQuienLeToca,
  borradorParaCliente,
  estadoApertura,
  type AperturaLlamada,
} from "@/lib/aperturas-llamada";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AccionesAlmacenApertura, AccionesPostventaApertura } from "@/components/crm/apertura-acciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * UNA APERTURA DE LLAMADA, DE PUNTA A PUNTA (0281, reunión 23-09).
 *
 * Una sola pantalla para los dos lados, para que los dos vean lo mismo: arriba
 * la orden de postventa; al medio lo que hizo el almacén (el check, el
 * técnico, su informe y las fotos); abajo la versión que se le manda al
 * cliente. Cada lado ve sus botones; la base vuelve a exigir quién puede qué.
 */
export default async function AperturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = await requerirPerfil();
  const supabase = await createClient();
  const { data } = await supabase
    .from("aperturas_llamada")
    .select("*, cuentas(razon_social, num_doc)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const a = data as unknown as AperturaLlamada & { cuentas: { razon_social: string; num_doc: string | null } | null };
  const estado = estadoApertura(a);
  const leToca = aQuienLeToca(estado);

  const ids = [a.solicitada_por, a.tomada_por, a.informe_por, a.revisada_por].filter(Boolean) as string[];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (x: string | null) => (x ? ((gente ?? []) as { id: string; nombre: string }[]).find((g) => g.id === x)?.nombre ?? "—" : "—");

  const fotos = a.informe_fotos ?? [];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const urls = (firmadas ?? []).map((f) => f.signedUrl).filter(Boolean) as string[];

  const esAlmacen = Boolean(perfil.es_almacen) || ["gerencia", "admin"].includes(perfil.rol) || Boolean(perfil.es_operaciones);
  const esPostventa = veTodoPostventa(perfil) || Boolean(perfil.es_operaciones);
  const volver = perfil.es_almacen ? "/almacen/aperturas" : "/postventa/aperturas";
  const fichaCliente = perfil.es_almacen ? null : `/comercial/cartera/${a.cuenta_id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={volver} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Todas las aperturas
      </Link>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {a.urgente && <span className="mr-1.5 rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold text-white">URGENTE · sin pedido</span>}
              {ETIQUETA_TIPO_APERTURA[a.tipo]}
            </p>
            <h1 className="text-lg font-bold text-foreground">
              {fichaCliente ? (
                <Link href={fichaCliente} className="hover:underline">
                  {a.cuentas?.razon_social ?? "Cliente"}
                </Link>
              ) : (
                a.cuentas?.razon_social ?? "Cliente"
              )}
            </h1>
            <p className="mt-1 text-sm text-foreground">
              Programada para <b>{fechaHoraLima(a.programada_para)}</b>
              {a.contacto ? <span className="text-muted-foreground"> · con {a.contacto}</span> : null}
            </p>
          </div>
          <div className="text-right">
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                estado === "anulada" && "bg-secondary text-muted-foreground",
                estado === "enviada_cliente" && "bg-[#E7F4EC] text-[#1E7F4F]",
                leToca === "almacen" && "bg-amber-100 text-amber-900",
                leToca === "postventa" && "bg-primary/10 text-primary",
              )}
            >
              {ETIQUETA_ESTADO_APERTURA[estado]}
            </span>
            {leToca && <p className="mt-1 text-[11px] text-muted-foreground">Le toca {leToca === "almacen" ? "al almacén" : "a postventa"}</p>}
            {a.servicio_id && !perfil.es_almacen && (
              <Link href={`/postventa/pedidos/${a.servicio_id}`} className="mt-1 block text-[11px] text-primary hover:underline">
                Abrir el pedido
              </Link>
            )}
          </div>
        </div>
        {a.anulada_at && (
          <p className="mt-3 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            Anulada el {fechaHoraLima(a.anulada_at)}: {a.anulada_motivo}
          </p>
        )}
      </div>

      <SeccionPanel titulo="La orden de postventa">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Equipos</dt>
            <dd className="whitespace-pre-wrap text-foreground">{a.equipos}</dd>
          </div>
          {a.indicaciones && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground">Qué hay que revisar</dt>
              <dd className="whitespace-pre-wrap text-foreground">{a.indicaciones}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">La envió</dt>
            <dd className="text-foreground">
              {nombre(a.solicitada_por)} · {fechaHoraLima(a.solicitada_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">El almacén</dt>
            <dd className="text-foreground">
              {a.tomada_at ? (
                <>
                  La tomó {nombre(a.tomada_por)} · {fechaHoraLima(a.tomada_at)}
                  {a.tecnico ? ` · técnico ${a.tecnico}` : ""}
                </>
              ) : (
                <span className="text-amber-800">Todavía no la toma</span>
              )}
            </dd>
          </div>
        </dl>
      </SeccionPanel>

      {a.informe_at && (
        <SeccionPanel titulo="Informe del almacén (versión 1)">
          <p className="text-[11px] text-muted-foreground">
            {nombre(a.informe_por)} · {fechaHoraLima(a.informe_at)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{a.informe_almacen}</p>
          {a.faltantes && (
            <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
                <AlertTriangle className="size-3.5" /> Lo que le falta al cliente: hay algo para cotizar
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{a.faltantes}</p>
            </div>
          )}
          {urls.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {urls.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt={fotos[i]?.nombre ?? `Foto ${i + 1}`} className="h-32 w-full rounded border border-border object-cover" />
                </a>
              ))}
            </div>
          )}
        </SeccionPanel>
      )}

      {esAlmacen && (estado === "enviada" || estado === "en_gestion") && (
        <SeccionPanel titulo="Lo que hace el almacén">
          <AccionesAlmacenApertura id={a.id} estado={estado} tecnicoInicial={a.tecnico} />
        </SeccionPanel>
      )}

      {esPostventa && (
        <SeccionPanel
          titulo="Lo que hace postventa"
          accion={
            a.revisada_at ? (
              <Link
                href={`/aperturas/${a.id}/imprimir`}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
              >
                <Printer className="size-3.5" /> Hoja para el cliente
              </Link>
            ) : undefined
          }
        >
          {!a.informe_at && estado !== "anulada" && (
            <p className="mb-3 text-sm text-muted-foreground">
              Cuando el almacén suba su informe le llega el aviso, y acá mismo arma la versión para el cliente.
            </p>
          )}
          {a.revisada_at && (
            <p className="mb-2 text-[11px] text-muted-foreground">
              Revisada por {nombre(a.revisada_por)} · {fechaHoraLima(a.revisada_at)}
              {a.enviada_cliente_at ? ` · enviada al cliente el ${fechaHoraLima(a.enviada_cliente_at)}` : ""}
            </p>
          )}
          <AccionesPostventaApertura
            id={a.id}
            estado={estado}
            hayInforme={Boolean(a.informe_at)}
            borrador={a.informe_cliente ?? borradorParaCliente(a)}
          />
        </SeccionPanel>
      )}
    </div>
  );
}
