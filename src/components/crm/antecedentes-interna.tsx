import { filasAntecedentesInterna, type AntecedentesInterna } from "@/lib/apertura-interna";

/**
 * Los antecedentes del SERVICIO INTERNO (0566; Santos 20-10), tal como se
 * anotaron al emitir la apertura desde el caso. Va en la hoja de la apertura
 * (papel) y en el pedido (pantalla): el técnico los lee antes de abrir el equipo.
 */
export function AntecedentesInterna({ modalidad, antecedentes, papel = false }: { modalidad: string | null | undefined; antecedentes: unknown; papel?: boolean }) {
  if (modalidad !== "interna" || !antecedentes || typeof antecedentes !== "object") return null;
  const filas = filasAntecedentesInterna(antecedentes as AntecedentesInterna);
  if (papel) {
    return (
      <>
        <h2 className="mt-5 border-b border-neutral-300 pb-1 text-[11px] font-bold uppercase tracking-wide">Servicio interno (en nuestra planta) · antecedentes del equipo</h2>
        <table className="mt-2 w-full border-collapse text-[12px]">
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} className="align-top">
                <td className="w-56 border border-neutral-400 px-2 py-1 font-semibold">{k}</td>
                <td className="whitespace-pre-line border border-neutral-400 px-2 py-1">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </>
    );
  }
  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 text-xs shadow-sm">
      <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-foreground">Servicio interno · antecedentes</p>
      <dl className="space-y-1.5">
        {filas.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="whitespace-pre-line font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
