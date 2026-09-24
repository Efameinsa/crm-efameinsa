/**
 * LA PANTALLA DE CARGA DE LA PROPUESTA (24-09). Mientras el servidor arma la
 * sección, en vez de dejar la anterior congelada se ve al instante la forma
 * de la pantalla que viene: título, pestañas, cifras y filas, con un brillo
 * que pasa (estilos en propuesta.css, `.esqueleto`).
 */
export function CargaPropuesta() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="space-y-2">
        <div className="esqueleto h-6 w-56" />
        <div className="esqueleto h-3.5 w-80 max-w-full" />
      </div>
      <div className="esqueleto h-9 w-96 max-w-full" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="esqueleto h-20" />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="esqueleto size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="esqueleto h-3.5" style={{ width: `${70 - i * 6}%` }} />
              <div className="esqueleto h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
