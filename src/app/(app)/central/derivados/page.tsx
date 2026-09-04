import Link from "next/link";
import { Search, Ban, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo, type PresetPeriodo } from "@/lib/periodo";
import { cargarDerivados, ETIQUETA_FOCO, type DerivadoFila, type FocoDerivado } from "@/lib/derivados-central";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { FiltroPeriodo } from "@/components/crm/filtro-periodo";
import { ChipsParam } from "@/components/crm/chips-param";
import { TarjetaDerivado } from "@/components/crm/tarjeta-derivado";
import { cargarSupervisores } from "@/lib/supervisores";
import { permisoSinPin } from "@/lib/acciones/seguridad";
import { Input } from "@/components/ui/input";
import { fechaHoraLima } from "@/lib/fechas";
import { RetomarLeadBoton } from "@/components/crm/retomar-lead-boton";
import { RevertirAvisoBoton } from "@/components/crm/revertir-aviso-boton";

// Cómo se llama cada área en palabras, para no mostrar el valor de la base.
const ETIQUETA_AREA: Record<string, string> = {
  finanzas: "Finanzas",
  postventa: "postventa",
  servicio_tecnico: "servicio técnico",
  administracion: "administración",
  proveedores: "proveedores",
  rrhh: "recursos humanos",
  comercial: "comercial",
  otros: "otra área",
};
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Lo que Central derivó, y en qué quedó.
 *
 * POR QUÉ EXISTE. Central reportó el 25-08 que «no puede ver sus derivados,
 * solo ve lo que ella registró». Es exacto: en cuanto asigna un contacto, este
 * sale de la bandeja de triaje y no vuelve a aparecer en ninguna pantalla suya.
 * Lo único que le quedaba eran los CONTEOS por comercial —«hoy derivaste 4 a
 * C5»— sin poder abrir cuáles ni saber qué pasó con ellos.
 *
 * Y es justo ella quien lo necesita: es la que atiende al cliente que vuelve a
 * llamar preguntando si alguien lo contactó. Sin esto tenía que preguntarle al
 * comercial por WhatsApp.
 *
 * QUÉ CAMBIÓ EL 27-08. La primera versión era una tabla de diez columnas con
 * letra de 11 px: no se podía leer sin scroll horizontal, y aun leyéndola no
 * respondía la pregunta de Central, porque mostraba la ETAPA de la oportunidad
 * —que nace en 'asignada' con la propia derivación— y no si alguien había
 * llamado al cliente. Ahora la lista es una fila por caso, ordenada por
 * jerarquía, con el estado de atención al frente (sin atender / en gestión /
 * cotizado / cerrado) y con los que llevan más de un día sin que nadie los
 * toque marcados en rojo. Todo el detalle —el mensaje completo, la ruta que
 * siguió el contacto y el historial de gestión del comercial— está a un clic,
 * en la ficha de la derivación.
 */

const PRESETS: PresetPeriodo[] = ["semana", "semana_anterior", "mes", "mes_anterior", "30d", "anio", "todo"];

const ORDEN_FOCO: FocoDerivado[] = ["sin_atender", "en_gestion", "cotizado", "cerrado"];

