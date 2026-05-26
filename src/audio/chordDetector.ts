/**
 * chordDetector.ts
 * ─────────────────────────────────────────────────────────────
 * Módulo de detección de acordes polifónicos en tiempo real.
 * Extrae el Chromagram de la señal de audio y lo compara con
 * plantillas de acordes diatónicos.
 * ─────────────────────────────────────────────────────────────
 */

// Plantillas binarias de los acordes: 1 significa que la nota debe estar presente, 0 que no.
const CHORD_TEMPLATES: { [key: string]: number[] } = {
  // Índices: Do=0, Do#=1, Re=2, Re#=3, Mi=4, Fa=5, Fa#=6, Sol=7, Sol#=8, La=9, La#=10, Si=11
  'Do':  [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0], // Do, Mi, Sol
  'Rem': [0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0], // Re, Fa, La
  'Mim': [0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1], // Mi, Sol, Si
  'Fa':  [1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0], // Fa, La, Do
  'Sol': [0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1], // Sol, Si, Re
  'Lam': [1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0], // La, Do, Mi
}

export type ChordDetectedCallback = (chordName: string) => void

export class ChordDetectorService {
  private audioContext: AudioContext | null = null
  private analyserNode: AnalyserNode | null = null
  private sourceNode: MediaStreamAudioSourceNode | null = null
  private stream: MediaStream | null = null
  private animFrameId: number | null = null
  private isRunning = false

  // Historial para suavizar la detección y evitar parpadeos
  private detectionHistory: string[] = []
  private readonly HISTORY_SIZE = 10
  private lastDetectedChord = ''

  // Rango de frecuencias de acordes (rango medio de piano / guitarra)
  private readonly MIN_FREQ = 70
  private readonly MAX_FREQ = 1000

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
      // fftSize de 4096 para tener buena resolución frecuencial en graves
      this.analyserNode.fftSize = 4096

      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream)
      this.sourceNode.connect(this.analyserNode)

      const bufferLength = this.analyserNode.frequencyBinCount
      const dataArray = new Float32Array(bufferLength)

      this.isRunning = true

      const detect = () => {
        if (!this.isRunning) return

        // Obtener espectro en decibelios
        this.analyserNode!.getFloatFrequencyData(dataArray)

        // 1. Inicializar vector de croma
        const chroma = new Float32Array(12)

        // 2. Acumular energía por pitch class
        for (let k = 0; k < bufferLength; k++) {
          const frequency = k * sampleRate / this.analyserNode!.fftSize
          
          if (frequency < this.MIN_FREQ || frequency > this.MAX_FREQ) continue

          const db = dataArray[k]
          if (db < -75) continue // Ignorar ruidos muy débiles

          // Convertir dB a amplitud lineal
          const amplitude = Math.pow(10, db / 20)

          // Calcular nota MIDI y su pitch class
          const midiNote = 12 * Math.log2(frequency / 440) + 69
          const pitchClass = Math.round(midiNote) % 12
          const index = (pitchClass + 12) % 12 // Asegurar índice [0..11]

          chroma[index] += amplitude
        }

        // 3. Normalizar croma
        let maxVal = 0
        for (let i = 0; i < 12; i++) {
          if (chroma[i] > maxVal) {
            maxVal = chroma[i]
          }
        }

        if (maxVal > 0.001) {
          for (let i = 0; i < 12; i++) {
            chroma[i] /= maxVal
          }

          // 4. Evaluar contra plantillas
          let bestChord = ''
          let bestScore = -Infinity

          for (const [chordName, template] of Object.entries(CHORD_TEMPLATES)) {
            let matchSum = 0
            let nonMatchSum = 0
            let notesInTemplate = 0

            for (let i = 0; i < 12; i++) {
              if (template[i] === 1) {
                matchSum += chroma[i]
                notesInTemplate++
              } else {
                nonMatchSum += chroma[i]
              }
            }

            const avgMatch = matchSum / notesInTemplate
            const avgNonMatch = nonMatchSum / (12 - notesInTemplate)
            const score = avgMatch - 0.75 * avgNonMatch // Penalizar notas fuera de la plantilla

            // Validar que las notas que componen el acorde tengan una energía mínima (ej. > 0.25)
            let hasAllNotes = true
            for (let i = 0; i < 12; i++) {
              if (template[i] === 1 && chroma[i] < 0.25) {
                hasAllNotes = false
                break
              }
            }

            if (hasAllNotes && score > bestScore) {
              bestScore = score
              bestChord = chordName
            }
          }

          // 5. Suavizado en el historial
          if (bestChord && bestScore > 0.25) {
            this.detectionHistory.push(bestChord)
          } else {
            this.detectionHistory.push('')
          }

          if (this.detectionHistory.length > this.HISTORY_SIZE) {
            this.detectionHistory.shift()
          }

          // Conteo de votos en el historial
          const counts: { [key: string]: number } = {}
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

          // Emitir si el acorde es consistente (al menos 50% de los frames activos)
          if (dominantChord && maxCount >= 5 && dominantChord !== this.lastDetectedChord) {
            this.lastDetectedChord = dominantChord
            onChordDetected(dominantChord)
          } else if (!dominantChord && this.lastDetectedChord !== '') {
            this.lastDetectedChord = ''
          }
        }

        this.animFrameId = requestAnimationFrame(detect)
      }

      this.animFrameId = requestAnimationFrame(detect)
      console.log('🎤 ChordDetectorService iniciado con éxito.')
    } catch (err) {
      console.warn('🎤 No se pudo iniciar el ChordDetectorService:', err)
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
    this.detectionHistory = []
    this.lastDetectedChord = ''
    console.log('🎤 ChordDetectorService detenido.')
  }

  get running(): boolean {
    return this.isRunning
  }
}
