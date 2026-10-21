import Link from "@/components/enlace";
import { Paperclip } from "lucide-react";
import { ESTADO_CASO, ETIQUETA_AREA, TEXTO_PASO, ordenCaso, type AreaCaso, type CasoCentral } from "@/lib/casos-central";
import { listarCasosCentral } from "@/lib/casos-central-lista";
import { CasoCentralAcciones } from "@/components/crm/caso-central-acciones";
import { fechaHoraLima } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/**
 * La bandeja de casos de Central (0573). La misma pantalla para los dos
 * lados: Central ve lo que derivó a todas las áreas; Finanzas y Facturación,
 * lo suyo. Lista a la izquierda, ordenada por lo que exige atención, y el
 * caso elegido (?ver=) a la derecha con su historial y sus botones.
 */
export async function CasosCentralBandeja({
  lado,
  area,
  ver,
  perfilId,
  baseHref,
}: {
  lado: "central" | "area";
  area?: AreaCaso;
  ver?: string;
  perfilId: string;
  baseHref: string;
}) {
  const casos = (await listarCasosCentral({ area })).sort((a, b) => ordenCaso(a, lado) - ordenCaso(b, lado) || b.created_at.localeCompare(a.created_at));
  const abiertos = casos.filter((c) => c.estado !== "cerrado");
  const elegido = casos.find((c) => c.id === ver) ?? abiertos[0] ?? null;

  const cajones =
    lado === "central"
      ? [
          { n: abiertos.filter((c) => c.vencido).length, t: "Nadie lo tomó a tiempo", alerta: true },
          { n: abiertos.filter((c) => c.estado === "esperando_central").length, t: "Te piden un dato", alerta: false },
          { n: abiertos.filter((c) => c.estado === "nuevo" || c.estado === "tomado").length, t: "En manos del área", alerta: false },
          { n: casos.filter((c) => c.respondido_semana).length, t: "Respondidos (7 días)", alerta: false },
        ]
      : [
          { n: abiertos.filter((c) => c.estado === "nuevo" && c.urgente).length, t: "Urgentes sin tomar", alerta: true },
          { n: abiertos.filter((c) => c.estado === "nuevo").length, t: "Nuevos", alerta: false },
          { n: abiertos.filter((c) => c.estado === "esperando_central").length, t: "Esperando a Central", alerta: false },
          { n: casos.filter((c) => c.respondido_semana).length, t: "Respondidos (7 días)", alerta: false },
        ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{lado === "central" ? "Casos a otras áreas" : "Casos de Central"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {lado === "central"
            ? "Lo que derivaste a Finanzas y Facturación: quién lo tiene y en qué quedó. Se abren con «Derivar a un área» en la ficha del cliente o en Sus pedidos."
            : `Lo que Central le pide a ${area ? ETIQUETA_AREA[area] : "tu área"}. Tómalo para que Central sepa que lo tienes, y contesta por el mismo caso.`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {cajones.map((c) => (
          <div key={c.t} className={cn("rounded-xl border bg-card px-3 py-2.5", c.alerta && c.n > 0 ? "border-destructive" : "border-border")}>
            <p className={cn("text-2xl font-bold tabular-nums", c.alerta && c.n > 0 && "text-destructive")}>{c.n}</p>
            <p className="text-xs text-muted-foreground">{c.t}</p>
          </div>
        ))}
      </div>

      {casos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {lado === "central"
            ? "Todavía no derivaste ningún caso. Abre la ficha de un cliente o «Sus pedidos» y usa «Derivar a un área»."
            : "Central no te ha derivado ningún caso en los últimos 15 días. Cuando llegue uno, suena la campana."}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <ul className="grid content-start gap-2">
            {casos.map((c) => (
              <li key={c.id}>
                <FilaCaso caso={c} lado={lado} href={`${baseHref}?ver=${c.id}`} elegido={elegido?.id === c.id} />
              </li>
            ))}
          </ul>
          {elegido && <DetalleCaso caso={elegido} lado={lado} perfilId={perfilId} />}
        </div>
      )}
    </div>
  );
}

function PillEstado({ caso }: { caso: CasoCentral }) {
  if (caso.vencido)
    return <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Sin tomar · venció {fechaHoraLima(caso.vence_at)}</span>;
  if (caso.urgente && (caso.estado === "nuevo" || caso.estado === "tomado"))
    return (
      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        URGENTE{caso.vence_at ? ` · vence ${fechaHoraLima(caso.vence_at)}` : ""}
      </span>
    );
  const e = ESTADO_CASO[caso.estado];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", e.clase)}>{e.etiqueta}</span>;
}

function FilaCaso({ caso, lado, href, elegido }: { caso: CasoCentral; lado: "central" | "area"; href: string; elegido: boolean }) {
  const franja = caso.vencido || (caso.urgente && caso.estado === "nuevo") ? "bg-destructive" : ESTADO_CASO[caso.estado].franja;
  const ultimo = caso.pasos[caso.pasos.length - 1];
  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "flex overflow-hidden rounded-xl border bg-card transition-colors hover:bg-accent/50",
        elegido ? "border-primary ring-1 ring-primary" : "border-border",
        caso.estado === "cerrado" && "opacity-70",
      )}
    >
      <span className={cn("w-1.5 shrink-0", franja)} />
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {caso.motivo} · {caso.cliente}
          </p>
          <p className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{caso.codigo}</span>
            {lado === "central" && <span>{ETIQUETA_AREA[caso.area]}</span>}
            {caso.numero_pedido && <span>Pedido {caso.numero_pedido}</span>}
            {lado === "area" && <span>{caso.creado_por_nombre}</span>}
            <span>{fechaHoraLima(caso.created_at)}</span>
            {caso.tomado_por_nombre && caso.estado !== "nuevo" && <span>Lo tiene {caso.tomado_por_nombre}</span>}
          </p>
          {caso.estado === "esperando_central" && ultimo?.tipo === "pide_dato" && ultimo.texto && (
            <p className="mt-1 line-clamp-2 text-xs text-amber-900 dark:text-amber-200">«{ultimo.texto}»</p>
          )}
        </div>
        <PillEstado caso={caso} />
      </div>
    </Link>
  );
}

