// La frase de una actividad del almacén registrada a mano (Santos 22-10):
// «Embalaje · 3 × coche HM-401 · para Hotel X». Aparte del componente para
// poder probarla sin el navegador.

export const TIPOS_ACTIVIDAD = [
  { clave: "Embalaje", pide: "Qué se embaló" },
  { clave: "Despacho", pide: "Qué salió" },
  { clave: "Recepción", pide: "Qué llegó" },
  { clave: "Entrega en ventanilla", pide: "Qué se entregó" },
  { clave: "Inventario", pide: "De qué" },
  { clave: "Orden y limpieza", pide: "Dónde" },
  { clave: "Otra", pide: "Qué se hizo" },
] as const;

export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]["clave"];

/** «Embalaje · 3 × coche HM-401 · para Hotel X · guía 123» */
export function armarActividad(t: { tipo: TipoActividad; que: string; cantidad: string; para: string; nota: string }): string {
  const cant = Number(t.cantidad);
  const que = t.que.trim();
  return [
    t.tipo === "Otra" ? null : t.tipo,
    que ? `${cant > 0 ? `${cant} × ` : ""}${que}` : cant > 0 ? `${cant} unidades` : null,
    t.para.trim() ? `${/^(para|a|de)\s/i.test(t.para.trim()) ? "" : t.tipo === "Recepción" ? "de " : "para "}${t.para.trim()}` : null,
    t.nota.trim() || null,
  ]
    .filter(Boolean)
    .join(" · ");
}
