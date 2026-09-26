import { cn } from "@/lib/utils";

export type EmpresaMembrete = "EFAMEINSA" | "OPEN";

/**
 * Elegir con qué membrete sale una hoja de la apertura (Santos, 26-09: «las
 * derivaciones de llamada que hace postventa deberían tener la opción del
 * logo Efameinsa y Open Investments»). La hoja propone la empresa del cierre
 * —o la del último cierre del cliente—, pero una llamada de postventa muchas
 * veces no tiene cierre detrás y ahí la deducción no alcanza. Va en la barra
 * que no se imprime; la elección viaja en la dirección (?empresa=OPEN).
 */
export function SelectorMembrete({ base, actual, deducida }: { base: string; actual: EmpresaMembrete; deducida: EmpresaMembrete | null }) {
  const opciones: [EmpresaMembrete, string][] = [
    ["EFAMEINSA", "Efameinsa"],
    ["OPEN", "Open Investments"],
  ];
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Membrete:</span>
      {opciones.map(([clave, nombre]) => (
        <a
          key={clave}
          href={`${base}?empresa=${clave}`}
          aria-current={actual === clave ? "true" : undefined}
          className={cn(
            "rounded-full border px-2.5 py-1 font-medium",
            actual === clave ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
          )}
          title={deducida === clave ? "La empresa del cierre de este cliente" : undefined}
        >
          {nombre}
          {deducida === clave ? " · del cierre" : ""}
        </a>
      ))}
    </div>
  );
}

/** Lee ?empresa= de la dirección; cualquier otra cosa se ignora. */
export function empresaDeLaDireccion(valor: string | string[] | undefined): EmpresaMembrete | null {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v === "OPEN" || v === "EFAMEINSA" ? v : null;
}
