'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Botones de la página WhatsApp: desvincular el número o pedir un QR nuevo. */
export default function ControlWhatsapp({ conectado }: { conectado: boolean }) {
  const router = useRouter();
  const [confirmar, setConfirmar] = useState(false);
  const [aviso, setAviso] = useState('');
  async function pedir(accion: 'desvincular' | 'qr_nuevo') {
    setConfirmar(false);
    setAviso(accion === 'desvincular' ? 'Desvinculando… en unos segundos aparecerá un QR nuevo.' : 'Generando un QR nuevo…');
    await fetch('/api/tasking/tasking/whatsapp/comando', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion }) });
    setTimeout(() => router.refresh(), 4000);
  }
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {conectado ? (
        confirmar ? (
          <>
            <span className="text-sm text-slate-700">¿Desvincular este número? Dejarán de salir los WhatsApp hasta que vincules otro.</span>
            <button onClick={() => pedir('desvincular')} className="tk-tk-btn-peligro tk-tk-btn-chico">Sí, desvincular</button>
            <button onClick={() => setConfirmar(false)} className="tk-tk-btn-claro tk-tk-btn-chico">No</button>
          </>
        ) : (
          <button onClick={() => setConfirmar(true)} className="tk-tk-btn-claro tk-tk-btn-chico">Desvincular o cambiar de número</button>
        )
      ) : (
        <button onClick={() => pedir('qr_nuevo')} className="tk-tk-btn-claro tk-tk-btn-chico">Generar QR nuevo</button>
      )}
      {aviso && <span className="text-xs text-tk-700">{aviso}</span>}
    </div>
  );
}
