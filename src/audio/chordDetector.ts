/**
 * chordDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Módulo de detección de acordes polifónicos en tiempo real.
 * Extrae un Chromagram de 12 bins de la señal de audio,
 * aplica supresión de armónicos, identifica las notas activas
 * y usa Tonal.js para reconocer el acorde resultante.
 * ─────────────────────────────────────────────────────────────
 */

import { Chord } from 'tonal'

// ─── Etiquetas cromáticas ────────────────────────────────────

/** Etiquetas de las 12 clases de pitch en notación americana */
export const CHROMA_LABELS_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Etiquetas de las 12 clases de pitch en notación latina */
export const CHROMA_LABELS_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const

// ─── Constantes del algoritmo ────────────────────────────────

/** Tamaño de la FFT — 8192 para buena resolución en graves */
const FFT_SIZE = 8192

/** Suavizado espectral del AnalyserNode */
const SMOOTHING = 0.8

/** Frecuencia mínima a considerar (C2 ≈ 65 Hz) */
const MIN_FREQ = 65

/** Frecuencia máxima a considerar */
const MAX_FREQ = 2000

/** Piso de ruido en dB — bins por debajo se ignoran */
const NOISE_FLOOR_DB = -60

/** Umbral adaptativo: energía normalizada mínima para considerar una nota activa */
const ACTIVE_NOTE_THRESHOLD = 0.30

/** Mínimo de notas activas para intentar detección de acorde */
const MIN_ACTIVE_NOTES = 2

/** Tamaño del historial de detecciones para suavizado temporal */
const HISTORY_SIZE = 8

/** Votos mínimos necesarios para emitir un acorde (de HISTORY_SIZE frames) */
const MIN_VOTES = 4

// ─── Mapa de traducción americano → latino ───────────────────

const EN_TO_LATIN: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
}

const LATIN_TO_EN: Record<string, string> = {
  Do: 'C',
  Re: 'D',
  Mi: 'E',
  Fa: 'F',
  Sol: 'G',
  La: 'A',
  Si: 'B',
}

// ─── Funciones de utilidad ───────────────────────────────────

/**
 * Traduce el nombre de un acorde entre notación americana y latina.
 * Solo traduce la raíz del acorde (ej. 'Am7' → 'Lam7', 'C#dim' → 'Do#dim').
 *
 * @param chordName - Nombre del acorde a traducir
 * @param toLatin   - Si es `true`, traduce de americano a latino; si es `false`, de latino a americano
 * @returns El nombre del acorde traducido
 */