function DetalleCaso({ caso, lado, perfilId }: { caso: CasoCentral; lado: "central" | "area"; perfilId: string }) {
  return (
    <section className="grid content-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm lg:sticky lg:top-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {caso.codigo} · {ETIQUETA_AREA[caso.area]}
          </p>
          <h2 className="mt-0.5 text-base font-bold">{caso.motivo}</h2>
        </div>
        <PillEstado caso={caso} />
      </div>

      <dl className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-[7rem_1fr]">
        <dt className="text-muted-foreground">Cliente</dt>
        <dd>
          {caso.cuenta_id && lado === "central" ? (
            <Link href={`/central/clientes/${caso.cuenta_id}`} className="hover:underline">
              {caso.cliente}
            </Link>
          ) : (
            caso.cliente
          )}
        </dd>
        {caso.servicio_id && (
          <>
            <dt className="text-muted-foreground">Pedido</dt>
            <dd>
              {caso.numero_pedido ?? "Ver pedido"} ·{" "}
              <Link href={lado === "area" && caso.area === "finanzas" ? `/finanzas/pedidos/${caso.servicio_id}` : `/pedidos/${caso.servicio_id}/imprimir`} className="text-primary hover:underline">
                abrir
              </Link>
            </dd>
          </>
        )}
        <dt className="text-muted-foreground">Lo pide</dt>
        <dd>
          {caso.creado_por_nombre} · {fechaHoraLima(caso.created_at)}
        </dd>
        {caso.vence_at && (
          <>
            <dt className="text-muted-foreground">Plazo</dt>
            <dd>{fechaHoraLima(caso.vence_at)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Mensaje</dt>
        <dd className="whitespace-pre-line">{caso.mensaje}</dd>
        {caso.adjuntos.length > 0 && (
          <>
            <dt className="text-muted-foreground">Adjuntos</dt>
            <dd>
              <Adjuntos lista={caso.adjuntos} />
            </dd>
          </>
        )}
        {caso.respuesta && (
          <>
            <dt className="text-muted-foreground">Respuesta</dt>
            <dd className="whitespace-pre-line rounded-md bg-[#1E7F4F]/10 px-2 py-1 text-foreground">
              {caso.respuesta}
              <span className="block text-xs text-muted-foreground">
                {caso.respondido_por_nombre} · {fechaHoraLima(caso.respondido_at)}
              </span>
            </dd>
          </>
        )}
      </dl>

      <CasoCentralAcciones
        casoId={caso.id}
        estado={caso.estado}
        lado={lado}
        tomadoPorMi={caso.tomado_por === perfilId}
        areaEtiqueta={ETIQUETA_AREA[caso.area]}
      />

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Historial</p>
        <ol className="grid gap-2.5 border-l-2 border-border pl-4">
          {caso.pasos.map((p) => (
            <li key={p.id} className="relative text-sm">
              <span
                className={cn(
                  "absolute -left-[1.4rem] top-1 size-2.5 rounded-full border-2 bg-card",
                  p.tipo === "respondido" || p.tipo === "cerrado" ? "border-[#1E7F4F] bg-[#1E7F4F]" : p.tipo === "vencido" || p.tipo === "pide_dato" ? "border-amber-500" : "border-muted-foreground",
                )}
              />
              <span className="font-medium">{p.autor ? `${p.autor} ${TEXTO_PASO[p.tipo]}` : TEXTO_PASO[p.tipo]}</span>
              {p.texto && p.tipo !== "derivado" && <span className="block whitespace-pre-line text-foreground/90">{p.texto}</span>}
              {p.adjuntos.length > 0 && p.tipo !== "derivado" && <Adjuntos lista={p.adjuntos} />}
              <span className="block text-xs text-muted-foreground">{fechaHoraLima(p.created_at)}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Adjuntos({ lista }: { lista: CasoCentral["adjuntos"] }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {lista.map((a) =>
        a.url ? (
          <a key={a.path} href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs hover:bg-accent">
            <Paperclip className="size-3" /> {a.nombre}
          </a>
        ) : (
          <span key={a.path} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
            <Paperclip className="size-3" /> {a.nombre} (no disponible)
          </span>
        ),
      )}
    </span>
  );
}
