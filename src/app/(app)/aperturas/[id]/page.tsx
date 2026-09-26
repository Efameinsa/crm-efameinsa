import Link from "@/components/enlace";
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
  FILAS_FORMATO,
  problemaConEquipo,
  TIPOS_APERTURA,
  type AperturaLlamada,
  type TipoApertura,
  type FormatoLlamada,
} from "@/lib/aperturas-llamada";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { AccionesAlmacenApertura, AccionesPostventaApertura, TecnicoApertura } from "@/components/crm/apertura-acciones";
import { InformeSoporteApertura } from "@/components/crm/informe-soporte-apertura";
import { CambiosApertura } from "@/components/crm/apertura-cambios";
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

  // Reprogramaciones y tipo corregido (0311), con quién los hizo.
  const cambios = ((a as { cambios?: unknown }).cambios ?? []) as { que: string; de: string; a: string; motivo: string | null; por: string | null; at: string }[];
  const ids = [...new Set([a.solicitada_por, a.tomada_por, a.informe_por, a.revisada_por, ...cambios.map((c) => c.por)].filter(Boolean) as string[])];
  const { data: gente } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = (x: string | null) => (x ? ((gente ?? []) as { id: string; nombre: string }[]).find((g) => g.id === x)?.nombre ?? "—" : "—");

  const fotos = a.informe_fotos ?? [];
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  const urls = (firmadas ?? []).map((f) => f.signedUrl).filter(Boolean) as string[];

  // El formato de llamada (0297) y el informe numerado con sus documentos.
  const formato = (a.formato ?? null) as FormatoLlamada | null;
  const { data: informeNum } = a.informe_servicio_id
    ? await supabase.from("informes_servicio").select("id, correlativo, anio, documentos").eq("id", a.informe_servicio_id).maybeSingle()
    : { data: null };
  const documentosInforme = ((informeNum?.documentos ?? []) as { path: string; nombre: string }[]);
  const { data: docsFirmados } = documentosInforme.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(documentosInforme.map((d) => d.path), 3600)
    : { data: null };
  const docs = documentosInforme.map((d, i) => ({ nombre: d.nombre, url: docsFirmados?.[i]?.signedUrl ?? "#" }));

  const esAlmacen = Boolean(perfil.es_almacen) || ["gerencia", "admin"].includes(perfil.rol) || Boolean(perfil.es_operaciones);
  const esPostventa = veTodoPostventa(perfil) || Boolean(perfil.es_operaciones);
  const volver = `${perfil.es_almacen ? "/almacen/aperturas" : "/postventa/aperturas"}${a.urgente ? "?ver=urgentes" : ""}`;
  const fichaCliente = perfil.es_almacen ? null : `/comercial/cartera/${a.cuenta_id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={volver} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> {a.urgente ? "Todas las aperturas urgentes" : "Todas las llamadas derivadas"}
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
        {/* Lo que se movió después de enviarla (0311): reprogramaciones y tipo corregido. */}
        {cambios.length > 0 && (
          <ul className="mt-3 space-y-0.5 text-[11px] text-muted-foreground">
            {cambios.map((c, i) => (
              <li key={i}>
                {c.que === "reprogramada"
                  ? `Reprogramada del ${fechaHoraLima(c.de)} al ${fechaHoraLima(c.a)}`
                  : `Tipo corregido: era «${ETIQUETA_TIPO_APERTURA[c.de as TipoApertura] ?? c.de}»`}
                {` · ${nombre(c.por)}, ${fechaHoraLima(c.at)}`}
                {c.motivo ? ` · ${c.motivo}` : ""}
              </li>
            ))}
          </ul>
        )}
        {esPostventa && estado !== "anulada" && (
          <CambiosApertura
            id={a.id}
            tipo={a.tipo}
            programadaPara={a.programada_para}
            hayInforme={Boolean(a.informe_at)}
            tomada={Boolean(a.tomada_at)}
            tipos={TIPOS_APERTURA.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_APERTURA[t] }))}
          />
        )}
      </div>

      <SeccionPanel
        titulo="La orden de postventa"
        accion={
          // Para el técnico y el archivo (Lesly, 25-09: «no hay opción para imprimirlo»).
          <Link
            href={`/aperturas/${a.id}/orden`}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent"
          >
            <Printer className="size-3.5" /> Imprimir / PDF
          </Link>
        }
      >
        {formato && FILAS_FORMATO.some((f) => (f.clave === "problema" ? problemaConEquipo(formato) : formato[f.clave])) && (
          <table className="mb-4 w-full border-collapse text-sm">
            <caption className="mb-1 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Formato de llamada · {a.cuentas?.razon_social ?? "Cliente"}
            </caption>
            <tbody>
              {FILAS_FORMATO.map((f) => {
                const v = f.clave === "problema" ? problemaConEquipo(formato) : formato[f.clave];
                return (
                  <tr key={f.clave} className="border border-border">
                    <th className="w-56 border-r border-border bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground">{f.etiqueta}</th>
                    <td className="whitespace-pre-wrap px-3 py-1.5 text-foreground">{v || "—"}</td>
                  </tr>
                );
              })}
              <tr className="border border-border">
                <th className="border-r border-border bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground">Programación</th>
                <td className="px-3 py-1.5 text-foreground">{fechaHoraLima(a.programada_para)}</td>
              </tr>
            </tbody>
          </table>
        )}
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
            <dt className="text-xs text-muted-foreground">Técnico a cargo (lo pone postventa)</dt>
            <dd className="text-foreground">
              {esPostventa && estado !== "anulada" ? <TecnicoApertura id={a.id} tecnico={a.tecnico} /> : (a.tecnico ?? <span className="text-amber-800">Sin asignar</span>)}
            </dd>
          </div>
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
                  <span className="font-medium text-[#1E7F4F]">✓ La tomó {nombre(a.tomada_por)}</span> · {fechaHoraLima(a.tomada_at)}
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
          {informeNum && (
            <p className="mt-1 text-xs">
              Informe de soporte técnico <b>N.° {informeNum.correlativo}-{informeNum.anio}</b>
              {!perfil.es_almacen && (
                <>
                  {" · "}
                  <Link href={`/postventa/informes/${informeNum.id}/imprimir`} className="font-semibold text-primary hover:underline">
                    Ver e imprimir
                  </Link>
                </>
              )}
            </p>
          )}
          {docs.length > 0 && (
            <ul className="mt-2 space-y-1">
              {docs.map((d, i) => (
                <li key={i} className="text-xs">
                  <a href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                    📄 {d.nombre}
                  </a>
                </li>
              ))}
            </ul>
          )}
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
          <div className="space-y-4">
            {estado === "enviada" && <AccionesAlmacenApertura id={a.id} tecnico={a.tecnico} />}
            <InformeSoporteApertura
              aperturaId={a.id}
              tipo={a.tipo}
              tecnico={a.tecnico}
              cuentaId={a.cuenta_id}
              servicioId={a.servicio_id}
              clienteTexto={a.cuentas?.razon_social ?? "Cliente"}
              equipos={a.equipos}
              programadaPara={a.programada_para}
            />
          </div>
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
