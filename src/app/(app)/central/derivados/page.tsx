import { Search, Ban } from "lucide-react";
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
import { Button } from "@/components/ui/button";

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
  searchParams: Promise<{ desde?: string; hasta?: string; comercial?: string; q?: string; foco?: string; practica?: string }>;
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
  // rechazados»). Son los contactos que Central descartó o marcó duplicados en
  // el período: quedaban registrados pero sin ninguna pantalla que los
  // mostrara, así que nadie podía revisarlos ni recuperarlos.
  const [{ data: comerciales }, supervisores, derivados, { data: rechazados }] = await Promise.all([
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
    supabase
      .from("leads")
      .select("id, codigo, estado, canal, nombre_contacto, razon_social, num_doc, telefono, mensaje, recibido_at")
      .in("estado", ["descartado", "duplicado"])
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

      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {derivados.length === 0
            ? `No derivó ningún contacto en este período${busqueda ? ` que diga «${busqueda}»` : ""}.`
            : "Ningún contacto en este cajón. Pruebe con otro."}
        </p>
      ) : (
        <div className="space-y-2">
          {visibles.map((fila) => (
            <TarjetaDerivado
              key={fila.id}
              fila={fila}
              comerciales={comerciales ?? []}
              supervisores={supervisores}
              modoEnsayo={modoEnsayo}
            />
          ))}
        </div>
      )}

      {/* Lo que NO se derivó, al pie: descartados y duplicados del período. */}
      <div className="mt-6 rounded-lg border border-border bg-muted/30 p-3">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          <Ban className="size-3.5" /> Contactos que no se derivaron ({(rechazados ?? []).length})
        </h3>
        {(rechazados ?? []).length === 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            En este período no se descartó ningún contacto ni se marcó ninguno como duplicado.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {(rechazados ?? []).map((r) => (
              <li key={r.id as string} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border/60 pb-1.5 text-xs last:border-0">
                <span className="font-mono text-[11px] font-semibold text-foreground">{r.codigo as string}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  {r.estado === "duplicado" ? "Duplicado" : "Descartado"}
                </span>
                <span className="tabular-nums text-muted-foreground">{fechaHoraLima(r.recibido_at as string)}</span>
                <span className="font-medium text-foreground">
                  {(r.razon_social as string | null) ?? (r.nombre_contacto as string | null) ?? "Sin nombre"}
                </span>
                {r.telefono && <span className="text-muted-foreground">{r.telefono as string}</span>}
                {r.mensaje && (
                  <span className="line-clamp-1 basis-full text-muted-foreground" title={r.mensaje as string}>
                    {r.mensaje as string}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SeccionPanel>
  );
}
