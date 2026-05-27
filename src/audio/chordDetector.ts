/**
 * chordDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Módulo de detección de acordes polifónicos en tiempo real.
 * Genera plantillas armónicas para más de 100 acordes de forma
 * programática y calcula el mejor match usando comparación de
 * similitud de croma robusta.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Etiquetas cromáticas ────────────────────────────────────

/** Etiquetas de las 12 clases de pitch en notación americana */
export const CHROMA_LABELS_EN = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

/** Etiquetas de las 12 clases de pitch en notación latina */
export const CHROMA_LABELS_ES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'] as const

// ─── Estructura de Plantillas de Acordes ─────────────────────

interface ChordTemplate {
  name: string      // Nombre del acorde (ej. "C", "Am7")
  pattern: number[] // Vector binario de 12 clases de tono (1 si la nota pertenece, 0 si no)
  noteCount: number // Cantidad de notas activas teóricas
}

// Patrones de intervalos musicales relativos al root
const CHORD_PATTERNS: { [suffix: string]: number[] } = {
  "": [0, 4, 7],       // Mayor (C)
  "m": [0, 3, 7],      // Menor (Cm)
  "7": [0, 4, 7, 10],   // 7 dominante (C7)
  "maj7": [0, 4, 7, 11], // 7 mayor (Cmaj7)
  "m7": [0, 3, 7, 10],  // 7 menor (Cm7)
  "dim": [0, 3, 6],     // Disminuido (Cdim)
  "aug": [0, 4, 8],     // Aumentado (Caug)
  "sus4": [0, 5, 7],    // Sus4 (Csus4)
  "sus2": [0, 2, 7]     // Sus2 (Csus2)
}

// Generar las 108 plantillas programáticamente (12 raíces * 9 patrones)
const CHORD_TEMPLATES: ChordTemplate[] = []

for (let r = 0; r < 12; r++) {
  const rootName = CHROMA_LABELS_EN[r]
  for (const [suffix, intervals] of Object.entries(CHORD_PATTERNS)) {
    const pattern = new Array(12).fill(0)
    for (const interval of intervals) {
      pattern[(r + interval) % 12] = 1
    }
    CHORD_TEMPLATES.push({
      name: `${rootName}${suffix}`,
      pattern,
      noteCount: intervals.length
    })
  }
}

// ─── Constantes del algoritmo ────────────────────────────────

const FFT_SIZE = 8192
const SMOOTHING = 0.8
const MIN_FREQ = 65    // C2 ≈ 65 Hz
const MAX_FREQ = 2000
const NOISE_FLOOR_DB = -60

/** Tamaño del historial de detecciones para suavizado temporal */
const HISTORY_SIZE = 8
/** Votos mínimos necesarios para emitir un acorde (de HISTORY_SIZE frames) */
const MIN_VOTES = 4

// ─── Mapa de traducción americano → latino ───────────────────

const EN_TO_LATIN: Record<string, string> = {
  C: 'Do',
  'C#': 'Do#',
  D: 'Re',
  'D#': 'Re#',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  G: 'Sol',
  'G#': 'Sol#',
  A: 'La',
  'A#': 'La#',
  B: 'Si',
}

const LATIN_TO_EN: Record<string, string> = {
  Do: 'C',
  'Do#': 'C#',
  Re: 'D',
  'Re#': 'D#',
  Mi: 'E',
  Fa: 'F',
  'Fa#': 'F#',
  Sol: 'G',
  'Sol#': 'G#',
  La: 'A',
  'La#': 'A#',
  Si: 'B',
}

/**
 * Traduce el nombre de un acorde entre notación americana y latina.
 */
