/**
 * pitchDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Módulo de captura de audio y detección de tono en tiempo real.
 * Usa Web Audio API + Pitchy para detectar qué nota está tocando
 * el usuario (guitarra, bajo, piano, voz, etc.)
 *
 * Por ahora está preparado pero no conectado al gameplay.
 * En la v2 usaremos `onNoteDetected` para disparar cuando el
 * jugador toque la nota correcta en su instrumento.
 * ─────────────────────────────────────────────────────────────
 */

import { PitchDetector } from 'pitchy'

// Nombres de las notas musicales en español / inglés
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

/**
 * Convierte una frecuencia en Hz a nombre de nota musical.
 * Ej: 440 Hz → "A4"
 */
function frequencyToNote(frequency: number): string {
  const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69)
  const noteName = NOTE_NAMES[midiNote % 12]
  const octave = Math.floor(midiNote / 12) - 1
  return `${noteName}${octave}`
}

/** Resultado de la detección de pitch */
export interface PitchResult {
  frequency: number    // Hz detectados
  clarity: number      // Confianza 0.0 – 1.0 (>0.9 es muy buena)
  note: string         // Ej: "A4", "E2"
}

/** Callback que se ejecuta cada vez que se detecta una nota clara */
export type NoteDetectedCallback = (result: PitchResult) => void

/**
 * PitchDetectorService
 * ─────────────────────────────────────────────────────────────
 * Clase principal para capturar micrófono y detectar pitch.
 *
 * Uso:
 *   const detector = new PitchDetectorService()
 *   await detector.start((result) => console.log(result.note))
 *   detector.stop()
 */
export class PitchDetectorService {
  // Web Audio API
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null

  // Pitchy
  private detector: PitchDetector<Float32Array> | null = null
  private inputBuffer: Float32Array<ArrayBuffer> | null = null

  // Loop de detección
  private animFrameId: number | null = null
  private isRunning = false

  // Umbral mínimo de claridad para considerar una nota válida
  private readonly CLARITY_THRESHOLD = 0.85
  // Rango de frecuencias aceptables (E1 de bajo ~ 41Hz, up to ~1200Hz)
  private readonly MIN_FREQ = 40
  private readonly MAX_FREQ = 1300

  /**
   * Inicia la captura del micrófono y el loop de detección.
   * Pide permisos al usuario si es necesario.
   */
  async start(onNoteDetected: NoteDetectedCallback): Promise<void> {
    if (this.isRunning) return

    try {
      // 1. Pedir acceso al micrófono
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, // OFF: necesitamos el audio limpio del instrumento
          noiseSuppression: false,
          autoGainControl: false,
        }
      })

      // 2. Crear contexto de audio
      this.audioContext = new AudioContext()
      const sampleRate = this.audioContext.sampleRate

      // 3. Crear analizador FFT
      // Buffer de 2048 samples es buen balance entre latencia y precisión
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 2048

      // 4. Conectar micrófono → analyser
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.analyserNode)

      // 5. Inicializar detector de pitch de Pitchy
      // Usa el algoritmo McLeod Pitch Method (MPM), preciso para instrumentos
      this.detector = PitchDetector.forFloat32Array(this.analyserNode.fftSize)
      this.inputBuffer = new Float32Array(this.detector.inputLength)

      this.isRunning = true
      this.updateMicStatus(true)

      // 6. Iniciar loop de detección
      const detect = () => {
        if (!this.isRunning) return

        // Leer datos del micrófono en el buffer reutilizable
        this.analyserNode!.getFloatTimeDomainData(this.inputBuffer!)

        // Detectar pitch con Pitchy
        const [frequency, clarity] = this.detector!.findPitch(this.inputBuffer!, sampleRate)

        // Solo procesar si la nota es clara y está en rango útil
        if (
          clarity > this.CLARITY_THRESHOLD &&
          frequency >= this.MIN_FREQ &&
          frequency <= this.MAX_FREQ
        ) {
          onNoteDetected({
            frequency,
            clarity,
            note: frequencyToNote(frequency)
          })
        }

        // Continuar en el siguiente frame
        this.animFrameId = requestAnimationFrame(detect)
      }

      this.animFrameId = requestAnimationFrame(detect)
      console.log('🎤 PitchDetector iniciado — sampleRate:', sampleRate)

    } catch (err) {
      console.warn('🎤 No se pudo acceder al micrófono:', err)
      this.updateMicStatus(false)
    }
  }

  /** Detiene la captura de audio y libera recursos */
  stop(): void {
    this.isRunning = false

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }

    this.sourceNode?.disconnect()
    this.stream?.getTracks().forEach(track => track.stop())
    this.audioContext?.close()

    this.audioContext = null
    this.analyserNode = null
    this.sourceNode = null
    this.stream = null
    this.detector = null
    this.inputBuffer = null

    this.updateMicStatus(false)
    console.log('🎤 PitchDetector detenido')
  }

  /** Actualiza el badge visual de estado del micrófono en el HTML */
  private updateMicStatus(active: boolean): void {
    const badge = document.getElementById('mic-status')
    if (!badge) return
    if (active) {
      badge.classList.add('active')
      badge.innerHTML = '<span class="dot"></span>MIC ACTIVE — PITCH DETECT ON'
    } else {
      badge.classList.remove('active')
      badge.innerHTML = '<span class="dot"></span>MIC STANDBY'
    }
  }

  get running(): boolean {
    return this.isRunning
  }
}