export function translateChordName(chordName: string, toLatin: boolean): string {
  if (!chordName) return chordName

  if (toLatin) {
    // Americano → Latino: buscar la raíz (1 o 2 caracteres: letra + posible #/b)
    const match = chordName.match(/^([A-G])(#|b)?(.*)$/)
    if (!match) return chordName
    const [, root, accidental = '', suffix] = match
    const latinRoot = EN_TO_LATIN[root]
    if (!latinRoot) return chordName
    return `${latinRoot}${accidental}${suffix}`
  } else {
    // Latino → Americano: intentar coincidir con raíces latinas (ordenar por longitud descendente para 'Sol' antes de 'Si')
    const sortedRoots = Object.keys(LATIN_TO_EN).sort((a, b) => b.length - a.length)
    for (const latinRoot of sortedRoots) {
      if (chordName.startsWith(latinRoot)) {
        const rest = chordName.slice(latinRoot.length)
        const enRoot = LATIN_TO_EN[latinRoot]
        return `${enRoot}${rest}`
      }
    }
    return chordName
  }
}

// ─── Tipo del callback ───────────────────────────────────────

/** Callback invocado cuando se detecta (o desaparece) un acorde */
export type ChordDetectedCallback = (chordName: string) => void

// ─── Servicio de detección de acordes ────────────────────────

/**
 * Servicio de detección de acordes polifónicos en tiempo real.
 * Utiliza Web Audio API para capturar audio del micrófono,
 * construye un chromagram de 12 bins con supresión de armónicos,
 * y emplea Tonal.js para identificar el acorde a partir de las notas activas.
 */
export class ChordDetectorService {
  // ─── Estado de audio ─────────────────────────────────────
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private animFrameId: number | null = null
  private isRunning = false

  // ─── Suavizado temporal ──────────────────────────────────
  private detectionHistory: string[] = []
  private lastDetectedChord = ''

  // ─── Notación configurable ───────────────────────────────

  /** Notación activa: 'latin' (Do, Re, Mi) o 'american' (C, D, E) */
  static notation: 'latin' | 'american' = 'latin'

  /**
   * Configura la notación de salida para los nombres de acordes.
   * @param notation - 'latin' para Do/Re/Mi, 'american' para C/D/E
   */
  static setNotation(notation: 'latin' | 'american'): void {
    ChordDetectorService.notation = notation
  }

  // ─── Métodos públicos ────────────────────────────────────

  /**
   * Inicia la captura de audio y la detección de acordes en tiempo real.
   * Solicita acceso al micrófono y comienza un loop de análisis vía requestAnimationFrame.
   *
   * @param onChordDetected - Callback que recibe el nombre del acorde detectado
   *                          (o cadena vacía cuando desaparece)
   */
  async start(onChordDetected: ChordDetectedCallback): Promise<void> {
    if (this.isRunning) return

    try {
      // Solicitar acceso al micrófono sin procesamiento de navegador
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })

      this.audioContext = new AudioContext()
      const sampleRate = this.audioContext.sampleRate

      // Configurar el nodo analizador
      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = FFT_SIZE
      this.analyserNode.smoothingTimeConstant = SMOOTHING

      // Conectar micrófono → analizador
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.analyserNode)

      const bufferLength = this.analyserNode.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)

      this.isRunning = true

      /**
       * Loop principal de detección — se ejecuta en cada frame de animación.
       * 1. Extrae el espectro FFT
       * 2. Construye el chromagram de 12 bins
       * 3. Aplica supresión de armónicos
       * 4. Identifica notas activas
       * 5. Usa Tonal.js para detectar el acorde
       * 6. Aplica suavizado temporal por votación
       */
      const detect = (): void => {
        if (!this.isRunning) return

        // Obtener espectro en dB
        this.analyserNode!.getFloatFrequencyData(dataArray)

        // ── Paso 1: Construir chromagram ──────────────────
        const chroma = new Float32Array(12)

        for (let k = 0; k < bufferLength; k++) {
          const frequency = (k * sampleRate) / this.analyserNode!.fftSize

          // Filtrar por rango de frecuencias útiles
          if (frequency < MIN_FREQ || frequency > MAX_FREQ) continue

          const db = dataArray[k]
          if (db < NOISE_FLOOR_DB) continue

          // Convertir dB a amplitud lineal
          const amplitude = Math.pow(10, db / 20)

          // Calcular nota MIDI y clase de pitch [0..11]
          const midiNote = 12 * Math.log2(frequency / 440) + 69
          const pitchClass = ((Math.round(midiNote) % 12) + 12) % 12

          chroma[pitchClass] += amplitude
        }

        // ── Paso 2: Supresión de armónicos ────────────────
        // Encontrar la energía máxima del chromagram
        let chromaMax = 0
        for (let i = 0; i < 12; i++) {
          if (chroma[i] > chromaMax) chromaMax = chroma[i]
        }

        if (chromaMax > 0) {
          // Para cada pitch class prominente, atenuar sus armónicos
          const harmonicThreshold = chromaMax * 0.5

          for (let i = 0; i < 12; i++) {
            if (chroma[i] >= harmonicThreshold) {
              // 2do armónico: +12 semitonos → mismo pitch class (reducir 60%)
              // Se acumula en el mismo bin, así que restamos
              // En la práctica, el 2do armónico cae en (i + 0) % 12 = i
              const h2 = i  // octava, mismo pitch class
              chroma[h2] *= 0.4 // Mantener solo 40% (reducir 60%)

              // 3er armónico: +19 semitonos → +7 pitch classes
              const h3 = (i + 7) % 12
              chroma[h3] *= 0.3 // Mantener solo 30% (reducir 70%)

              // 4to armónico: +24 semitonos → mismo pitch class
              // Ya fue atenuado con h2, aplicar reducción adicional
              chroma[h2] *= 0.5 // Efecto acumulado: 40% × 50% = 20% (reducir 80% total)

              // 5to armónico: +28 semitonos → +4 pitch classes
              const h5 = (i + 4) % 12
              chroma[h5] *= 0.15 // Mantener solo 15% (reducir 85%)
            }
          }
        }

        // ── Paso 3: Normalizar y encontrar notas activas ──
        let normalizeMax = 0
        for (let i = 0; i < 12; i++) {
          if (chroma[i] > normalizeMax) normalizeMax = chroma[i]
        }

        if (normalizeMax > 0.001) {
          // Normalizar el vector de croma
          for (let i = 0; i < 12; i++) {
            chroma[i] /= normalizeMax
          }

          // Recoger notas activas (por encima del umbral)
          const activeNotes: string[] = []
          for (let i = 0; i < 12; i++) {
            if (chroma[i] > ACTIVE_NOTE_THRESHOLD) {
              activeNotes.push(CHROMA_LABELS_EN[i])
            }
          }

          // ── Paso 4: Detectar acorde con Tonal.js ────────
          let detectedChord = ''

          if (activeNotes.length >= MIN_ACTIVE_NOTES) {
            const candidates = Chord.detect(activeNotes)
            if (candidates.length > 0) {
              detectedChord = candidates[0]
            }
          }

          // ── Paso 5: Suavizado temporal por votación ─────
          this.detectionHistory.push(detectedChord)
          if (this.detectionHistory.length > HISTORY_SIZE) {
            this.detectionHistory.shift()
          }

          // Conteo de votos en el historial
          const counts: Record<string, number> = {}
          let maxCount = 0
          let dominantChord = ''

          for (const chord of this.detectionHistory) {
            if (!chord) continue
            counts[chord] = (counts[chord] || 0) + 1
            if (counts[chord] > maxCount) {
              maxCount = counts[chord]
              dominantChord = chord
            }
          }

          // Emitir si el acorde tiene suficientes votos y es diferente al anterior
          if (dominantChord && maxCount >= MIN_VOTES) {
            // Traducir a notación latina si corresponde
            const outputName = ChordDetectorService.notation === 'latin'
              ? translateChordName(dominantChord, true)
              : dominantChord

            if (outputName !== this.lastDetectedChord) {
              this.lastDetectedChord = outputName
              onChordDetected(outputName)
            }
          } else if (!dominantChord && this.lastDetectedChord !== '') {
            // El acorde desapareció (silencio o señal insuficiente)
            this.lastDetectedChord = ''
            onChordDetected('')
          }
        } else {
          // Señal demasiado débil — registrar frame vacío
          this.detectionHistory.push('')
          if (this.detectionHistory.length > HISTORY_SIZE) {
            this.detectionHistory.shift()
          }

          // Verificar si debemos emitir silencio
          const hasActiveChord = this.detectionHistory.some(c => c !== '')
          if (!hasActiveChord && this.lastDetectedChord !== '') {
            this.lastDetectedChord = ''
            onChordDetected('')
          }
        }

        this.animFrameId = requestAnimationFrame(detect)
      }

      this.animFrameId = requestAnimationFrame(detect)
      console.log('🎵 ChordDetectorService iniciado con éxito.')
    } catch (err) {
      console.warn('🎵 No se pudo iniciar el ChordDetectorService:', err)
    }
  }

  /**
   * Detiene la detección de acordes y libera todos los recursos de audio.
   */
  stop(): void {
    this.isRunning = false

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect()
      this.sourceNode = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop())
      this.stream = null
    }

    this.analyserNode = null
    this.detectionHistory = []
    this.lastDetectedChord = ''

    console.log('🎵 ChordDetectorService detenido.')
  }

  /** Indica si el servicio está capturando y analizando audio */
  get running(): boolean {
    return this.isRunning
  }
}