export default async function DerivadosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string; q?: string; foco?: string; practica?: string; mostrar?: string }>;
}) {
  const sp = await searchParams;
  const periodo = resolverPeriodo(sp, "30d");
  const busqueda = (sp.q ?? "").trim();
  const supabase = await createClient();

  // Mientras gerencia tenga levantado el código (permiso por el día), la
  // pantalla trabaja en modo ensayo: se ven también los contactos de práctica y
  // el diálogo ofrece al comercial C0. Vence solo a la medianoche.
  const { hasta: sinPinHasta } = await permisoSinPin();
  const modoEnsayo = sinPinHasta !== null;

  // LOS RECHAZADOS NO PUEDEN QUEDAR EN UN LIMBO (Carlos, 04-09, 10:10:
  // «¿qué pasa con los rechazados? Cuando pone rechazado, ¿qué hace? Están en
  // un limbo. La idea es que la central tenga el reporte más abajo de sus
  // rechazados»). Y en la reunión de las 10:48 lo cerró: «una zona donde estén
  // todos los acumulados». Por eso acá entran los tres finales que NO son una
  // derivación a un comercial —descartado, duplicado y derivado a otra área—,
  // que hasta hoy vivían en pantallas distintas o en ninguna. Todos se pueden
  // retomar: «cualquier eventualidad la podemos retomar».
  const [{ data: comerciales }, supervisores, derivados, { data: avisos }, { data: rechazados }] = await Promise.all([
    supabase
      .from("perfiles")
      // Los perfiles de práctica viajan también: el diálogo los ofrece solo
      // cuando el contacto que se corrige es del banco de pruebas.
      .select("id, nombre, codigo_comercial, es_prueba")
      .eq("rol", "comercial")
      .eq("activo", true)
      .order("codigo_comercial"),
    cargarSupervisores(supabase),
    cargarDerivados(supabase, {
      desde: periodo.desde,
      hasta: periodo.hasta,
      comercial: sp.comercial ?? null,
      busqueda,
      // El banco de pruebas solo se ve con el código levantado (modo ensayo):
      // así la capacitación no vuelve a sembrar la pantalla de «prueba,
      // prueba, prueba» (auditoría de Santos y gerencia, 01-09).
      incluirPractica: modoEnsayo,
    }),
    // EL HISTORIAL DE OPERACIONES (0171). Carlos, 04-09 por la tarde, después
    // de que Central derivara a los tres destinos un aviso que era solo para
    // Finanzas: «por ahí tengo una sección de mi historial de operaciones, y
    // que ahí aparezca todo lo que ha estado haciendo y ponga revertir,
    // revertir, revertir». Revertir deja el aviso como si nunca hubiera
    // salido, y pide el código de operaciones o gerencia.
    supabase
      .from("avisos_derivados")
      .select("id, detalle, a_finanzas, a_postventa, a_comercial, created_at, revertido_at, leads(codigo, razon_social, nombre_contacto), perfiles!avisos_derivados_derivado_por_fkey(nombre)")
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("leads")
      .select("id, codigo, estado, area_destino, canal, nombre_contacto, razon_social, num_doc, telefono, mensaje, recibido_at")
      .in("estado", ["descartado", "duplicado", "derivado_area"])
      .eq("es_prueba", false)
      .gte("recibido_at", `${periodo.desde}T00:00:00-05:00`)
      .lt("recibido_at", `${periodo.hasta}T23:59:59-05:00`)
      .order("recibido_at", { ascending: false })
      .limit(100),
  ]);

  // Los conteos se calculan sobre TODO el período, no sobre lo filtrado: son
  // el semáforo que decide qué mirar, y tienen que seguir ahí después de
  // elegir un cajón.
  const conteo = (f: FocoDerivado) => derivados.filter((d) => d.foco === f).length;
  const requierenAtencion = derivados.filter((d) => d.alerta !== null);

  // CUÁNTAS TARJETAS SE PINTAN DE UNA VEZ. El período de 30 días trae más de
  // ciento cincuenta contactos y cada uno es una tarjeta alta: la página se
  // volvía kilométrica y lo de abajo quedaba enterrado (Santos, 04-09). Se
  // pintan quince y el resto se pide con un enlace, que viaja en la URL: sin
  // estado, y la vista se puede compartir tal como se está mirando.
  const TANDA = 15;
  const mostrar = Math.max(TANDA, Number(sp.mostrar) || TANDA);
  const conParams = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (sp.desde) p.set("desde", sp.desde);
    if (sp.hasta) p.set("hasta", sp.hasta);
    if (sp.comercial) p.set("comercial", sp.comercial);
    if (sp.q) p.set("q", sp.q);
    if (sp.foco) p.set("foco", sp.foco);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/central/derivados?${p.toString()}`;
  };

  const foco = sp.foco ?? null;
  const visibles: DerivadoFila[] =
    foco === "atencion"
      ? requierenAtencion
      : foco
        ? derivados.filter((d) => d.foco === foco)
        : derivados;

  return (
    <SeccionPanel
      titulo="Lo que derivé"
      accion={
        <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {derivados.length} contacto{derivados.length === 1 ? "" : "s"}
        </span>
      }
    >
      <FiltroPeriodo
        {...periodo}
        presetActivo={periodo.preset}
        presets={PRESETS}
        comerciales={comerciales ?? []}
        comercialId={sp.comercial ?? null}
      />

      <div className="my-3 flex flex-wrap items-center gap-2">
        <ChipsParam
          nombre="foco"
          valor={foco}
          opciones={[
            { valor: null, etiqueta: `Todos · ${derivados.length}` },
            ...(requierenAtencion.length > 0
              ? [{ valor: "atencion", etiqueta: `⚠ Requieren atención · ${requierenAtencion.length}` }]
              : []),
            ...ORDEN_FOCO.map((f) => ({ valor: f, etiqueta: `${ETIQUETA_FOCO[f]} · ${conteo(f)}` })),
          ]}
        />

        <form className="ml-auto flex flex-1 gap-2 sm:max-w-sm" action="/central/derivados">
          {/* El período, el comercial y el cajón elegidos se conservan al buscar. */}
          <input type="hidden" name="desde" value={periodo.desde} />
          <input type="hidden" name="hasta" value={periodo.hasta} />
          {sp.comercial && <input type="hidden" name="comercial" value={sp.comercial} />}
          {foco && <input type="hidden" name="foco" value={foco} />}
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            {/* El cuadro tiene que DECIR por qué se puede buscar. Central pidió
                el 31-08 poder buscar por DNI y RUC, y el RUC ya se buscaba: lo
                que faltaba era que el cuadro lo dijera. */}
            <Input
              name="q"
              defaultValue={busqueda}
              placeholder="RUC, DNI, nombre, empresa, teléfono o código PRO"
              className="pl-8"
            />
          </div>
          <Button type="submit" size="sm">
            Buscar
          </Button>
        </form>
      </div>

      {/* Lo que hice hoy: los avisos que salieron a otras áreas, con la
          posibilidad de deshacerlos. */}
      {/* PLEGADOS, Y CON EL NÚMERO EN EL TÍTULO. Los dos bloques del pie
          crecieron —48 contactos rechazados, casi todos duplicados viejos de
          Facebook— y empujaron el botón «Revertir» tan abajo que Central ya
          no lo encontraba (Santos, 04-09). Se abren de un clic y el número
          dice si vale la pena abrirlos. `details` nativo: sin estado, sin
          JavaScript, y el navegador recuerda nada, que es lo correcto acá. */}
      {(avisos ?? []).length > 0 && (
        <details className="mt-6 rounded-lg border border-border bg-muted/30 p-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground">
            <Send className="size-3.5" /> Avisos que mandé a otras áreas ({(avisos ?? []).filter((a) => !a.revertido_at).length})
            <span className="ml-auto text-[10px] font-medium normal-case text-muted-foreground">ver</span>
          </summary>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Si salió a quien no era, «Revertir» lo quita del historial del comercial y del pedido de postventa, y
            devuelve el contacto a la bandeja. Pide el código de operaciones o gerencia.
          </p>
          <ul className="mt-2 space-y-1.5">
            {(avisos ?? []).map((a) => {
              const lead = a.leads as unknown as { codigo: string | null; razon_social: string | null; nombre_contacto: string | null } | null;
              const quien = a.perfiles as unknown as { nombre: string } | null;
              const destinos = [
                a.a_finanzas ? "Finanzas" : null,
                a.a_postventa ? "postventa" : null,
                a.a_comercial ? "el comercial" : null,
              ].filter(Boolean).join(", ");
              const cliente = lead?.razon_social ?? lead?.nombre_contacto ?? "Sin nombre";
              return (
                <li key={a.id as string} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/60 pb-1.5 text-xs last:border-0">
                  <span className="font-mono text-[11px] font-semibold text-foreground">{lead?.codigo ?? "—"}</span>
                  <span className="font-medium text-foreground">{cliente}</span>
                  <span className="text-muted-foreground">a {destinos}</span>
                  <span className="tabular-nums text-muted-foreground">{fechaHoraLima(a.created_at as string)}</span>
                  {quien?.nombre && <span className="text-muted-foreground">· {quien.nombre}</span>}
                  {a.revertido_at ? (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      revertido
                    </span>
                  ) : (
                    <RevertirAvisoBoton
                      avisoId={a.id as string}
                      resumen={`${cliente} · aviso a ${destinos}: ${a.detalle as string}`}
                    />
                  )}
                  <span className="line-clamp-1 basis-full text-muted-foreground">{a.detalle as string}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Lo que NO se derivó, al pie: descartados y duplicados del período. */}
      <details className="mt-6 rounded-lg border border-border bg-muted/30 p-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground">
          <Ban className="size-3.5" /> Contactos que no fueron a un comercial ({(rechazados ?? []).length})
          <span className="ml-auto text-[10px] font-medium normal-case text-muted-foreground">ver</span>
        </summary>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Descartados, duplicados y derivados a otras áreas, todos juntos. Ninguno se pierde: si hay que
          atenderlo, «Retomar» lo devuelve a la bandeja para repartirlo.
        </p>
        {(rechazados ?? []).length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            En este período todos los contactos se derivaron a un comercial.
          </p>
        ) : (
          <ul className="mt-2 max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {(rechazados ?? []).map((r) => (
              <li key={r.id as string} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/60 pb-1.5 text-xs last:border-0">
                <span className="font-mono text-[11px] font-semibold text-foreground">{r.codigo as string}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  {r.estado === "duplicado"
                    ? "Duplicado"
                    : r.estado === "derivado_area"
                      ? `A ${ETIQUETA_AREA[r.area_destino as string] ?? (r.area_destino as string)}`
                      : "Descartado"}
                </span>
                <span className="tabular-nums text-muted-foreground">{fechaHoraLima(r.recibido_at as string)}</span>
                <span className="font-medium text-foreground">
                  {(r.razon_social as string | null) ?? (r.nombre_contacto as string | null) ?? "Sin nombre"}
                </span>
                {r.telefono && <span className="text-muted-foreground">{r.telefono as string}</span>}
                <RetomarLeadBoton leadId={r.id as string} codigo={r.codigo as string} />
                {r.mensaje && (
                  <span className="line-clamp-1 basis-full text-muted-foreground" title={r.mensaje as string}>
                    {r.mensaje as string}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </details>

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {derivados.length === 0
            ? `No derivó ningún contacto en este período${busqueda ? ` que diga «${busqueda}»` : ""}.`
            : "Ningún contacto en este cajón. Pruebe con otro."}
        </p>
      ) : (
        <>
          <div className="space-y-2">
            {visibles.slice(0, mostrar).map((fila, i) => (
              // LAS NUEVAS SE ANUNCIAN. Al pedir más, la página se vuelve a
              // dibujar y sin señal alguna parecía que el botón no hacía nada
              // (Central, 04-09). Las que acaban de aparecer entran con un
              // desvanecido corto; las que ya estaban, quietas.
              <div
                key={fila.id}
                className={cn(mostrar > TANDA && i >= mostrar - TANDA && "animate-in fade-in slide-in-from-bottom-2 duration-500")}
              >
                <TarjetaDerivado
                  fila={fila}
                  comerciales={comerciales ?? []}
                  supervisores={supervisores}
                  modoEnsayo={modoEnsayo}
                />
              </div>
            ))}
          </div>
          {visibles.length > mostrar && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg border border-dashed border-border py-3 text-xs">
              <span className="text-muted-foreground">
                Se ven {mostrar} de {visibles.length}
              </span>
              <Link
                href={conParams({ mostrar: String(mostrar + TANDA) })}
                scroll={false}
                className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Ver {Math.min(TANDA, visibles.length - mostrar)} más
              </Link>
              <Link
                href={conParams({ mostrar: String(visibles.length) })}
                scroll={false}
                className="text-muted-foreground underline-offset-2 hover:underline"
              >
                ver los {visibles.length - mostrar} restantes
              </Link>
            </div>
          )}
        </>
      )}

    </SeccionPanel>
  );
}
