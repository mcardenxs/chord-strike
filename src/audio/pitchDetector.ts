/**
 * pitchDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Módulo de captura de audio y detección de tono en tiempo real.
 * Usa Web Audio API + Pitchy para detectar qué nota está tocando
 * el usuario (guitarra, bajo, piano, voz, etc.)
 *
 * Mejoras sobre la versión anterior:
 *  - FFT de 4096 muestras para mejor resolución en notas graves
 *  - Umbral de claridad relajado (0.75) para instrumentos con
 *    armónicos ricos (guitarra, cuerdas, etc.)
 *  - Buffer de estabilidad: exige 2 frames consecutivos con la
 *    misma nota antes de emitirla (evita falsos en transitorios)
 *  - Tolerancia de desafinación: ±40 cents de snap al semitono
 *    más cercano (cubre notas ligeramente sharp/flat)
 *  - Debounce anti-flicker: no reemite la misma nota si pasaron
 *    menos de 150 ms desde la última emisión
 *  - Soporte de notación latina y americana intercambiable
 * ─────────────────────────────────────────────────────────────
 */

import { PitchDetector } from 'pitchy'

// ─── Nombres de notas en ambas notaciones ────────────────────

/** Notas en notación latina (Do, Re, Mi…) */
export const NOTE_NAMES_LATIN = [
  'Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa',
  'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si',
] as const

/** Notas en notación americana (C, D, E…) */
export const NOTE_NAMES_AMERICAN = [
  'C', 'C#', 'D', 'D#', 'E', 'F',
  'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const

/**
 * Convierte una frecuencia en Hz al nombre de nota musical
 * usando la notación activa (latina o americana).
 *
 * @param frequency - Frecuencia en Hz (ej: 440)
 * @returns Nombre de la nota con octava (ej: "La4" o "A4")
 */
function frequencyToNote(frequency: number): string {
  const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69)
  const names =
    PitchDetectorService.notation === 'latin'
      ? NOTE_NAMES_LATIN
      : NOTE_NAMES_AMERICAN
  const noteName = names[midiNote % 12]
  const octave = Math.floor(midiNote / 12) - 1
  return `${noteName}${octave}`
}

/** Resultado de la detección de pitch */
export interface PitchResult {
  /** Frecuencia detectada en Hz */
  frequency: number
  /** Confianza de la detección 0.0 – 1.0 */
  clarity: number
  /** Nombre de la nota con octava (ej: "La4", "Mi2") */
  note: string
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
 *
 * Para cambiar notación:
 *   PitchDetectorService.setNotation('american')
 * ─────────────────────────────────────────────────────────────
 */
export class PitchDetectorService {
  // ─── Notación configurable ───────────────────────────────

  /** Notación activa: 'latin' (Do, Re, Mi) o 'american' (C, D, E) */
  static notation: 'latin' | 'american' = 'latin'

  /**
   * Cambia la notación musical usada por el detector.
   * @param n - 'latin' para Do/Re/Mi, 'american' para C/D/E
   */
  static setNotation(n: 'latin' | 'american'): void {
    PitchDetectorService.notation = n
  }

  /**
   * Extrae la nota base (sin octava) de un nombre completo.
   * Útil para comparar notas independientemente de la octava.
   *
   * @param fullNote - Nota con octava (ej: "Do#4", "C3", "Sol#5")
   * @returns Nota sin octava (ej: "Do#", "C", "Sol#")
   */
  static noteBaseFromFull(fullNote: string): string {
    return fullNote.replace(/\d+$/, '')
  }

  // ─── Web Audio API ───────────────────────────────────────

  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null

  // ─── Pitchy ──────────────────────────────────────────────

  private detector: PitchDetector<Float32Array<ArrayBuffer>> | null = null
  private inputBuffer: Float32Array<ArrayBuffer> | null = null

  // ─── Loop de detección ───────────────────────────────────

  private animFrameId: number | null = null
  private isRunning = false

  // ─── Parámetros de detección ─────────────────────────────

