// Saldo ESTIMADO de la cuenta prepago de Google Ads (0421, gerencia 07-10).
//
// El CRM no ve Google Ads: parte de lo que gerencia anota —recargas y, cuando
// quiere, el saldo real que muestra Google («calibración»)— y descuenta el tope
// diario de forma continua. Es un techo pesimista a propósito: Google puede
// gastar menos que el tope (y entonces sobra saldo), pero avisar antes de
// tiempo cuesta poco y quedarse sin saldo cuesta la posición en las subastas.

export interface MovimientoSaldo {
  id: string;
  tipo: "recarga" | "calibracion";
  monto: number;
  fecha: string; // ISO
}

export interface EstadoSaldo {
  /** No hay nada anotado: no se puede estimar. */
  sinDatos: boolean;
  saldo: number;
  diasRestantes: number;
  /** Cuándo se acabaría al ritmo del tope; null si ya se acabó o no hay datos. */
  agotamientoAt: string | null;
  /** Menos de un día de saldo (la alerta que pidió Santos). */
  menosDeUnDia: boolean;
  /** El movimiento más reciente: la alerta se manda una vez por cada uno. */
  ultimoMovimientoId: string | null;
}

const DIA_MS = 86_400_000;

export function estimarSaldo(movimientos: MovimientoSaldo[], topeDiario: number, ahora: Date = new Date()): EstadoSaldo {
  const orden = [...movimientos].sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  if (!orden.length || !(topeDiario > 0)) {
    return { sinDatos: true, saldo: 0, diasRestantes: 0, agotamientoAt: null, menosDeUnDia: false, ultimoMovimientoId: null };
  }

  const gastar = (saldo: number, desde: number, hasta: number) =>
    Math.max(0, saldo - (Math.max(0, hasta - desde) / DIA_MS) * topeDiario);

  let saldo = 0;
  let t = new Date(orden[0].fecha).getTime();
  for (const m of orden) {
    const f = new Date(m.fecha).getTime();
    saldo = gastar(saldo, t, f);
    saldo = m.tipo === "calibracion" ? m.monto : saldo + m.monto;
    t = Math.max(t, f);
  }
  const ahoraMs = ahora.getTime();
  // Un movimiento con fecha futura no se descuenta hasta que llegue.
  saldo = gastar(saldo, t, ahoraMs);
  saldo = Math.round(saldo * 100) / 100;

  const diasRestantes = saldo / topeDiario;
  return {
    sinDatos: false,
    saldo,
    diasRestantes,
    agotamientoAt: saldo > 0 ? new Date(Math.max(ahoraMs, t) + diasRestantes * DIA_MS).toISOString() : null,
    menosDeUnDia: saldo < topeDiario,
    ultimoMovimientoId: orden[orden.length - 1].id,
  };
}
