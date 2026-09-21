// El audio grabado en el navegador sale en WebM (Chrome y Edge no saben armar
// otro contenedor con MediaRecorder), y Meta lo rechaza con «Media upload
// error»: WhatsApp solo acepta aac, mp4, mpeg, amr y ogg/opus. Santos lo vio
// el 21-09 probando desde la cuenta de práctica. Acá se decodifica la
// grabación con el propio navegador y se vuelve a codificar en MP3 (mono,
// 32 kbps: voz), que WhatsApp reproduce en todos los teléfonos. Corre en el
// cliente: en Vercel no hay ffmpeg.

import { Mp3Encoder } from "@breezystack/lamejs";

const KBPS = 32;
const BLOQUE = 1152;

export async function audioAMp3(blob: Blob): Promise<Blob> {
  const contexto = new AudioContext();
  try {
    const decodificado = await contexto.decodeAudioData(await blob.arrayBuffer());
    // Mono: si hay dos canales se promedian, que para voz da igual y pesa la mitad.
    const canales = decodificado.numberOfChannels;
    const largo = decodificado.length;
    const muestras = new Float32Array(largo);
    for (let c = 0; c < canales; c++) {
      const datos = decodificado.getChannelData(c);
      for (let i = 0; i < largo; i++) muestras[i] += datos[i] / canales;
    }
    const pcm = new Int16Array(largo);
    for (let i = 0; i < largo; i++) {
      const v = Math.max(-1, Math.min(1, muestras[i]));
      pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    const codificador = new Mp3Encoder(1, decodificado.sampleRate, KBPS);
    const partes: Uint8Array[] = [];
    for (let i = 0; i < pcm.length; i += BLOQUE) {
      const trozo = codificador.encodeBuffer(pcm.subarray(i, i + BLOQUE));
      if (trozo.length > 0) partes.push(trozo);
    }
    const final = codificador.flush();
    if (final.length > 0) partes.push(final);
    return new Blob(partes as BlobPart[], { type: "audio/mpeg" });
  } finally {
    await contexto.close().catch(() => {});
  }
}
