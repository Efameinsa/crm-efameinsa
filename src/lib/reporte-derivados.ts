import * as XLSX from "xlsx";
import { fechaHoraLima, fechaCalendario } from "@/lib/fechas";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { ETIQUETA_CANAL, ETIQUETA_ETAPA, ETIQUETA_FOCO, demora, type DerivadoFila, type FocoDerivado } from "@/lib/derivados-central";

/**
 * LO QUE DERIVÓ CENTRAL, EN UN EXCEL PARA GERENCIA (Central, 10-10: «un reporte
 * de todo el mes de octubre de las derivaciones al área de PV1 y PV2 sin
 * atender, que están quedando pendientes; quiero un documento para descargar y
 * enviar a gerencia»).
 *
 * Es la misma lista de «Lo que derivé», con los filtros que estén puestos
 * (período, comercial o toda postventa, cajón, quién registró, canal,
 * búsqueda). Dos hojas:
 *  - «Resumen»: qué filtros, y cuántos por persona y por cajón.
 *  - «Derivaciones»: una por fila, con cuánto lleva sin que nadie la toque.
 */
export interface FiltrosReporte {
  desde: string;
  hasta: string;
  /** «Rubí Simeon», «Toda postventa (PV, PV1, PV2…)» o null = todos. */
  comercial: string | null;
  /** Etiqueta del cajón elegido, o null = todos. */
  foco: string | null;
  otros: string[];
  generadoPor: string;
}

const ORDEN_FOCO: FocoDerivado[] = ["sin_atender", "en_gestion", "cotizado", "cerrado"];

const aQuien = (d: DerivadoFila) =>
  d.comercial ? `${d.comercial.codigo_comercial ? `${d.comercial.codigo_comercial} · ` : ""}${d.comercial.nombre}` : "—";

export function libroDerivados(filas: DerivadoFila[], f: FiltrosReporte, ahora = new Date()): Buffer {
  const ahoraIso = ahora.toISOString();

  // Resumen: cabecera con los filtros y un cuadro persona × cajón.
  const personas = [...new Set(filas.map(aQuien))].sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const resumen: (string | number)[][] = [
    ["Lo que derivó Central"],
    ["Período", `${fechaCalendario(f.desde)} al ${fechaCalendario(f.hasta)}`],
    ["Derivado a", f.comercial ?? "Todos"],
    ["Estado", f.foco ?? "Todos"],
    ...f.otros.map((o) => ["Filtro", o]),
    ["Generado", `${fechaHoraLima(ahoraIso)} por ${f.generadoPor}`],
    [],
    ["Derivado a", ...ORDEN_FOCO.map((x) => ETIQUETA_FOCO[x]), "Más de 4 h sin que nadie lo toque", "Total"],
    ...personas.map((p) => {
      const suyas = filas.filter((d) => aQuien(d) === p);
      return [
        p,
        ...ORDEN_FOCO.map((x) => suyas.filter((d) => d.foco === x).length),
        suyas.filter((d) => d.alerta === "demora").length,
        suyas.length,
      ];
    }),
    [
      "Total",
      ...ORDEN_FOCO.map((x) => filas.filter((d) => d.foco === x).length),
      filas.filter((d) => d.alerta === "demora").length,
      filas.length,
    ],
  ];

  const detalle = filas.map((d) => ({
    Código: d.codigo ?? "",
    "Derivado el": fechaHoraLima(d.asignadoAt),
    "Derivado a": aQuien(d),
    Estado: ETIQUETA_FOCO[d.foco] + (d.alerta === "demora" ? " (más de 4 h sin tocar)" : d.alerta === "frio" ? " (más de 7 días quieto)" : ""),
    "Tiempo desde la derivación": demora(d.asignadoAt, ahoraIso),
    Empresa: d.razonSocial ?? "",
    Contacto: d.nombreContacto ?? "",
    Teléfono: d.telefono ?? "",
    Correo: d.email ?? "",
    Canal: ETIQUETA_CANAL[d.canal] ?? d.canal,
    "Registró": d.registradoPor?.nombre ?? "Formulario web",
    "Qué pide": (d.mensaje ?? "").replace(/\s+/g, " ").trim(),
    Etapa: d.oportunidad ? (ETIQUETA_ETAPA[d.oportunidad.etapa]?.texto ?? d.oportunidad.etapa) : "",
    Gestiones: d.gestiones,
    "Última gestión": d.ultimaGestion
      ? `${fechaHoraLima(d.ultimaGestion.fecha)} · ${ETIQUETA_ACTIVIDAD[d.ultimaGestion.tipo] ?? d.ultimaGestion.tipo}${d.ultimaGestion.nota ? ` · ${d.ultimaGestion.nota.replace(/\s+/g, " ").trim()}` : ""}`
      : "Ninguna",
    Cotizaciones: d.cotizaciones.map((c) => c.codigo ?? "s/c").join(", "),
    Urgencias: d.urgencias?.total ?? 0,
  }));

  const libro = XLSX.utils.book_new();
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen);
  hojaResumen["!cols"] = [{ wch: 34 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(libro, hojaResumen, "Resumen");

  const hoja = XLSX.utils.json_to_sheet(detalle.length ? detalle : [{ Aviso: "No hay derivaciones con estos filtros." }]);
  hoja["!cols"] = [12, 17, 26, 24, 14, 36, 28, 13, 26, 14, 18, 60, 18, 10, 60, 16, 10].map((wch) => ({ wch }));
  if (detalle.length) hoja["!autofilter"] = { ref: hoja["!ref"] as string };
  XLSX.utils.book_append_sheet(libro, hoja, "Derivaciones");

  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
