import Link from "@/components/enlace";
import { Archive, ArrowRight, FileBarChart2 } from "lucide-react";
import type { PropsVista } from "@/lib/propuesta/vistas";
import { TARJETA } from "@/components/propuesta/kit";
import { BotonReporteDiario } from "@/components/crm/boton-reporte-diario";
import { BotonCierreSemanal } from "@/components/crm/boton-cierre-semanal";
import { BotonReporteMensual } from "@/components/crm/boton-reporte-mensual";
import { BotonReportePeriodo } from "@/components/crm/boton-reporte-periodo";
import { CoberturaPostventa } from "@/components/crm/cobertura-postventa";
import { hoyLima } from "@/lib/periodo";
import { lunesSemana } from "@/lib/potenciales-semana";
import { mesPorDefecto } from "@/lib/cierre-mensual";
import { cn } from "@/lib/utils";

/**
 * REPORTES Y ARCHIVO DE CASOS (rediseño de postventa, 23-10).
 *
 * Los cuatro reportes del área (día, semana, mes, fechas) vivían como botones
 * chicos en la cabecera de la bandeja, junto a «Pasar contacto a Central» y a
 * la tira de pestañas: tres cosas distintas compitiendo en la misma fila. Acá
 * tienen su lugar, con una línea que dice para qué sirve cada uno; «Hoy cubro
 * a…» (0530) viene con ellos porque es también una decisión del área, no de un
 * caso. Y el archivo —casos anteriores e histórico— queda a un clic sin ocupar
 * pestañas del trabajo diario.
 */
export default async function PostventaReportes({}: PropsVista) {
  const hoy = hoyLima();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <section className={cn("p-4", TARJETA)}>
          <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
            <FileBarChart2 className="size-4 text-primary" /> Reportes del área
          </h2>
          <ul className="mt-3 divide-y divide-border">
            <Fila titulo="Reporte del día" ayuda="Lo atendido hoy, por tipo, con quién lo hizo. Se puede elegir otro día.">
              <BotonReporteDiario fecha={hoy} compacto elegirFecha />
            </Fila>
            <Fila titulo="Cierre semanal" ayuda="El compromiso de la semana y lo que se cumplió. Se ejecuta el sábado.">
              <BotonCierreSemanal semana={lunesSemana()} compacto />
            </Fila>
            <Fila titulo="Reporte del mes" ayuda="Recibidos, atendidos, en proceso y cerrados del mes, como lo pide gerencia.">
              <BotonReporteMensual mes={mesPorDefecto(hoy)} compacto />
            </Fila>
            <Fila titulo="Reporte por fechas" ayuda="El mismo reporte entre dos fechas que usted elija (buzón de Gabriela, 12-10).">
              <BotonReportePeriodo hoy={hoy} compacto />
            </Fila>
          </ul>
        </section>

        <section className={cn("p-4", TARJETA)}>
          <h2 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-foreground">
            <Archive className="size-4 text-primary" /> Archivo
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Lo que ya no se trabaja, para consultar.</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            <Enlace href="/postventa/atenciones?ver=casos" titulo="Carpetas anteriores" ayuda="Las carpetas de postventa que se atendieron antes de la pista de casos (CASO-…)." />
            <Enlace href="/postventa/atenciones?ver=historico" titulo="Histórico e informes" ayuda="Informes del sistema, el Excel del área y los despachos de antes del CRM." />
            <Enlace href="/postventa/control?vista=cerrados" titulo="Pedidos cerrados" ayuda="Cada pedido cerrado con su recorrido, fotos y documentos." />
            <Enlace href="/nuevo/clientes/maquinas" titulo="Máquinas instaladas" ayuda="Todas las máquinas con su serie, garantía y último mantenimiento." />
          </ul>
        </section>
      </div>

      <aside className="space-y-4">
        <CoberturaPostventa />
      </aside>
    </div>
  );
}

function Fila({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </li>
  );
}

function Enlace({ href, titulo, ayuda }: { href: string; titulo: string; ayuda: string }) {
  return (
    <li>
      <Link href={href} className="group flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 transition-colors hover:bg-accent">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{titulo}</p>
          <p className="text-xs text-muted-foreground">{ayuda}</p>
        </div>
        <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </Link>
    </li>
  );
}