  /** Umbral mínimo de claridad para aceptar una detección */
  private readonly CLARITY_THRESHOLD = 0.75
  /** Frecuencia mínima aceptable (~E1 de bajo) */
  private readonly MIN_FREQ = 40
  /** Frecuencia máxima aceptable */
  private readonly MAX_FREQ = 1300
  /** Máxima desviación en cents para snap al semitono */
  private readonly MAX_CENTS_DEVIATION = 40
  /** Frames consecutivos iguales requeridos para emitir */
  private readonly STABILITY_FRAMES = 2
  /** Tiempo mínimo entre emisiones de la misma nota (ms) */
  private readonly DEBOUNCE_MS = 150

  // ─── Estado del buffer de estabilidad ────────────────────

  /** Última nota cruda detectada (antes de emitir) */
  private lastRawNote: string | null = null
  /** Contador de frames consecutivos con la misma nota */
  private consecutiveCount = 0

  // ─── Estado del debounce anti-flicker ────────────────────

  /** Última nota efectivamente emitida al callback */
  private lastEmittedNote: string | null = null
  /** Timestamp de la última emisión */
  private lastEmitTime = 0

  /**
   * Inicia la captura del micrófono y el loop de detección.
   * Pide permisos al usuario si es necesario.
   *
   * @param onNoteDetected - Callback invocado con cada nota estable detectada
   */
  async start(onNoteDetected: NoteDetectedCallback): Promise<void> {
    if (this.isRunning) return

    try {
      // 1. Pedir acceso al micrófono con audio crudo
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,   // OFF: necesitamos el audio limpio del instrumento
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      // 2. Crear contexto de audio
      this.audioContext = new AudioContext()
      const sampleRate = this.audioContext.sampleRate

      // 3. Crear analizador FFT
      // Buffer de 4096 muestras: mejor resolución para notas graves (E1 ~41 Hz)
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = 4096

      // 4. Conectar micrófono → analyser
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.analyserNode)

      // 5. Inicializar detector de pitch de Pitchy
      // Usa el algoritmo McLeod Pitch Method (MPM), preciso para instrumentos
      this.detector = PitchDetector.forFloat32Array(this.analyserNode.fftSize)
      this.inputBuffer = new Float32Array(this.detector.inputLength)

      // Resetear estado interno
      this.lastRawNote = null
      this.consecutiveCount = 0
      this.lastEmittedNote = null
      this.lastEmitTime = 0

      this.isRunning = true
      this.updateMicStatus(true)

      // 6. Iniciar loop de detección
      const detect = () => {
        if (!this.isRunning) return

        // Leer datos del micrófono en el buffer reutilizable
        this.analyserNode!.getFloatTimeDomainData(this.inputBuffer!)

        // Detectar pitch con Pitchy
        const [frequency, clarity] = this.detector!.findPitch(this.inputBuffer!, sampleRate)

        // Solo procesar si la claridad y frecuencia están en rango
        if (
          clarity > this.CLARITY_THRESHOLD &&
          frequency >= this.MIN_FREQ &&
          frequency <= this.MAX_FREQ
        ) {
          // ── Detuning tolerance: snap a semitono si está dentro de ±40 cents ──
          const midiNote = Math.round(12 * Math.log2(frequency / 440) + 69)
          const idealHz = 440 * Math.pow(2, (midiNote - 69) / 12)
          const cents = 1200 * Math.log2(frequency / idealHz)

          if (Math.abs(cents) <= this.MAX_CENTS_DEVIATION) {
            const note = frequencyToNote(frequency)

            // ── Stability buffer: exigir 2 frames iguales ──
            if (note === this.lastRawNote) {
              this.consecutiveCount++
            } else {
              this.lastRawNote = note
              this.consecutiveCount = 1
            }

            if (this.consecutiveCount >= this.STABILITY_FRAMES) {
              // ── Debounce anti-flicker: no reemitir la misma nota en <150ms ──
              const now = performance.now()
              if (
                note !== this.lastEmittedNote ||
                now - this.lastEmitTime >= this.DEBOUNCE_MS
              ) {
                this.lastEmittedNote = note
                this.lastEmitTime = now
                onNoteDetected({ frequency, clarity, note })
              }
            }
          }
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

  /** Detiene la captura de audio y libera todos los recursos */
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

    // Resetear buffers de estabilidad y debounce
    this.lastRawNote = null
    this.consecutiveCount = 0
    this.lastEmittedNote = null
    this.lastEmitTime = 0

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

  /** Indica si el detector está corriendo actualmente */
  get running(): boolean {
    return this.isRunning
  }
}
