/** El rótulo de cada foto del protocolo según su posición (gerencia 20-10): placa, equipo completo y después los detalles. */
export function rotuloFotoProtocolo(i: number): string {
  return i === 0 ? "Placa" : i === 1 ? "Equipo completo" : "Detalle";
}
