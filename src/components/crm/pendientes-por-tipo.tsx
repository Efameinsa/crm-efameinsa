import Link from "next/link";
import { SeccionPlegable } from "@/components/crm/seccion-panel";
import type { PendientesPostventa } from "@/lib/agenda-postventa-datos";
import { DIAS_AVISO_PREVENTIVO, REGLA_PREVENTIVO, TITULO_PREVENTIVOS_POR_OFRECER } from "@/lib/preventivo";

/**
 * «¿QUÉ ME FALTA?», SEPARADO POR TIPO (Carlos, 22-09, ítem 6 de la reunión):
 * «está pendiente del despacho, pendiente de videollamadas, servicio técnico,
 * pendiente de mantenimiento preventivo. Hay varios puntos que se tienen que
 * ver acá». El calendario ya contesta «¿cuándo?»; esto contesta «¿qué?», sin
 * fecha de por medio — un despacho SIN fecha no aparecería en ningún
 * calendario, y es justo el que más urge programar.
 */
const BLOQUES: { clave: keyof PendientesPostventa; titulo: string; vacio: string; ayuda?: string }[] = [
  { clave: "despachosSinFecha", titulo: "Despachos sin fecha todavía", vacio: "Ningún despacho está sin fecha." },
  { clave: "despachosConFecha", titulo: "Despachos programados, sin salir", vacio: "Nada programado que siga sin despachar." },
  { clave: "videollamadas", titulo: "Videollamadas de preinstalación (Lima)", vacio: "Al día: ninguna videollamada pendiente." },
  { clave: "puestasEnMarcha", titulo: "Puestas en marcha pendientes", vacio: "Nada despachado esperando su puesta en marcha." },
  { clave: "atencionesSinProgramar", titulo: "Atenciones sin programar", vacio: "Nada por programar." },
  {
    clave: "preventivosPorVencer",
    titulo: TITULO_PREVENTIVOS_POR_OFRECER,
    vacio: `Ningún preventivo vence en los próximos ${DIAS_AVISO_PREVENTIVO} días.`,
    // Gerencia, 23-09: «Cada 3 meses se debe alertar para empezar el proceso
    // de envío de propuestas y concluir cierres antes de los 4 meses».
    ayuda: `${REGLA_PREVENTIVO} La máquina nueva tiene su preventivo a los 4 meses de entregada.`,
  },
];

export function PendientesPorTipo({ pendientes }: { pendientes: PendientesPostventa }) {
  return (
    <div className="space-y-2">
      {BLOQUES.map((b) => {
        const filas = pendientes[b.clave];
        return (
          <SeccionPlegable key={b.clave} titulo={b.titulo} cantidad={filas.length}>
            {b.ayuda && <p className="mb-1 text-[11px] text-muted-foreground">{b.ayuda}</p>}
            {filas.length === 0 ? (
              <p className="text-xs text-muted-foreground">{b.vacio}</p>
            ) : (
              <ul className="space-y-1">
                {filas.map((f) => (
                  <li key={f.id}>
                    <Link
                      href={f.url}
                      className="flex flex-wrap items-baseline gap-x-2 rounded px-1.5 py-1 text-xs hover:bg-accent"
                    >
                      <span className="font-medium text-foreground">{f.cliente}</span>
                      {f.detalle && <span className="text-muted-foreground">{f.detalle}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SeccionPlegable>
        );
      })}
    </div>
  );
}
