/** El N.º de protocolo ya no se escribe (Lesly, 20-10): sale solo y es correlativo
 *  (0003-2026, 0004-2026…) al marcar «Probada y embalada» o «Protocolo terminado» (0541). */
export function NumeroDeProtocolo({ numero, className = "" }: { numero?: string | null; className?: string }) {
  return (
    <div
      className={`flex items-center rounded-md border border-dashed border-border px-2 text-[11px] text-muted-foreground ${className}`}
      title="Es correlativo: lo pone el sistema al marcarla probada y sale en el informe"
    >
      {numero?.trim() ? <>N.º de protocolo <span className="ml-1 font-mono font-medium text-foreground">{numero}</span></> : "N.º de protocolo: sale solo al marcarla"}
    </div>
  );
}
