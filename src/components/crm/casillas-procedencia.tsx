/**
 * Las tres casillas de la procedencia en las hojas impresas de generación de
 * código (0385): la marcada sale con ☒; sin marcar, las tres en blanco para
 * marcarlas a mano en el almacén.
 */
const OPCIONES = [
  ["importacion", "Importación"],
  ["compra_local", "Compra local"],
  ["fabricacion", "Fabricación"],
] as const;

export function CasillasProcedencia({ marcada }: { marcada: string | null | undefined }) {
  return (
    <>
      {OPCIONES.map(([valor, etiqueta]) => (
        <span key={valor} className={`block whitespace-nowrap ${marcada === valor ? "font-bold" : ""}`}>
          {marcada === valor ? "☒" : "☐"} {etiqueta}
        </span>
      ))}
    </>
  );
}
