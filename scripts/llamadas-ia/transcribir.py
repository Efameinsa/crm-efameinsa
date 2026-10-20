"""Transcribe un audio de llamada con faster-whisper y escribe JSON por la salida estándar.

Uso: transcribir.py <audio> [modelo]
Salida: {"duracion": 31.3, "idioma": "es", "segmentos": [{"inicio": 0.0, "fin": 2.1, "texto": "..."}]}

Corre en el venv /opt/llamadas-ia (faster-whisper + av). Sin GPU: int8 en CPU.
"""
import json
import os
import sys

from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) < 2:
        print("uso: transcribir.py <audio> [modelo]", file=sys.stderr)
        return 2
    audio = sys.argv[1]
    modelo = sys.argv[2] if len(sys.argv) > 2 else os.environ.get("WHISPER_MODELO", "small")
    hilos = int(os.environ.get("WHISPER_HILOS", "4"))
    m = WhisperModel(modelo, device="cpu", compute_type="int8", cpu_threads=hilos)
    segmentos, info = m.transcribe(audio, language="es", vad_filter=True, beam_size=1, condition_on_previous_text=False)
    salida = {
        "duracion": round(info.duration, 1),
        "idioma": info.language,
        "segmentos": [{"inicio": round(s.start, 1), "fin": round(s.end, 1), "texto": s.text.strip()} for s in segmentos if s.text.strip()],
    }
    sys.stdout.write(json.dumps(salida, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
