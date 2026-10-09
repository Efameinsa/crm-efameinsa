'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from './TarjetaCompromiso';

type PersonaMin = { id: string; nombre: string; apodos: string };
type Fase = 'preparar' | 'iniciando' | 'grabando' | 'cerrando' | 'procesando';

// Tipos mínimos de la Web Speech API (Chrome/Edge la exponen como webkitSpeechRecognition)
interface ResultadoVoz { isFinal: boolean; 0: { transcript: string } }
interface EventoVoz { resultIndex: number; results: ArrayLike<ResultadoVoz> }
interface Reconocedor {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: EventoVoz) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function claseReconocedor(): (new () => Reconocedor) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconocedor; webkitSpeechRecognition?: new () => Reconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const sinSuscripcion = () => () => {};

const reloj = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:` : ''}${String(m).padStart(h ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
};

export default function Grabadora({ personas, tituloSugerido }: { personas: PersonaMin[]; tituloSugerido: string }) {
  const router = useRouter();
  const [fase, setFase] = useState<Fase>('preparar');
  const [titulo, setTitulo] = useState(tituloSugerido);
  const [elegidos, setElegidos] = useState<Set<string>>(() => new Set(personas.map((p) => p.id)));
  const [lineas, setLineas] = useState<string[]>([]);
  const [parcial, setParcial] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [nivel, setNivel] = useState(0);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');
  const [confirmar, setConfirmar] = useState(false);
  const [repasados, setRepasados] = useState<Set<string>>(new Set());
  const [subidasPendientes, setSubidasPendientes] = useState(0);

  const idRef = useRef<string | null>(null);
  const grabandoRef = useRef(false);
  const textoPendiente = useRef('');
  const parcialRef = useRef('');
  const parteRef = useRef(0);
  const colaSubidas = useRef<Promise<void>>(Promise.resolve());
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recogRef = useRef<Reconocedor | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const wakeRef = useRef<{ release(): Promise<void> } | null>(null);
  const subtitulosRef = useRef<HTMLDivElement>(null);

  const hayVoz = useSyncExternalStore(sinSuscripcion, () => !!claseReconocedor(), () => null);

  useEffect(() => {
    subtitulosRef.current?.scrollTo({ top: subtitulosRef.current.scrollHeight, behavior: 'smooth' });
  }, [lineas, parcial]);

  // Aviso al cerrar la pestaña en plena reunión
  useEffect(() => {
    if (fase !== 'grabando') return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [fase]);

  useEffect(() => () => limpiar(), []);

  function limpiar() {
    grabandoRef.current = false;
    timers.current.forEach((t) => clearInterval(t));
    timers.current = [];
    try { recogRef.current?.stop(); } catch {}
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close().catch(() => {});
    wakeRef.current?.release().catch(() => {});
  }

  async function enviarTexto() {
    const id = idRef.current;
    const texto = textoPendiente.current.trim();
    if (!id || !texto) return;
    textoPendiente.current = '';
    try {
      const r = await fetch(`/api/tasking/reuniones/${id}/texto`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
      if (!r.ok) throw new Error();
    } catch {
      textoPendiente.current = `${texto} ${textoPendiente.current}`; // se reintenta en la próxima vuelta
    }
  }

  function encolarAudio(blob: Blob) {
    const n = parteRef.current++;
    setSubidasPendientes((x) => x + 1);
    colaSubidas.current = colaSubidas.current.then(async () => {
      for (let intento = 0; intento < 4; intento++) {
        try {
          const r = await fetch(`/api/tasking/reuniones/${idRef.current}/audio?n=${n}`, { method: 'POST', body: blob });
          if (r.ok) break;
        } catch {}
        await new Promise((res) => setTimeout(res, 1500 * (intento + 1)));
      }
      setSubidasPendientes((x) => x - 1);
    });
  }

  function iniciarVoz() {
    const Clase = claseReconocedor();
    if (!Clase) return;
    const r = new Clase();
    r.lang = 'es-PE';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev) => {
      let interino = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const t = res[0].transcript.trim();
        if (res.isFinal) {
          if (t) {
            textoPendiente.current += ` ${t}`;
            setLineas((l) => [...l.slice(-300), t]);
          }
        } else interino += `${res[0].transcript} `;
      }
      parcialRef.current = interino.trim();
      setParcial(parcialRef.current);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed')
        setAviso('El navegador no permitió los subtítulos en vivo. El audio se sigue grabando y Gemini lo transcribirá al final.');
      else if (e.error === 'network') setAviso('Sin internet para los subtítulos; se reintenta solo. El audio se sigue grabando.');
    };
    // Chrome corta el reconocimiento cada cierto tiempo: se reinicia mientras dure la reunión
    r.onend = () => {
      if (parcialRef.current) {
        textoPendiente.current += ` ${parcialRef.current}`;
        setLineas((l) => [...l.slice(-300), parcialRef.current]);
        parcialRef.current = '';
        setParcial('');
      }
      if (grabandoRef.current) setTimeout(() => { try { r.start(); } catch {} }, 250);
    };
    recogRef.current = r;
    try { r.start(); } catch {}
  }

  async function iniciar() {
    setError('');
    setFase('iniciando');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      setFase('preparar');
      return setError('No se pudo usar el micrófono. Dale permiso al navegador (ícono del candado junto a la dirección) y vuelve a intentar.');
    }
    const r = await fetch('/api/tasking/reuniones', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titulo, participantes: [...elegidos] }) });
    if (!r.ok) {
      stream.getTracks().forEach((t) => t.stop());
      setFase('preparar');
      return setError((await r.json().catch(() => ({}))).error || 'No se pudo crear la reunión.');
    }
    idRef.current = (await r.json()).id;
    streamRef.current = stream;
    grabandoRef.current = true;

    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 32000 });
    rec.ondataavailable = (e) => e.data.size && encolarAudio(e.data);
    rec.start(15000);
    recorderRef.current = rec;

    iniciarVoz();

    // Medidor de volumen
    const ctx = new AudioContext();
    const analizador = ctx.createAnalyser();
    analizador.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analizador);
    ctxRef.current = ctx;
    ctx.resume().catch(() => {});
    const buf = new Uint8Array(analizador.fftSize);
    const inicio = Date.now();
    timers.current.push(
      window.setInterval(() => {
        analizador.getByteTimeDomainData(buf);
        let suma = 0;
        for (const v of buf) suma += ((v - 128) / 128) ** 2;
        setNivel(Math.min(1, Math.sqrt(suma / buf.length) * 4));
      }, 120),
      window.setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000),
      window.setInterval(enviarTexto, 5000),
    );
    try {
      wakeRef.current = await (navigator as unknown as { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null;
    } catch {}
    setFase('grabando');
  }

  async function terminar() {
    setConfirmar(false);
    setFase('cerrando');
    grabandoRef.current = false;
    try { recogRef.current?.stop(); } catch {}
    await new Promise((r) => setTimeout(r, 900)); // da tiempo al último resultado de voz
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') {
      await new Promise<void>((res) => {
        rec.onstop = () => res();
        rec.stop();
      });
    }
    limpiar();
    if (parcialRef.current) textoPendiente.current += ` ${parcialRef.current}`;
    await colaSubidas.current;
    await enviarTexto();
    if (textoPendiente.current) await enviarTexto();
    const id = idRef.current!;
    const r = await fetch(`/api/tasking/reuniones/${id}/terminar`, { method: 'POST' });
    if (!r.ok) {
      setError('No se pudo cerrar la reunión. Ábrela desde «Reuniones» y pulsa «Procesar».');
      return;
    }
    setFase('procesando');
    const t0 = Date.now();
    const revisar = async () => {
      const estado = await fetch(`/api/tasking/reuniones/${id}`).then((x) => x.json()).catch(() => null);
      if (estado?.estado === 'lista' || estado?.estado === 'error' || Date.now() - t0 > 6 * 60_000) {
        router.push(`/tasking/reuniones/${id}`);
        router.refresh();
      } else setTimeout(revisar, 2500);
    };
    setTimeout(revisar, 2500);
  }

  const participantes = personas.filter((p) => elegidos.has(p.id));

  if (fase === 'procesando' || fase === 'cerrando') {
    return (
      <div className="mx-auto mt-12 max-w-md text-center">
        <div className="mx-auto size-14 animate-spin rounded-full border-4 border-tk-100 border-t-tk-600" />
        <h1 className="mt-6 text-xl font-bold text-slate-900">{fase === 'cerrando' ? 'Guardando la reunión…' : 'Armando el acta…'}</h1>
        <p className="mt-2 text-sm text-slate-500">
          {fase === 'cerrando'
            ? `Subiendo lo último del audio${subidasPendientes ? ` (${subidasPendientes} partes)` : ''}.`
            : 'La IA está sacando los compromisos de cada persona. Luego se envían por WhatsApp y correo. Suele tardar menos de un minuto.'}
        </p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (fase === 'grabando') {
    return (
      <div className="space-y-4">
        <div className="tk-tarjeta flex flex-wrap items-center gap-4 px-5 py-4">
          <span className="flex items-center gap-2 font-semibold text-red-600">
            <span className="tk-punto-vivo size-3 rounded-full bg-red-500" /> Grabando
          </span>
          <span className="font-mono text-2xl font-bold text-slate-900 tabular-nums">{reloj(segundos)}</span>
          <span className="min-w-0 flex-1 truncate text-slate-600">{titulo}</span>
          <div className="flex items-center gap-2" title="Volumen del micrófono">
            <svg viewBox="0 0 24 24" className="size-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0014 0M12 18v3" />
            </svg>
            <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-100" style={{ width: `${Math.round(nivel * 100)}%` }} />
            </div>
          </div>
        </div>

        {aviso && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{aviso}</div>}

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div ref={subtitulosRef} className="h-[52vh] overflow-y-auto rounded-2xl bg-slate-900 px-6 py-5 text-lg leading-relaxed text-slate-100 lg:h-[60vh]">
            {lineas.length === 0 && !parcial && (
              <p className="text-slate-500">{hayVoz ? 'Empieza a hablar: aquí aparecerá lo que se dice…' : 'Este navegador no muestra subtítulos en vivo, pero el audio se está grabando y se transcribirá al final.'}</p>
            )}
            {lineas.map((l, i) => (
              <p key={i} className="mb-1.5">
                {l}
              </p>
            ))}
            {parcial && <p className="text-slate-400">{parcial}</p>}
          </div>

          <aside className="space-y-4">
            <div className="tk-tarjeta p-4">
              <h2 className="text-sm font-semibold text-slate-800">Antes de terminar, repasen los acuerdos</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Di en voz alta, persona por persona, qué hará y para cuándo. Ejemplo: <i>«María: enviar la cotización al cliente, hoy a las 4 de la tarde.»</i>
              </p>
              <ul className="mt-3 space-y-1.5">
                {participantes.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setRepasados((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition ${repasados.has(p.id) ? 'bg-emerald-50 text-emerald-800' : 'hover:bg-slate-50'}`}
                    >
                      <span className={`grid size-4 place-items-center rounded border text-[10px] ${repasados.has(p.id) ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'}`}>{repasados.has(p.id) ? '✓' : ''}</span>
                      {p.nombre}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {!confirmar ? (
              <button onClick={() => setConfirmar(true)} className="tk-btn-peligro w-full py-3.5 text-base">
                ■ Terminar reunión
              </button>
            ) : (
              <div className="tk-tarjeta space-y-2 border-red-200 p-4">
                <p className="text-sm font-medium text-slate-800">¿Ya repasaron los acuerdos? Al terminar se arma el acta y se envían los compromisos.</p>
                <div className="flex gap-2">
                  <button onClick={terminar} className="tk-btn-peligro flex-1">Sí, terminar</button>
                  <button onClick={() => setConfirmar(false)} className="tk-btn-claro flex-1">Seguir</button>
                </div>
              </div>
            )}
            <p className="text-center text-xs text-slate-400">
              {lineas.reduce((a, l) => a + l.split(/\s+/).length, 0)} palabras captadas · {parteRef.current} partes de audio
            </p>
          </aside>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Grabar reunión</h1>
        <p className="text-sm text-slate-500">Pulsa iniciar, conversen con normalidad y, al final, repasen los acuerdos en voz alta. Tasking hace el resto.</p>
      </div>

      {hayVoz === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este navegador no tiene subtítulos en vivo. Usa <b>Google Chrome</b> o <b>Microsoft Edge</b> para verlos. Igual puedes grabar: el audio se transcribirá al terminar.
        </div>
      )}

      <div className="tk-tarjeta space-y-5 p-5">
        <label className="block">
          <span className="tk-etiqueta">Tema de la reunión</span>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="tk-campo text-base" />
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="tk-etiqueta mb-0">Participantes ({elegidos.size})</span>
            <div className="flex gap-3 text-xs font-medium text-tk-600">
              <button onClick={() => setElegidos(new Set(personas.map((p) => p.id)))}>Todos</button>
              <button onClick={() => setElegidos(new Set())}>Ninguno</button>
            </div>
          </div>
          {personas.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Aún no registraste al equipo. <a href="/tasking/equipo" className="font-semibold text-tk-600">Agrega a los trabajadores</a> con su WhatsApp y correo para que les lleguen sus compromisos.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {personas.map((p) => {
                const activo = elegidos.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => setElegidos((s) => { const n = new Set(s); if (activo) n.delete(p.id); else n.add(p.id); return n; })}
                    className={`flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm transition ${activo ? 'border-tk-500 bg-tk-50 text-tk-700' : 'border-slate-200 bg-white text-slate-500'}`}
                  >
                    <Avatar nombre={p.nombre} id={p.id} chico />
                    {p.nombre}
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">La IA también reconoce a los del equipo que no marques, por si se les asigna algo sin estar presentes.</p>
        </div>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <button onClick={iniciar} disabled={fase === 'iniciando' || !titulo.trim()} className="tk-btn-primario w-full py-4 text-base">
          <span className="size-3 rounded-full bg-red-400" />
          {fase === 'iniciando' ? 'Preparando micrófono…' : 'Iniciar grabación'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['🎙️', 'Laptop al centro', 'Que el micrófono quede cerca de todos. Eviten hablar varios a la vez.'],
          ['🗣️', 'Digan los nombres', '«Jesús, tú te encargas de…» ayuda a la IA a saber quién es responsable.'],
          ['✅', 'Repaso final', 'Nombre, tarea y plazo de cada acuerdo, en voz alta, antes de terminar.'],
        ].map(([i, t, d]) => (
          <div key={t} className="tk-tarjeta p-4">
            <div className="text-xl">{i}</div>
            <div className="mt-1 text-sm font-semibold text-slate-800">{t}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{d}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
