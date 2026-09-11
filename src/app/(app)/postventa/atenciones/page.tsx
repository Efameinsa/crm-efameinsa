import Link from "next/link";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { puedeVerPrecios } from "@/lib/postventa";
import { CasosAnteriores } from "@/components/crm/casos-anteriores";
import { ColaDespachos } from "@/components/crm/cola-despachos";
import { HistoricoPostventa } from "@/components/crm/historico-postventa";
import { MandadoACentral } from "@/components/crm/mandado-a-central";
import { listarMandadoACentral } from "@/lib/mandado-a-central";
import { PestanasCasos } from "@/components/crm/pestanas-casos";
import { VistaAtenciones, type FilaAtencion } from "@/components/crm/vista-atenciones";
import { relojAtencion, resumirAtenciones, estaAbierta } from "@/lib/atenciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Atenciones: la puerta única al trabajo técnico y a sus dos colas vecinas.
 *
 * Plan 23 (31-08): «Casos», la «Lista» del calendario y el historial de
 * informes eran cuatro puertas al mismo tipo de trabajo con nombres
 * distintos. Acá se juntan como pestañas de UNA pantalla — sin migrar una
 * sola fila (la pista de nueve etapas es `atenciones`, los casos viejos
 * siguen siendo `oportunidades`, los despachos siguen siendo
 * `servicios_postventa`): es la puerta la que se unifica, no el dato.
 */

// Las etiquetas y los enlaces viven en `PestanasCasos`, que es la misma tira
// que muestra la bandeja. Acá solo queda cuál de ellas está abierta.
const PESTANAS = ["", "casos", "cerradas", "historico"] as const;

type Pestana = (typeof PESTANAS)[number];


export default async function AtencionesPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; filtro?: string; etapa?: string; q?: string; estado?: string }>;
}) {
  const sp = await searchParams;
  const pestana: Pestana = PESTANAS.find((p) => p === (sp.ver ?? "")) ?? PESTANAS[0];
  const filtro = sp.filtro ?? "";
  const perfil = await requerirPerfil();
  const supabase = await createClient();

  const { data } = await supabase
    .from("atenciones")
    .select(
      "id, cuenta_id, equipo_id, cliente_texto, equipo_texto, tipo, clasificacion, etapa, en_garantia, hizo_preventivo, asignado_a, tecnico, solicitado_at, registrado_at, diagnosticado_at, programada_at, atendido_at, pruebas_at, conformidad_at, cerrado_at, seguimiento_at, tomada_at, tomada_por, conformidad_nombre, informe_servicio_id, resultado, detalle, motivo_cierre, cuentas(razon_social), perfiles:asignado_a(nombre, codigo_comercial), tomadaPor:tomada_por(nombre, codigo_comercial)",
    )
    .order("solicitado_at", { ascending: false })
    .limit(300);

  const todas = (data ?? []) as unknown as FilaAtencion[];
  // ACÁ ES DONDE LA DEJA EL FLUJO. «Registrar y derivar a Central» termina con
  // un `router.push("/postventa/atenciones")`, y lo que acaba de registrar
  // TODAVÍA NO es una atención —la atención nace cuando Central la devuelve
  // (0132)—, así que aterrizaba en una pantalla donde su trabajo no estaba.
  // De ahí salió el duplicado del 10-09 (src/lib/mandado-a-central.ts).
  const mandadoACentral = await listarMandadoACentral(supabase, perfil.id);
  const resumen = resumirAtenciones(todas);
  const abiertas = todas.filter(estaAbierta);
  const enRojo = abiertas.filter((a) => relojAtencion(a).estado === "rojo").length;

  return (
    <div className="space-y-4">
      {/* Los cuatro números del cierre semanal, siempre a la vista: es lo que
          el ing. Carlos pidió que el área pueda contestar sin buscar —«has
          recibido 20 problemas, cuántos atendidos, cuántos en proceso, cuántos
          cerrados»—. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tarjeta etiqueta="Recibidas" valor={resumen.recibidas} />
        <Tarjeta etiqueta="Atendidas" valor={resumen.atendidas} />
        <Tarjeta etiqueta="En proceso" valor={resumen.enProceso} alerta={enRojo > 0} />
        <Tarjeta etiqueta="Cerradas" valor={resumen.cerradas} bien />
      </div>

      {/* Solo en la pestaña de trabajo: es la que se abre al registrar, y en el
          archivo (cerradas, histórico) esta lista no viene a cuento. */}
      {pestana === "" && <MandadoACentral filas={mandadoACentral} contexto="postventa" />}

      <SeccionPanel
        titulo="Atenciones del área"
        accion={
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href="/postventa/casos/nuevo"
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground hover:brightness-110"
            >
              <Plus className="size-3.5" /> Registrar atención
            </Link>
            <PestanasCasos activa={pestana} abiertas={abiertas.length} enRojo={enRojo} />
          </div>
        }
      >
        {(pestana === "" || pestana === "cerradas") && (
          <VistaAtenciones
            todas={pestana === "cerradas" ? todas.filter((a) => !estaAbierta(a)) : abiertas}
            cerradas={pestana === "cerradas"}
            inicial={{ filtro, etapa: sp.etapa ?? null }}
          />
        )}
        {pestana === "casos" && <CasosAnteriores perfil={perfil} />}
        {pestana === "historico" && (
          <div className="space-y-6">
            <HistoricoPostventa />
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Despachos del Excel
              </h3>
              <ColaDespachos
                pestana="historico"
                verValue="historico"
                busqueda={(sp.q ?? "").trim()}
                estado={sp.estado ?? ""}
                verPrecios={puedeVerPrecios(perfil)}
                hrefBase="/postventa/atenciones"
              />
            </section>
            <section className="space-y-1.5">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Despachos completados
              </h3>
              <ColaDespachos
                pestana="completados"
                verValue="historico"
                busqueda={(sp.q ?? "").trim()}
                estado={sp.estado ?? ""}
                verPrecios={puedeVerPrecios(perfil)}
                hrefBase="/postventa/atenciones"
              />
            </section>
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

/**
 * EL CHIP MENTÍA. Decía «Abiertas (3)» y ese 3 no eran las abiertas: eran las
 * pasadas de su límite. Con 8 casos abiertos y 3 vencidos, la pantalla mostraba
 * «Abiertas (3)» al lado de una tarjeta que decía «En proceso 8», y quien las
 * leyó junto —el informe de UX del 08-09— concluyó, con razón, que los
 * contadores no coinciden. No era un conteo mal hecho: era un número bien
 * calculado con la etiqueta de otro.
 */
function Tarjeta({ etiqueta, valor, alerta, bien }: { etiqueta: string; valor: number; alerta?: boolean; bien?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{etiqueta}</p>
      <p
        className={cn(
          "mt-0.5 text-2xl font-bold tabular-nums",
          alerta ? "text-destructive" : bien ? "text-[#1E7F4F]" : "text-foreground",
        )}
      >
        {valor}
      </p>
    </div>
  );
}
