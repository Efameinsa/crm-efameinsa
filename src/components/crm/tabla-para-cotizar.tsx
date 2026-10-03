"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * LO QUE LE FALTA AL CLIENTE, COMO CUADRO (Lesly, 02-10, con la foto de su
 * Word: «en la parte del formato de videollamada en cotizar deberá tener un
 * cuadro donde pueda llenar»). Las mismas columnas que su tabla —código,
 * descripción, cantidad, precio, IGV y stock— y las que ya imprime el informe
 * en «Cotizar: repuestos». El precio va en dólares, con hasta cuatro decimales
 * porque así vienen del sistema (US$ 0.2401 la reducción bush).
 */
export type FilaCotizar = {
  codigo: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  precio: string;
  igv: "no_incluye" | "incluye";
  stock: string;
};

export const filaVacia = (): FilaCotizar => ({ codigo: "", descripcion: "", cantidad: "1", unidad: "und", precio: "", igv: "no_incluye", stock: "" });

/** Lo que se guarda en `informes_servicio.repuestos`: solo las filas con descripción. */
export function filasParaGuardar(filas: FilaCotizar[]) {
  return filas
    .filter((f) => f.descripcion.trim())
    .map((f) => ({
      codigo: f.codigo.trim(),
      descripcion: f.descripcion.trim(),
      cantidad: f.cantidad.trim() ? Number(f.cantidad) : null,
      unidad: f.unidad.trim() || "und",
      precio: f.precio.trim() ? Number(f.precio) : null,
      igv: f.igv,
      stock: f.stock.trim() || null,
    }));
}

/** Una línea por repuesto, para el aviso a postventa: «2 und · VÁLVULA REGULADORA (MDDV01871908)». */
export function filasComoTexto(filas: FilaCotizar[]) {
  return filas
    .filter((f) => f.descripcion.trim())
    .map((f) => `${f.cantidad.trim() ? `${f.cantidad.trim()} ${f.unidad.trim() || "und"} · ` : ""}${f.descripcion.trim()}${f.codigo.trim() ? ` (${f.codigo.trim()})` : ""}`)
    .join("\n");
}

const celda = "w-full min-w-0 rounded-md border border-border bg-background px-2 py-1 text-xs";
const decimal = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

export function TablaParaCotizar({ filas, onChange }: { filas: FilaCotizar[]; onChange: (f: FilaCotizar[]) => void }) {
  const cambiar = (i: number, campo: keyof FilaCotizar, valor: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));

  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-foreground">Lo que le falta al cliente (para cotizar)</p>
      <p className="text-[11px] text-muted-foreground">Un repuesto por fila. Sale en el informe como el cuadro «Cotizar: repuestos» y postventa lo cotiza.</p>
      {filas.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[46rem] border-collapse text-xs">
            <thead className="bg-secondary/60 text-left text-[11px] text-muted-foreground">
              <tr>
                <th className="w-32 px-2 py-1.5 font-medium">Código</th>
                <th className="px-2 py-1.5 font-medium">Descripción</th>
                <th className="w-20 px-2 py-1.5 font-medium">Cantidad</th>
                <th className="w-20 px-2 py-1.5 font-medium">Unidad</th>
                <th className="w-24 px-2 py-1.5 font-medium">Precio US$</th>
                <th className="w-28 px-2 py-1.5 font-medium">IGV</th>
                <th className="w-24 px-2 py-1.5 font-medium">Stock</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="p-1">
                    <input value={f.codigo} onChange={(e) => cambiar(i, "codigo", e.target.value.toUpperCase())} placeholder="MDDV01871908" aria-label="Código" className={`${celda} font-mono`} />
                  </td>
                  <td className="p-1">
                    <textarea rows={1} value={f.descripcion} onChange={(e) => cambiar(i, "descripcion", e.target.value)} placeholder="Válvula reguladora LV404B4" aria-label="Descripción" className={`${celda} resize-y`} />
                  </td>
                  <td className="p-1">
                    <input value={f.cantidad} onChange={(e) => cambiar(i, "cantidad", decimal(e.target.value))} inputMode="decimal" aria-label="Cantidad" className={`${celda} text-right`} />
                  </td>
                  <td className="p-1">
                    <input value={f.unidad} onChange={(e) => cambiar(i, "unidad", e.target.value)} list="unidades-cotizar" aria-label="Unidad" className={celda} />
                  </td>
                  <td className="p-1">
                    <input value={f.precio} onChange={(e) => cambiar(i, "precio", decimal(e.target.value))} inputMode="decimal" placeholder="50.00" aria-label="Precio en dólares" className={`${celda} text-right`} />
                  </td>
                  <td className="p-1">
                    <select value={f.igv} onChange={(e) => cambiar(i, "igv", e.target.value)} aria-label="IGV" className={celda}>
                      <option value="no_incluye">No incluye</option>
                      <option value="incluye">Incluye</option>
                    </select>
                  </td>
                  <td className="p-1">
                    <input value={f.stock} onChange={(e) => cambiar(i, "stock", e.target.value)} placeholder="15 und" aria-label="Stock" className={celda} />
                  </td>
                  <td className="p-1 text-center">
                    <button type="button" onClick={() => onChange(filas.filter((_, j) => j !== i))} className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-destructive" aria-label={`Quitar la fila ${i + 1}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <datalist id="unidades-cotizar">
            <option value="und" />
            <option value="mtr" />
            <option value="kit" />
            <option value="jgo" />
            <option value="gln" />
          </datalist>
        </div>
      )}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...filas, filaVacia()])}>
        <Plus className="size-3.5" /> {filas.length === 0 ? "Agregar un repuesto para cotizar" : "Otra fila"}
      </Button>
    </div>
  );
}