export function translateChordName(chordName: string, toLatin: boolean): string {
  if (!chordName) return chordName

  if (toLatin) {
    const match = chordName.match(/^([A-G]#?)(.*)$/)
    if (!match) return chordName
    const [, root, suffix] = match
    const latinRoot = EN_TO_LATIN[root]
    if (!latinRoot) return chordName

    // Adaptar sufijo menor a formato tradicional si es necesario
    let formattedSuffix = suffix
    if (suffix === 'm' && (latinRoot === 'Re' || latinRoot === 'Mi' || latinRoot === 'La')) {
      return `${latinRoot}m` // Ej: Rem, Mim, Lam
    }

    return `${latinRoot}${formattedSuffix}`
  } else {
    // Latino → Americano: intentar coincidir con raíces latinas
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

export type ChordDetectedCallback = (chordName: string) => void

/**
 * Servicio de detección de acordes polifónicos en tiempo real.
 */
export class ChordDetectorService {
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private animFrameId: number | null = null
  private isRunning = false

  private detectionHistory: string[] = []
  private lastDetectedChord = ''

  /** Notación activa: 'latin' (Do, Re, Mi) o 'american' (C, D, E) */
  static notation: 'latin' | 'american' = 'latin'

  static setNotation(notation: 'latin' | 'american'): void {
    ChordDetectorService.notation = notation
  }

  async start(onChordDetected: ChordDetectedCallback): Promise<void> {
    if (this.isRunning) return

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        }
      })

      this.audioContext = new AudioContext()
      const sampleRate = this.audioContext.sampleRate

      this.analyserNode = this.audioContext.createAnalyser()
      this.analyserNode.fftSize = FFT_SIZE
      this.analyserNode.smoothingTimeConstant = SMOOTHING

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.analyserNode)

      const bufferLength = this.analyserNode.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)

      this.isRunning = true
      this.detectionHistory = []
      this.lastDetectedChord = ''

      const detect = (): void => {
        if (!this.isRunning) return

        this.analyserNode!.getFloatFrequencyData(dataArray)

        // ── Paso 1: Construir chromagram ──────────────────
        const chroma = new Float32Array(12)

        for (let k = 0; k < bufferLength; k++) {
          const frequency = (k * sampleRate) / this.analyserNode!.fftSize
          if (frequency < MIN_FREQ || frequency > MAX_FREQ) continue

          const db = dataArray[k]
          if (db < NOISE_FLOOR_DB) continue

          const amplitude = Math.pow(10, db / 20)

          const midiNote = 12 * Math.log2(frequency / 440) + 69
          const pitchClass = ((Math.round(midiNote) % 12) + 12) % 12

          chroma[pitchClass] += amplitude
        }

        // ── Paso 2: Normalizar y encontrar el mejor Match ──
        let chromaMax = 0
        for (let i = 0; i < 12; i++) {
          if (chroma[i] > chromaMax) chromaMax = chroma[i]
        }

        let detectedChord = ''

        if (chromaMax > 0.001) {
          // Normalizar el vector de croma
          for (let i = 0; i < 12; i++) {
            chroma[i] /= chromaMax
          }

          let bestChord = ''
          let bestScore = -Infinity

          for (const template of CHORD_TEMPLATES) {
            let matchSum = 0
            let nonMatchSum = 0

            for (let i = 0; i < 12; i++) {
              if (template.pattern[i] === 1) {
                matchSum += chroma[i]
              } else {
                nonMatchSum += chroma[i]
              }
            }

            // Calcular promedio de aciertos y penalización por notas extrañas
            const avgMatch = matchSum / template.noteCount
            const avgNonMatch = nonMatchSum / (12 - template.noteCount)
            const score = avgMatch - 0.6 * avgNonMatch

            // Requerir presencia mínima de notas del acorde en el espectro
            let activeNotesFound = 0
            for (let i = 0; i < 12; i++) {
              if (template.pattern[i] === 1 && chroma[i] > 0.20) {
                activeNotesFound++
              }
            }

            // Umbral de seguridad: requerir que la mayoría de las notas del acorde existan
            const minRequired = template.noteCount >= 4 ? 3 : 2

            if (activeNotesFound >= minRequired && score > bestScore) {
              bestScore = score
              bestChord = template.name
            }
          }

          // Solo aceptar la coincidencia si supera una confianza mínima razonable
          if (bestChord && bestScore > 0.20) {
            detectedChord = bestChord
          }
        }

        // ── Paso 3: Suavizado temporal por votación ─────
        this.detectionHistory.push(detectedChord)
        if (this.detectionHistory.length > HISTORY_SIZE) {
          this.detectionHistory.shift()
        }

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

        // Emitir si tiene suficientes votos
        if (dominantChord && maxCount >= MIN_VOTES) {
          const outputName = ChordDetectorService.notation === 'latin'
            ? translateChordName(dominantChord, true)
            : dominantChord

          if (outputName !== this.lastDetectedChord) {
            this.lastDetectedChord = outputName
            onChordDetected(outputName)
          }
        } else if (!dominantChord && this.lastDetectedChord !== '') {
          this.lastDetectedChord = ''
          onChordDetected('')
        }

        this.animFrameId = requestAnimationFrame(detect)
      }

      this.animFrameId = requestAnimationFrame(detect)
      console.log('🎵 ChordDetectorService (Template Matching) iniciado con éxito.')
    } catch (err) {
      console.warn('🎵 No se pudo iniciar ChordDetectorService:', err)
    }
  }

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

  get running(): boolean {
    return this.isRunning
  }
}
