/**
 * GameScene.ts
 * ─────────────────────────────────────────────────────────────
 * Escena principal de Chord Strike.
 *
 * Mecánica v1:
 *  - Notas musicales caen desde arriba con distintas velocidades
 *  - Cada nota tiene un nombre (C4, A3, E2…) y un color por tipo
 *  - Click sobre la nota → explosión de partículas + puntos
 *  - Si la nota llega abajo → pierde vida (HP)
 *  - Cuando HP llega a 0 → Game Over con opción de reiniciar
 * ─────────────────────────────────────────────────────────────
 */

import Phaser from 'phaser'

// ──────────────────────────────────────────────
// Theme colors (Nueva Paleta Oscura)
// ──────────────────────────────────────────────
const COLOR_BG = 0x0e0c14
const COLOR_BG2 = 0x16121f
const COLOR_BG3 = 0x1e1828
const COLOR_PURPLE = 0xa855f7
const COLOR_PURPLE_DIM = 0x7c3aed
const COLOR_PURPLE_PALE = 0x2d1f4a
const COLOR_GREEN = 0x22c55e
const COLOR_GREEN_DIM = 0x16a34a
const COLOR_GREEN_PALE = 0x0f2a1a
const COLOR_YELLOW = 0xfacc15
const COLOR_YELLOW_DIM = 0xca8a04
const COLOR_YELLOW_PALE = 0x2a2000
const COLOR_WHITE = 0xf5f0ff
const COLOR_MUTED = 0x6b5f8a
const COLOR_FAINT = 0x2a2040

// ──────────────────────────────────────────────
// Tipos y constantes
// ──────────────────────────────────────────────

/** Datos de una nota en el juego */
interface NoteData {
  name: string       // Nombre musical: C4, A3, E2…
  color: number      // Color hex para el gráfico
  glow: string       // Color CSS para efectos de glow (texto/sombra)
  points: number     // Puntos al destruirla
}

/** Paleta de notas disponibles con sus propiedades visuales (escala cromática vibrante) */
const NOTE_TYPES: NoteData[] = [
  { name: 'Do',  color: COLOR_PURPLE, glow: '#a855f7', points: 100 },
  { name: 'Re',  color: COLOR_GREEN, glow: '#22c55e', points: 150 },
  { name: 'Mi',  color: COLOR_YELLOW, glow: '#facc15', points: 120 },
  { name: 'Fa',  color: COLOR_PURPLE_DIM, glow: '#7c3aed', points: 130 },
  { name: 'Sol',  color: COLOR_GREEN_DIM, glow: '#16a34a', points: 110 },
  { name: 'La',  color: COLOR_YELLOW_DIM, glow: '#ca8a04', points: 140 },
  { name: 'Si',  color: COLOR_WHITE, glow: '#f5f0ff', points: 160 },
]

/** Datos de un acorde en el juego */
interface ChordData {
  name: string;        // Nombre del acorde (ej: "Am")
  notes: string[];     // Notas que componen el acorde (ej: ['A', 'C', 'E'])
  color: number;       // Color hex para el gráfico
  glow: string;        // Color CSS para texto/detalles
  points: number;      // Puntos al completarlo
}

/** Generador programático del set completo de 108 acordes */
const CHORD_TYPES: ChordData[] = []
const ROOT_NOTE_NAMES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
const CHORD_INTERVALS: { [suffix: string]: number[] } = {
  "": [0, 4, 7],         // Mayor
  "m": [0, 3, 7],        // Menor
  "7": [0, 4, 7, 10],     // 7 dominante
  "maj7": [0, 4, 7, 11],   // 7 mayor
  "m7": [0, 3, 7, 10],    // 7 menor
  "dim": [0, 3, 6],       // Disminuido
  "aug": [0, 4, 8],       // Aumentado
  "sus4": [0, 5, 7],      // Sus4
  "sus2": [0, 2, 7]       // Sus2
}

const ROOT_COLORS: { [note: string]: number } = {
  'Do': COLOR_PURPLE, 'Do#': COLOR_PURPLE_DIM, 'Re': COLOR_GREEN, 'Re#': COLOR_GREEN_DIM,
  'Mi': COLOR_YELLOW, 'Fa': COLOR_PURPLE, 'Fa#': COLOR_PURPLE_DIM, 'Sol': COLOR_GREEN,
  'Sol#': COLOR_GREEN_DIM, 'La': COLOR_YELLOW, 'La#': COLOR_WHITE, 'Si': COLOR_WHITE
}

for (let r = 0; r < 12; r++) {
  const root = ROOT_NOTE_NAMES[r]
  const color = ROOT_COLORS[root] || COLOR_PURPLE
  
  for (const [suffix, intervals] of Object.entries(CHORD_INTERVALS)) {
    const chordNotes = intervals.map(interval => ROOT_NOTE_NAMES[(r + interval) % 12])
    CHORD_TYPES.push({
      name: `${root}${suffix}`,
      notes: chordNotes,
      color: color,
      glow: `#${color.toString(16)}`,
      points: 300 + intervals.length * 50
    })
  }
}

const OCTAVES = [3, 4, 5]            // Octavas posibles
const NOTE_RADIUS = 28               // Radio del círculo base
const CHORD_RADIUS = 35              // Radio de la burbuja del acorde
const BASE_FALL_SPEED = 100          // Velocidad base uniforme (px/segundo)
const LANES = [100, 220, 340, 460, 580, 700] // Carriles verticales fijos
const MAX_HP = 5                     // Vidas del jugador

// ──────────────────────────────────────────────
// GameScene
// ──────────────────────────────────────────────

export default class GameScene extends Phaser.Scene {

  // — Estado del juego —
  private score: number = 0
  private hp: number = MAX_HP
  private isGameOver: boolean = false
  private combo: number = 0           // Hits consecutivos
  private spawnTimer: number = 0      // Acumulador de tiempo para spawn
  private bpm: number = 60            // Ritmo de Beats Per Minute
  private spawnIntervalMs: number = 1000 // Frecuencia de aparición de notas
  private isMetronomeActive: boolean = false // Si el click de metrónomo debe sonar
  private lanes: number[] = []        // Carriles calculados dinámicamente
  private currentTheme: string = 'dark' // Tema actual ('light' o 'dark')
  private currentNotation: 'latin' | 'american' = 'latin' // Cifrado actual
  
  // — Nuevos Estados de Modos y Estadísticas —
  private isPlaying: boolean = false
  private gameMode: 'arcade' | 'practice' = 'arcade'
  private notesSpawned: number = 0
  private notesHit: number = 0
  private maxComboReached: number = 0
  private metronomeAudioContext: AudioContext | null = null

  // — Grupos de objetos —
  private notesGroup!: Phaser.GameObjects.Group

  // — UI Elements (texto) —
  private scoreLabel!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private hpLabel!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private comboLabel!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private gameOverContainer!: Phaser.GameObjects.Container
  private dangerText!: Phaser.GameObjects.Text

  // — Gráficos —
  private bgGraphics!: Phaser.GameObjects.Graphics
  private dangerLineGraphics!: Phaser.GameObjects.Graphics
  private stringsGraphics!: Phaser.GameObjects.Graphics
  private hpGraphics!: Phaser.GameObjects.Graphics
  private laneVibrations: number[] = [0, 0, 0, 0, 0, 0]

  constructor() {
    super({ key: 'GameScene' })
  }

  // ─────────────────────────────────────────
  // PRELOAD: carga de assets (aquí generamos todo por código)
  // ─────────────────────────────────────────
  preload(): void {
    // No necesitamos assets externos — todo se genera con Graphics
    // En v2 aquí cargaríamos sprites de notas animadas
  }

  // ─────────────────────────────────────────
  // CREATE: inicializa la escena
  // ─────────────────────────────────────────
  create(): void {
    const { width, height } = this.scale

    // Resetear estado (por si es un reinicio)
    this.score = 0
    this.hp = MAX_HP
    this.isGameOver = false
    this.combo = 0
    this.spawnTimer = 0

    // Resetear referencias a objetos de Phaser que son destruidos al reiniciar la escena
    this.bgGraphics = undefined as any
    this.dangerLineGraphics = undefined as any
    this.stringsGraphics = undefined as any
    this.hpGraphics = undefined as any
    this.laneVibrations = [0, 0, 0, 0, 0, 0]
    this.scoreLabel = undefined as any
    this.scoreText = undefined as any
    this.hpLabel = undefined as any
    this.hpText = undefined as any
    this.comboLabel = undefined as any
    this.comboText = undefined as any
    this.gameOverContainer = undefined as any
    this.dangerText = undefined as any

    // Obtener tema y cifrado inicial
    this.currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark'
    this.currentNotation = (localStorage.getItem('notation') as 'latin' | 'american') || 'latin'

    // Calcular carriles dinámicamente según el ancho real disponible
    this.calculateLanes(width)

    // Leer el valor inicial del slider del DOM para el BPM
    const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement
    this.bpm = bpmSlider ? parseInt(bpmSlider.value, 10) : 60
    this.spawnIntervalMs = 60000 / this.bpm

    // Leer el estado inicial del metrónomo del DOM
    const metronomeToggle = document.getElementById('metronome-toggle') as HTMLButtonElement
    this.isMetronomeActive = metronomeToggle ? metronomeToggle.classList.contains('active') : false

    // ── Fondo con gradiente (Graphics) ──
    this.createBackground(width, height)

    // ── Hilos / Cuerdas de guitarra ──
    this.stringsGraphics = this.add.graphics()

    // ── Gráficos del HP (Escudos) ──
    this.hpGraphics = this.add.graphics()

    // ── Línea de peligro en la parte de abajo ──
    this.createDangerLine(width, height)

    // ── Grupo de notas ──
    this.notesGroup = this.add.group()

    // ── Textura de partícula (círculo pequeño blanco) ──
    this.createParticleTexture()

    // ── UI: score, HP, combo ──
    this.createUI(width)

    // ── Game Over overlay (oculto al inicio) ──
    this.createGameOverScreen(width, height)

    // ── Resumen de AudioContext para el metrónomo en cualquier click/toque de la ventana ──
    const resumeAudio = () => {
      const ctx = this.getMetronomeContext()
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      
      const phaserCtx = (this.sound as any).context as AudioContext
      if (phaserCtx && phaserCtx.state === 'suspended') {
        phaserCtx.resume().catch(() => {})
      }
    }
    window.addEventListener('click', resumeAudio)
    window.addEventListener('touchstart', resumeAudio)

    // ── Input: click en cualquier punto de la escena ──
    // El hit detection se hace en el update comparando posición
    this.input.on('pointerdown', this.handleClick, this)

    // ── Escuchar evento de tono detectado (micrófono) ──
    this.game.events.on('note-detected', this.handleNoteDetected, this)

    // ── Escuchar evento de acorde detectado (micrófono) ──
    this.game.events.on('chord-detected', this.handleChordDetected, this)

    // ── Escuchar cambios de BPM ──
    this.game.events.on('bpm-changed', this.handleBpmChanged, this)

    // ── Escuchar cambios del metrónomo ──
    this.game.events.on('metronome-toggled', this.handleMetronomeToggled, this)

    // ── Escuchar cambios de tema ──
    this.game.events.on('theme-changed', this.handleThemeChanged, this)

    // ── Escuchar cambios de cifrado (cuerda/notación) ──
    this.game.events.on('notation-changed', this.handleNotationChanged, this)

    // ── Escuchar inicio de partida ──
    this.game.events.on('game-start', this.handleGameStart, this)

    // ── Escuchar parada de partida ──
    this.game.events.on('game-stop', this.handleGameStop, this)

    // ── Escuchar cambio de tamaño de pantalla ──
    this.scale.on('resize', this.handleResize, this)

    // Apagar la escucha al reiniciar o cerrar la escena para evitar duplicación
    this.events.once('shutdown', () => {
      window.removeEventListener('click', resumeAudio)
      window.removeEventListener('touchstart', resumeAudio)
      
      this.game.events.off('game-stop', this.handleGameStop, this)
      this.game.events.off('note-detected', this.handleNoteDetected, this)
      this.game.events.off('chord-detected', this.handleChordDetected, this)
      this.game.events.off('bpm-changed', this.handleBpmChanged, this)
      this.game.events.off('metronome-toggled', this.handleMetronomeToggled, this)
      this.game.events.off('theme-changed', this.handleThemeChanged, this)
      this.game.events.off('notation-changed', this.handleNotationChanged, this)
      this.game.events.off('game-start', this.handleGameStart, this)
      this.scale.off('resize', this.handleResize, this)
    })

    console.log('🎮 GameScene lista — ¡a destruir notas!')
  }

  // ─────────────────────────────────────────
  // UPDATE: loop principal (llamado ~60fps)
  // ─────────────────────────────────────────
  update(_time: number, delta: number): void {
    if (!this.isPlaying || this.isGameOver) return

    // Si la pantalla es demasiado pequeña, esperar a que se redimensione
    if (this.scale.width <= 100 || this.scale.height <= 100) return

    // — Spawn de notas por timer manual —
    this.spawnTimer += delta
    if (this.spawnTimer >= this.spawnIntervalMs) {
      this.spawnTimer = 0
      this.spawnNote()
    }

    // Decay string vibrations
    for (let i = 0; i < this.laneVibrations.length; i++) {
      this.laneVibrations[i] *= 0.9
    }
    this.drawStrings()

    // — Mover notas hacia abajo y revisar si llegaron al borde —
    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const speed = note.getData('speed') as number
      const dangerY = this.scale.height - 50

      if (this.gameMode === 'practice' && note.y >= dangerY) {
        // En práctica libre, congelar la nota en la zona crítica esperando al usuario
        note.y = dangerY
      } else {
        // Mover hacia abajo
        note.y += speed * (delta / 1000)
      }

      // Si pasó la línea de peligro → miss
      if (note.y >= this.scale.height - 20) {
        this.noteEscaped(note)
      }
    })
  }

  // ─────────────────────────────────────────
  // MÉTODOS PRIVADOS
  // ─────────────────────────────────────────

  /** Dibuja los carriles como cuerdas de guitarra doradas vibrantes */
  private drawStrings(): void {
    if (!this.stringsGraphics) return
    this.stringsGraphics.clear()
    const stringColor = COLOR_MUTED
    const h = this.scale.height

    this.lanes.forEach((laneX, index) => {
      const amp = this.laneVibrations[index] || 0
      if (amp > 0.5) {
        // Onda senoidal para representar vibración
        this.stringsGraphics.lineStyle(1.5, stringColor, Math.min(0.8, 0.3 + (amp / 20)))
        this.stringsGraphics.beginPath()
        this.stringsGraphics.moveTo(laneX, 0)
        const steps = 30
        for (let y = 0; y <= h; y += h / steps) {
          const offsetX = Math.sin(y * 0.04 + this.time.now * 0.02) * amp
          this.stringsGraphics.lineTo(laneX + offsetX, y)
        }
        this.stringsGraphics.strokePath()
      } else {
        // Línea vertical recta sutil
        this.stringsGraphics.lineStyle(1, stringColor, 0.15)
        this.stringsGraphics.lineBetween(laneX, 0, laneX, h)
      }
    })
  }

  /** Fondo oscuro/claro de piano roll con rejilla de carriles y pentagrama */
  private createBackground(w: number, h: number): void {
    if (!this.bgGraphics) {
      this.bgGraphics = this.add.graphics()
    }
    this.bgGraphics.clear()

    const isLight = this.currentTheme === 'light'
    const bgColor = isLight ? 0xfaf8f5 : COLOR_BG
    const gridColor = isLight ? 0xe6ded3 : COLOR_FAINT
    const gridAlphaH = isLight ? 0.35 : 0.06
    const gridAlphaV = isLight ? 0.25 : 0.04
    const staveColor = isLight ? 0x8b7d9b : COLOR_MUTED
    const staveAlpha = isLight ? 0.5 : 0.35

    // Fondo principal sólido
    this.bgGraphics.fillStyle(bgColor, 1)
    this.bgGraphics.fillRect(0, 0, w, h)

    // Radial gradient overlay — subtle lighter center for depth
    const centerX = w / 2
    const centerY = h / 2
    const glowColor = 0x16121f // --bg2
    const glowAlpha = 0.25
    const numRings = 8
    const maxRadius = Math.max(w, h) * 0.5
    for (let i = numRings; i >= 1; i--) {
      const t = i / numRings
      const radius = maxRadius * t
      const alpha = glowAlpha * (1 - t) * 0.5
      this.bgGraphics.fillStyle(glowColor, alpha)
      this.bgGraphics.fillCircle(centerX, centerY, radius)
    }

    // Rejilla de piano roll sutil (líneas horizontales cada 50px)
    this.bgGraphics.lineStyle(1, gridColor, gridAlphaH)
    for (let y = 0; y < h; y += 50) {
      this.bgGraphics.lineBetween(0, y, w, y)
    }

    // Líneas verticales de carriles
    this.bgGraphics.lineStyle(1, gridColor, gridAlphaV)
    this.lanes.forEach(laneX => {
      this.bgGraphics.lineBetween(laneX, 0, laneX, h)
    })

    // ── DIBUJAR PENTAGRAMA (5 líneas horizontales) ──
    const staveCenterY = h / 2
    this.bgGraphics.lineStyle(1.5, staveColor, staveAlpha)
    for (let i = -2; i <= 2; i++) {
      const staveY = staveCenterY + i * 28
      this.bgGraphics.lineBetween(40, staveY, w - 40, staveY)
    }

    // Add treble clef symbol at the left edge of staff lines for musical flavor
    const existingClef = (this.bgGraphics as any)._clefText as Phaser.GameObjects.Text | undefined
    if (existingClef) {
      existingClef.destroy()
    }
    const clefColor = isLight ? 'rgba(147, 51, 234, 0.35)' : 'rgba(168, 85, 247, 0.25)' // --purple with transparency
    const clefText = this.add.text(18, staveCenterY, '𝄞', {
      fontFamily: 'serif',
      fontSize: '48px',
      color: clefColor,
    }).setOrigin(0.5)
    ;(this.bgGraphics as any)._clefText = clefText
  }

  /** Línea de peligro con gradient danger zone */
  private createDangerLine(w: number, h: number): void {
    const dangerY = h - 50
    if (!this.dangerLineGraphics) {
      this.dangerLineGraphics = this.add.graphics()
    }
    this.dangerLineGraphics.clear()

    const isLight = this.currentTheme === 'light'
    const dangerColor = isLight ? 0xca8a04 : COLOR_PURPLE // Use gold on light mode, purple on dark

    // Gradient danger zone: filled rectangle from dangerY to bottom
    const zoneHeight = h - dangerY
    const numBands = 10
    for (let i = 0; i < numBands; i++) {
      const t = i / numBands
      const bandY = dangerY + t * zoneHeight
      const bandH = zoneHeight / numBands + 1
      const alpha = t * 0.08 // transparent at top → 0.08 at bottom
      this.dangerLineGraphics.fillStyle(dangerColor, alpha)
      this.dangerLineGraphics.fillRect(0, bandY, w, bandH)
    }

    // Main danger line at dangerY
    this.dangerLineGraphics.lineStyle(1.5, dangerColor, 0.5)
    this.dangerLineGraphics.lineBetween(40, dangerY, w - 40, dangerY)

    // Second thinner line 2px below
    this.dangerLineGraphics.lineStyle(0.8, dangerColor, 0.2)
    this.dangerLineGraphics.lineBetween(40, dangerY + 2, w - 40, dangerY + 2)

    // Texto "ZONA CRÍTICA"
    const textColor = isLight ? 'rgba(120, 100, 90, 0.5)' : 'rgba(244, 240, 234, 0.4)'
    if (!this.dangerText) {
      this.dangerText = this.add.text(w / 2, dangerY - 14, 'ZONA CRÍTICA', {
        fontFamily: "'Sora', sans-serif",
        fontSize: '10px',
        color: textColor,
        letterSpacing: 2
      }).setOrigin(0.5)
    } else {
      this.dangerText.setText('ZONA CRÍTICA')
      this.dangerText.setColor(textColor)
      this.dangerText.setPosition(w / 2, dangerY - 14)
    }
  }

  /** Crea la textura de partícula como un pequeño círculo */
  private createParticleTexture(): void {
    const gfx = this.add.graphics()
    gfx.fillStyle(0xffffff, 1)
    gfx.fillCircle(4, 4, 4)
    gfx.generateTexture('particle', 8, 8)
    gfx.destroy()
  }

  /** UI superior: score, HP y combo — Digital HUD Style */
  private createUI(w: number): void {
    const textColor = '#f5f0ff' // --white
    const labelColor = '#6b5f8a' // --muted

    const panelStyle = {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '24px',
      color: textColor,
      fontStyle: '700',
    }

    const labelStyle = {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '9px',
      color: labelColor,
      letterSpacing: 2,
      fontStyle: '700',
    }

    // — Score —
    this.scoreLabel = this.add.text(24, 16, 'PUNTOS', labelStyle)
    this.scoreText = this.add.text(24, 30, '000000', {
      ...panelStyle,
      color: '#a855f7', // --purple
    })

    // — HP —
    this.hpLabel = this.add.text(w / 2, 16, 'ESCUDO', labelStyle).setOrigin(0.5, 0)
    this.hpText = this.add.text(w / 2, 30, '', {
      ...panelStyle,
      fontSize: '1px',
      color: '#22c55e',
    }).setOrigin(0.5, 0)
    this.hpText.setVisible(false) // Ocultar texto, usaremos gráficos

    // — Combo —
    this.comboLabel = this.add.text(w - 24, 16, 'COMBO', labelStyle).setOrigin(1, 0)
    this.comboText = this.add.text(w - 24, 30, 'x1', {
      ...panelStyle,
      fontSize: '22px',
      color: '#facc15', // --yellow
    }).setOrigin(1, 0)

    // Dibujar los escudos
    this.drawHp()
  }

  /** Dibuja los 5 escudos del HP como círculos rellenos (--green o --faint) */
  private drawHp(): void {
    if (!this.hpGraphics) return
    this.hpGraphics.clear()
    const isLight = this.currentTheme === 'light'
    const activeColor = isLight ? 0x16a34a : 0x22c55e  // --green
    const inactiveColor = isLight ? 0xe6ded3 : 0x2a2040 // --faint

    const startX = this.scale.width / 2 - (MAX_HP * 16) / 2 + 8
    const y = 42

    for (let i = 0; i < MAX_HP; i++) {
      const color = i < this.hp ? activeColor : inactiveColor
      this.hpGraphics.fillStyle(color, 1)
      this.hpGraphics.fillCircle(startX + i * 16, y, 5.5)
      
      // Borde sutil
      this.hpGraphics.lineStyle(1, i < this.hp ? 0x16a34a : 0x1e1828, 0.8)
      this.hpGraphics.strokeCircle(startX + i * 16, y, 5.5)
    }
  }

  /** Mantiene compatibilidad de cadena para HP */
  private buildHpString(): string {
    return ''
  }

  /** Crea una nota musical o un acorde en un carril vertical libre de superposiciones */
  private spawnNote(): void {
    // Incrementar métrica
    this.notesSpawned++

    // Decidir si se genera nota suelta o acorde según dificultad / modo
    let spawnChord = false
    const diff = this.game.registry.get('difficulty') || 'beginner'

    if (this.gameMode === 'practice') {
      const preselected = localStorage.getItem('practice_preselected_chord')
      if (preselected) {
        spawnChord = Phaser.Math.Between(1, 100) <= 80 // 80% chords when practicing a specific chord
      } else {
        spawnChord = Phaser.Math.Between(1, 100) <= 40 // 40% normally
      }
    } else {
      if (diff === 'beginner') {
        spawnChord = false
      } else if (diff === 'intermediate') {
        spawnChord = Phaser.Math.Between(1, 100) <= 30
      } else {
        spawnChord = Phaser.Math.Between(1, 100) <= 40
      }
    }

    // Velocidad uniforme escalada por el BPM
    const speedMultiplier = this.bpm / 60
    const speed = BASE_FALL_SPEED * speedMultiplier

    // Si el metrónomo está activo, reproducir click
    if (this.isMetronomeActive) {
      this.playMetronomeClick()
    }

    // ── Sistema de Prevención de Superposición por Carriles ──
    const activeLanes = this.lanes.length > 0 ? this.lanes : LANES
    const availableLanes = activeLanes.filter(laneX => {
      const isOccupied = this.notesGroup.getChildren().some(obj => {
        const note = obj as Phaser.GameObjects.Container
        return Math.abs(note.x - laneX) < 10 && note.y < 140
      })
      return !isOccupied
    })

    let x: number
    if (availableLanes.length > 0) {
      x = Phaser.Math.RND.pick(availableLanes)
    } else {
      let bestLane = activeLanes[0]
      let maxTopY = -Infinity

      activeLanes.forEach(laneX => {
        let topY = Infinity
        this.notesGroup.getChildren().forEach(obj => {
          const note = obj as Phaser.GameObjects.Container
          if (Math.abs(note.x - laneX) < 10 && note.y < topY) {
            topY = note.y
          }
        })
        if (topY > maxTopY) {
          maxTopY = topY
          bestLane = laneX
        }
      })
      x = bestLane
    }

    const y = -CHORD_RADIUS - 10
    let container: Phaser.GameObjects.Container
    const circle = this.add.graphics()

    const isLight = this.currentTheme === 'light'
    const fillAlpha = isLight ? 0.55 : 0.25
    const labelColor = isLight ? '#1a1a2e' : '#f5f0ff' // --white
    const detailColor = isLight ? 'rgba(26, 26, 46, 0.8)' : 'rgba(245, 240, 255, 0.7)'
    const symbolColor = isLight ? 'rgba(26, 26, 46, 0.5)' : 'rgba(245, 240, 255, 0.5)'

    if (spawnChord) {
      // Filtrar acordes por dificultad
      let chordPool = CHORD_TYPES
      const preselected = localStorage.getItem('practice_preselected_chord')
      if (this.gameMode === 'practice' && preselected) {
        const preSelLower = preselected.toLowerCase().replace(/\s+/g, '')
        chordPool = CHORD_TYPES.filter(c => {
          const latinName = c.name.toLowerCase().replace(/\s+/g, '')
          const amerName = this.translateChordName(c.name, 'american').toLowerCase().replace(/\s+/g, '')
          return latinName === preSelLower || amerName === preSelLower
        })
        if (chordPool.length === 0) {
          chordPool = CHORD_TYPES.filter(c => c.name.toLowerCase().includes(preSelLower) || 
                                             this.translateChordName(c.name, 'american').toLowerCase().includes(preSelLower))
        }
      } else if (diff === 'intermediate' && this.gameMode === 'arcade') {
        // Solo mayores y menores
        chordPool = CHORD_TYPES.filter(c => c.name.endsWith('m') ? c.name.match(/^[A-Za-z#]+m$/) : c.name.match(/^[A-Za-z#]+$/))
      } else if (diff === 'advanced' && this.gameMode === 'arcade') {
        // Excluir dim y aug
        chordPool = CHORD_TYPES.filter(c => !c.name.includes('dim') && !c.name.includes('aug'))
      }

      if (chordPool.length === 0) chordPool = CHORD_TYPES
      const chord = chordPool[Phaser.Math.Between(0, chordPool.length - 1)]

      // Outer glow ring
      circle.lineStyle(1, chord.color, 0.12)
      circle.strokeCircle(0, 0, CHORD_RADIUS + 3)
      // Fill
      circle.fillStyle(chord.color, fillAlpha)
      circle.fillCircle(0, 0, CHORD_RADIUS)
      // Outer border
      circle.lineStyle(2, chord.color, 0.9)
      circle.strokeCircle(0, 0, CHORD_RADIUS)
      // Inner ring
      circle.lineStyle(1.2, chord.color, 0.3)
      circle.strokeCircle(0, 0, CHORD_RADIUS - 8)

      // Texto del nombre del acorde (ej: "Lam" -> "Am")
      const chordNameText = this.translateChordName(chord.name, this.currentNotation)
      const label = this.add.text(0, -9, chordNameText, {
        fontFamily: "'Sora', sans-serif",
        fontSize: '14px',
        fontStyle: '700',
        color: labelColor,
        align: 'center',
      }).setOrigin(0.5)

      // Lista de notas requeridas (ej: "La  Do  Mi" -> "A  C  E")
      const notesText = chord.notes.map(n => this.translateNoteName(n, this.currentNotation)).join('  ')
      const notesLabel = this.add.text(0, 10, notesText, {
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '10px',
        fontStyle: '600',
        color: detailColor,
        align: 'center',
      }).setOrigin(0.5)

      // Agrupar en contenedor
      container = this.add.container(x, y, [circle, label, notesLabel])
      container.setSize(CHORD_RADIUS * 2, CHORD_RADIUS * 2)
      container.setInteractive(new Phaser.Geom.Circle(0, 0, CHORD_RADIUS), Phaser.Geom.Circle.Contains)

      // Guardar datos
      container.setData('speed', speed)
      container.setData('noteType', 'chord')
      container.setData('chordData', chord)
      container.setData('name', chord.name)
      container.setData('notes', [...chord.notes])
      container.setData('playedNotes', [])
      container.setData('notesTextObject', notesLabel)

    } else {
      // ──────────────────────────────────────────
      // SPAWN DE NOTA SIMPLE (Do4, Re3, etc.)
      // ──────────────────────────────────────────
      const type = NOTE_TYPES[Phaser.Math.Between(0, NOTE_TYPES.length - 1)]
      const octave = OCTAVES[Phaser.Math.Between(0, OCTAVES.length - 1)]
      const fullName = `${type.name}${octave}`
      const displayName = this.translateNoteName(fullName, this.currentNotation)

      // Outer glow ring
      circle.lineStyle(1, type.color, 0.12)
      circle.strokeCircle(0, 0, NOTE_RADIUS + 3)
      // Fill
      circle.fillStyle(type.color, fillAlpha)
      circle.fillCircle(0, 0, NOTE_RADIUS)
      // Outer border
      circle.lineStyle(2, type.color, 0.9)
      circle.strokeCircle(0, 0, NOTE_RADIUS)
      // Inner ring
      circle.lineStyle(1, type.color, 0.3)
      circle.strokeCircle(0, 0, NOTE_RADIUS - 6)

      // Texto de la nota
      const label = this.add.text(0, -3, displayName, {
        fontFamily: "'Sora', sans-serif",
        fontSize: '13px',
        fontStyle: '600',
        color: labelColor,
        align: 'center',
      }).setOrigin(0.5)

      // Nota musical Unicode decorativa
      const symbol = this.add.text(0, 11, '♩', {
        fontFamily: "'Sora', sans-serif",
        fontSize: '11px',
        color: symbolColor,
      }).setOrigin(0.5)

      // Agrupar en contenedor
      container = this.add.container(x, y, [circle, label, symbol])
      container.setSize(NOTE_RADIUS * 2, NOTE_RADIUS * 2)
      container.setInteractive(new Phaser.Geom.Circle(0, 0, NOTE_RADIUS), Phaser.Geom.Circle.Contains)

      // Guardar datos
      container.setData('speed', speed)
      container.setData('noteType', 'single')
      container.setData('type', type)
      container.setData('name', fullName)
    }

    // Click directo en el container para destruir (soporte manual)
    container.on('pointerdown', () => {
      this.destroyNote(container)
    })

    // Animación de entrada: scale desde 0 → 1
    container.setScale(0)
    this.tweens.add({
      targets: container,
      scale: 1,
      duration: 200,
      ease: 'Back.easeOut'
    })

    // Pulso continuo (scale leve) para hacer la nota "viva"
    this.tweens.add({
      targets: container,
      scale: { from: 1, to: 1.04 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200
    })

    this.notesGroup.add(container)
  }

  /** Maneja el click en la escena (fallback por si el container no lo captura) */
  private handleClick(pointer: Phaser.Input.Pointer): void {
    if (this.isGameOver) return
    // El click en cada nota ya está manejado con container.on('pointerdown')
    // Este handler sirve de respaldo y para efectos de cursor
    const ripple = this.add.graphics()
    const isLight = this.currentTheme === 'light'
    const rippleColor = isLight ? 0x1a1a2e : COLOR_GREEN
    const rippleAlpha = isLight ? 0.2 : 0.3
    ripple.lineStyle(1, rippleColor, rippleAlpha)
    ripple.strokeCircle(pointer.x, pointer.y, 8)
    this.tweens.add({
      targets: ripple,
      alpha: 0,
      scale: 2,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => ripple.destroy()
    })
  }

  /** Destruye una nota o acorde con efectos */
  private destroyNote(note: Phaser.GameObjects.Container): void {
    if (!note.active) return

    const noteType = note.getData('noteType') as string
    let color: number
    let points: number
    let glow: string

    if (noteType === 'chord') {
      const chord = note.getData('chordData') as ChordData
      color = chord.color
      points = chord.points
      glow = chord.glow
    } else {
      const type = note.getData('type') as NoteData
      color = type.color
      points = type.points
      glow = type.glow
    }

    // Activar vibración en la cuerda correspondiente
    const laneIndex = this.lanes.findIndex(laneX => Math.abs(laneX - note.x) < 15)
    if (laneIndex !== -1) {
      this.laneVibrations[laneIndex] = 18
    }

    // — Explosión de partículas —
    this.explodeNote(note.x, note.y, color)

    // — Flash de texto "+POINTS" —
    this.combo++
    this.notesHit++
    this.maxComboReached = Math.max(this.maxComboReached, this.combo)

    const multiplier = Math.min(Math.floor(this.combo / 3) + 1, 5)
    const earned = points * multiplier

    this.score += earned
    this.updateScoreDisplay()

    // Texto flotante de puntos
    const floatText = this.add.text(note.x, note.y, `+${earned}`, {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: multiplier > 1 ? '18px' : '13px',
      fontStyle: '700',
      color: multiplier > 1 ? '#facc15' : '#a855f7',
    }).setOrigin(0.5)

    this.tweens.add({
      targets: floatText,
      y: note.y - 60,
      alpha: 0,
      scale: 1.5,
      duration: 700,
      ease: 'Quad.easeOut',
      onComplete: () => floatText.destroy()
    })

    // Mensaje de combo
    if (this.combo > 1 && this.combo % 3 === 0) {
      this.showComboMessage(note.x, note.y - 30, this.combo)
    }

    this.comboText.setText(`x${multiplier}`)

    // Quitar la nota del grupo y destruirla
    this.notesGroup.remove(note, true, true)
  }

  /** Nota que llegó al fondo sin ser tocada */
  private noteEscaped(note: Phaser.GameObjects.Container): void {
    if (this.gameMode === 'practice') {
      this.notesGroup.remove(note, true, true)
      return
    }

    // Activar vibración en la cuerda correspondiente
    const laneIndex = this.lanes.findIndex(laneX => Math.abs(laneX - note.x) < 15)
    if (laneIndex !== -1) {
      this.laneVibrations[laneIndex] = 12
    }

    // Efecto de "miss" — flash morado
    const flash = this.add.graphics()
    flash.fillStyle(COLOR_PURPLE, 0.12)
    flash.fillRect(0, 0, this.scale.width, this.scale.height)
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 300,
      onComplete: () => flash.destroy()
    })

    // Shake de cámara
    this.cameras.main.shake(150, 0.005)

    // Resetear combo
    this.combo = 0
    this.comboText.setText('x1')

    // Restar HP
    this.hp--
    this.drawHp()

    // Nota de miss flotante
    const missText = this.add.text(note.x, this.scale.height - 70, 'MISS', {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '15px',
      fontStyle: '700',
      color: '#a855f7',
    }).setOrigin(0.5)

    this.tweens.add({
      targets: missText,
      y: this.scale.height - 130,
      alpha: 0,
      duration: 600,
      onComplete: () => missText.destroy()
    })

    this.notesGroup.remove(note, true, true)

    // Revisar Game Over
    if (this.hp <= 0) {
      this.triggerGameOver()
    }
  }

  /** Crea una explosión de partículas en la posición dada — enhanced */
  private explodeNote(x: number, y: number, color: number): void {
    const numParticles = 18
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2
      const speed = Phaser.Math.FloatBetween(80, 220)
      const dot = this.add.graphics()
      dot.fillStyle(color, 1)
      dot.fillCircle(0, 0, Phaser.Math.FloatBetween(2, 5))
      dot.x = x
      dot.y = y

      this.tweens.add({
        targets: dot,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0,
        duration: Phaser.Math.Between(300, 600),
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy()
      })
    }

    // Ring de expansión (first)
    const ring = this.add.graphics()
    ring.lineStyle(1.5, color, 0.6)
    ring.strokeCircle(x, y, NOTE_RADIUS)
    ring.x = 0
    ring.y = 0

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: { from: 1, to: 2.5 },
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    })

    // Second ring expansion — starts 100ms after the first, scales to 3.0
    const ring2 = this.add.graphics()
    ring2.lineStyle(1, color, 0.4)
    ring2.strokeCircle(x, y, NOTE_RADIUS)
    ring2.x = 0
    ring2.y = 0
    ring2.setAlpha(0)

    this.tweens.add({
      targets: ring2,
      alpha: { from: 0.4, to: 0 },
      scale: { from: 1, to: 3.0 },
      duration: 500,
      delay: 100,
      ease: 'Quad.easeOut',
      onComplete: () => ring2.destroy()
    })

    // Brief screen flash with the note's color
    const screenFlash = this.add.graphics()
    screenFlash.fillStyle(color, 0.04)
    screenFlash.fillRect(0, 0, this.scale.width, this.scale.height)
    this.tweens.add({
      targets: screenFlash,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeOut',
      onComplete: () => screenFlash.destroy()
    })
  }

  /** Actualiza el display de puntuación con padding de ceros */
  private updateScoreDisplay(): void {
    this.scoreText.setText(this.score.toString().padStart(6, '0'))
  }

  /** Muestra mensaje de combo */
  private showComboMessage(x: number, y: number, combo: number): void {
    const msgs = ['', '', '', '¡BIEN!', '¡EXCELENTE!', '¡ASOMBROSO!', '¡PERFECTO!', '¡INCREÍBLE!', '¡DIVINO!']
    const msg = msgs[Math.min(combo, msgs.length - 1)] || `${combo}x COMBO!`

    const t = this.add.text(x, y, msg, {
      fontFamily: "'Sora', sans-serif",
      fontSize: '14px',
      fontStyle: '700',
      color: '#ffc300', // Amber
    }).setOrigin(0.5)

    this.tweens.add({
      targets: t,
      y: y - 40,
      alpha: 0,
      scale: 1.3,
      duration: 800,
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy()
    })
  }

  /** Activa la pantalla de Game Over */
  private triggerGameOver(): void {
    this.isPlaying = false
    this.isGameOver = true

    // Detener las notas en pantalla (tween de fade out)
    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      this.tweens.add({
        targets: note,
        alpha: 0,
        scale: 0,
        duration: 400,
        ease: 'Back.easeIn'
      })
    })

    // Enviar estadísticas al hilo principal para mostrar el Game Over HTML
    const accuracy = Math.round((this.notesHit / Math.max(1, this.notesSpawned)) * 100)
    this.game.events.emit('game-over', {
      score: this.score,
      notesHit: this.notesHit,
      accuracy: accuracy,
      bestCombo: this.maxComboReached
    })
  }

  /** Crea el overlay de Game Over — Premium overlay (adaptable al tema claro/oscuro) */
  private createGameOverScreen(w: number, h: number): void {
    const isLight = this.currentTheme === 'light'
    const overlayColor = isLight ? COLOR_WHITE : COLOR_BG
    const textColor = isLight ? '#1a1a2e' : '#ffffff'
    const labelColor = isLight ? 'rgba(74, 85, 104, 0.6)' : 'rgba(0, 229, 255, 0.5)'
    const buttonBgColor = isLight ? COLOR_MUTED : COLOR_BG2
    const buttonHoverBgColor = isLight ? 0xd5cfc4 : 0x2d2b3e
    const buttonBorderColor = isLight ? COLOR_MUTED : COLOR_GREEN

    const wasVisible = this.gameOverContainer ? this.gameOverContainer.visible : false
    const oldAlpha = this.gameOverContainer ? this.gameOverContainer.alpha : 0

    if (this.gameOverContainer) {
      this.gameOverContainer.destroy()
    }

    // Fondo semitransparente
    const overlay = this.add.graphics()
    overlay.fillStyle(overlayColor, 0.95)
    overlay.fillRect(-w / 2, -h / 2, w, h)

    // Decorative musical symbol above title
    const musicSymbol = this.add.text(0, -110, '♪', {
      fontFamily: 'serif',
      fontSize: '36px',
      color: textColor,
    }).setOrigin(0.5).setAlpha(0.3)

    // Título — Premium
    const title = this.add.text(0, -60, 'Game Over', {
      fontFamily: "'Sora', sans-serif",
      fontSize: '42px',
      fontStyle: '700',
      color: textColor,
    }).setOrigin(0.5)

    // Subtitle
    const subtitle = this.add.text(0, -15, 'Tu sesión ha terminado', {
      fontFamily: "'Sora', sans-serif",
      fontSize: '14px',
      color: labelColor,
    }).setOrigin(0.5)

    // Score final — JetBrains Mono, amber
    const scoreDisplay = this.add.text(0, 15, `PUNTOS: ${this.score.toString().padStart(6, '0')}`, {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '20px',
      color: '#ffc300',
    }).setOrigin(0.5)

    // Botón de reinicio (píldora con borde)
    const btnBg = this.add.graphics()
    btnBg.fillStyle(buttonBgColor, 1)
    btnBg.fillRoundedRect(-80, 50, 160, 44, 22)
    // Border around button
    btnBg.lineStyle(1, buttonBorderColor, 0.3)
    btnBg.strokeRoundedRect(-80, 50, 160, 44, 22)

    const btnText = this.add.text(0, 72, 'NUEVA SESIÓN', {
      fontFamily: "'Sora', sans-serif",
      fontSize: '12px',
      fontStyle: '600',
      color: textColor,
      letterSpacing: 2
    }).setOrigin(0.5)

    // Hacer el botón interactivo
    const hitArea = this.add.zone(-80, 50, 160, 44)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      btnBg.clear()
      btnBg.fillStyle(buttonHoverBgColor, 1)
      btnBg.fillRoundedRect(-80, 50, 160, 44, 22)
      btnBg.lineStyle(1, buttonBorderColor, 0.5)
      btnBg.strokeRoundedRect(-80, 50, 160, 44, 22)
    })

    hitArea.on('pointerout', () => {
      btnBg.clear()
      btnBg.fillStyle(buttonBgColor, 1)
      btnBg.fillRoundedRect(-80, 50, 160, 44, 22)
      btnBg.lineStyle(1, buttonBorderColor, 0.3)
      btnBg.strokeRoundedRect(-80, 50, 160, 44, 22)
    })

    hitArea.on('pointerdown', () => {
      this.scene.restart()
    })

    this.gameOverContainer = this.add.container(w / 2, h / 2, [
      overlay, musicSymbol, title, subtitle, scoreDisplay, btnBg, btnText, hitArea
    ])

    this.gameOverContainer.setVisible(wasVisible)
    this.gameOverContainer.setAlpha(oldAlpha)
  }

  /** Actualiza dinámicamente los colores de los textos de la UI según el tema */
  private updateUIColors(): void {
    const isLight = this.currentTheme === 'light'
    const labelColor = isLight ? '#6b5f8a' : 'rgba(0, 229, 255, 0.5)'
    const scoreColor = isLight ? '#7c3aed' : '#a855f7'
    const comboColor = isLight ? '#ca8a04' : '#facc15'

    if (this.scoreLabel) this.scoreLabel.setColor(labelColor)
    if (this.scoreText) this.scoreText.setColor(scoreColor)
    if (this.hpLabel) this.hpLabel.setColor(labelColor)
    if (this.comboLabel) this.comboLabel.setColor(labelColor)
    if (this.comboText) this.comboText.setColor(comboColor)

    // Redibujar HP
    this.drawHp()
  }

  /** Maneja el cambio de tema en vivo */
  private handleThemeChanged(theme: string): void {
    this.currentTheme = theme
    const { width, height } = this.scale

    // Redibujar el fondo con la rejilla y el pentagrama
    this.createBackground(width, height)

    // Redibujar la línea de peligro
    this.createDangerLine(width, height)

    // Actualizar colores de los textos
    this.updateUIColors()

    // Recrear la pantalla de Game Over
    this.createGameOverScreen(width, height)

    // Actualizar todas las burbujas activas en la escena
    this.notesGroup.getChildren().forEach((obj) => {
      const container = obj as Phaser.GameObjects.Container
      const noteType = container.getData('noteType') as string
      const isLight = theme === 'light'
      const textColor = isLight ? '#1a1a2e' : '#ffffff'
      const subtextColor = isLight ? 'rgba(26, 26, 46, 0.8)' : 'rgba(255, 255, 255, 0.75)'
      const symbolColor = isLight ? 'rgba(26, 26, 46, 0.5)' : 'rgba(255, 255, 255, 0.5)'
      const fillAlpha = isLight ? 0.55 : 0.25

      container.list.forEach((child) => {
        if (child instanceof Phaser.GameObjects.Text) {
          if (child.y === -9 || child.y === -3) {
            child.setColor(textColor)
          } else if (child.y === 10) {
            child.setColor(subtextColor)
          } else if (child.y === 11) {
            child.setColor(symbolColor)
          }
        } else if (child instanceof Phaser.GameObjects.Graphics) {
          child.clear()
          if (noteType === 'chord') {
            const chord = container.getData('chordData') as ChordData
            // Outer glow ring
            child.lineStyle(1, chord.color, 0.12)
            child.strokeCircle(0, 0, CHORD_RADIUS + 3)
            // Fill
            child.fillStyle(chord.color, fillAlpha)
            child.fillCircle(0, 0, CHORD_RADIUS)
            // Outer border
            child.lineStyle(2, chord.color, 0.9)
            child.strokeCircle(0, 0, CHORD_RADIUS)
            // Inner ring
            child.lineStyle(1.2, chord.color, 0.3)
            child.strokeCircle(0, 0, CHORD_RADIUS - 8)
          } else {
            const type = container.getData('type') as NoteData
            // Outer glow ring
            child.lineStyle(1, type.color, 0.12)
            child.strokeCircle(0, 0, NOTE_RADIUS + 3)
            // Fill
            child.fillStyle(type.color, fillAlpha)
            child.fillCircle(0, 0, NOTE_RADIUS)
            // Outer border
            child.lineStyle(2, type.color, 0.9)
            child.strokeCircle(0, 0, NOTE_RADIUS)
            // Inner ring
            child.lineStyle(1, type.color, 0.3)
            child.strokeCircle(0, 0, NOTE_RADIUS - 6)
          }
        }
      })
    })
  }

  /** Maneja el evento de nota detectada por el micrófono */
  private handleNoteDetected(detectedNote: string): void {
    if (this.isGameOver) return

    // Obtener la nota base detectada (ej: "Do4" -> "Do", "C4" -> "C")
    const match = detectedNote.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)/)
    if (!match) return
    const detectedBase = match[0]
    const detectedBaseLatin = GameScene.AM_TO_LATIN_NOTES[detectedBase] || detectedBase

    // Buscar notas simples en pantalla que coincidan con la nota base
    const matchingNotes: Phaser.GameObjects.Container[] = []

    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteType = note.getData('noteType') as string

      if (noteType === 'single') {
        const noteName = note.getData('name') as string // Ej: "Do4"
        const matchName = noteName.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)/)
        const noteBase = matchName ? matchName[0] : ''
        const noteBaseLatin = GameScene.AM_TO_LATIN_NOTES[noteBase] || noteBase
        
        if (noteBaseLatin === detectedBaseLatin) {
          matchingNotes.push(note)
        }
      }
    })

    // Si hay notas que coinciden, destruir la que esté más abajo (mayor coordenada y)
    if (matchingNotes.length > 0) {
      // Ordenar por coordenada y de mayor a menor (las más bajas primero)
      matchingNotes.sort((a, b) => b.y - a.y)
      const lowestNote = matchingNotes[0]
      
      this.destroyNote(lowestNote)
      console.log(`🎯 Nota simple ${lowestNote.getData('name')} destruida por tono de micrófono!`)
    }
  }

  /** Maneja el evento de acorde detectado por el micrófono */
  private handleChordDetected(detectedChord: string): void {
    if (this.isGameOver) return

    const detectedChordLatin = this.normalizeChordToLatin(detectedChord)

    // Buscar acordes activos en pantalla que coincidan con el acorde detectado
    const matchingChords: Phaser.GameObjects.Container[] = []

    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteType = note.getData('noteType') as string

      if (noteType === 'chord') {
        const chordName = note.getData('name') as string // Ej: "Am", "C", "Lam"
        const chordNameLatin = this.normalizeChordToLatin(chordName)
        if (chordNameLatin === detectedChordLatin) {
          matchingChords.push(note)
        }
      }
    })

    // Si hay acordes que coinciden, destruir el que esté más abajo (mayor coordenada y)
    if (matchingChords.length > 0) {
      // Ordenar por coordenada y de mayor a menor (las más bajas primero)
      matchingChords.sort((a, b) => b.y - a.y)
      const lowestChord = matchingChords[0]

      this.destroyNote(lowestChord)
      console.log(`🎯 Acorde ${lowestChord.getData('name')} destruido por sonido de acorde completo!`)
    }
  }

  // ─────────────────────────────────────────
  // TRADUCCIÓN Y MAPEO DE NOTAS
  // ─────────────────────────────────────────
  private static readonly LATIN_TO_AM_NOTES: { [key: string]: string } = {
    'Do': 'C', 'Do#': 'C#', 'Re': 'D', 'Re#': 'D#', 'Mi': 'E', 'Fa': 'F',
    'Fa#': 'F#', 'Sol': 'G', 'Sol#': 'G#', 'La': 'A', 'La#': 'A#', 'Si': 'B'
  }
  
  private static readonly AM_TO_LATIN_NOTES: { [key: string]: string } = {
    'C': 'Do', 'C#': 'Do#', 'Db': 'Reb', 'D': 'Re', 'D#': 'Re#', 'Eb': 'Mib',
    'E': 'Mi', 'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Solb', 'G': 'Sol', 'G#': 'Sol#',
    'Ab': 'Lab', 'A': 'La', 'A#': 'La#', 'Bb': 'Sib', 'B': 'Si'
  }

  private translateNoteName(note: string, toNotation: 'latin' | 'american'): string {
    const match = note.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)(\d*)$/)
    if (!match) return note
    const name = match[1]
    const octave = match[2] || ''

    if (toNotation === 'american') {
      return (GameScene.LATIN_TO_AM_NOTES[name] || name) + octave
    } else {
      return (GameScene.AM_TO_LATIN_NOTES[name] || name) + octave
    }
  }

  private translateChordName(chord: string, toNotation: 'latin' | 'american'): string {
    const match = chord.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)(.*)$/)
    if (!match) return chord
    const root = match[1]
    const suffix = match[2] || ''

    let translatedRoot = root
    if (toNotation === 'american') {
      translatedRoot = GameScene.LATIN_TO_AM_NOTES[root] || root
    } else {
      translatedRoot = GameScene.AM_TO_LATIN_NOTES[root] || root
    }

    // Mapear Rem, Mim, Lam en español
    if (toNotation === 'latin') {
      if (translatedRoot === 'Re' && suffix === 'm') return 'Rem'
      if (translatedRoot === 'Mi' && suffix === 'm') return 'Mim'
      if (translatedRoot === 'La' && suffix === 'm') return 'Lam'
    } else {
      // En ingles es Dm, Em, Am
      if ((translatedRoot === 'D' || translatedRoot === 'E' || translatedRoot === 'A') && suffix === 'm') {
        return `${translatedRoot}m`
      }
    }

    return `${translatedRoot}${suffix}`
  }

  private normalizeChordToLatin(chord: string): string {
    if (!chord) return ''
    const match = chord.match(/^([A-G]#?|Bb|Db|Eb|Gb|Ab|Do#?|Re#?|Mi|Fa#?|Sol#?|La#?|Si)(.*)$/)
    if (!match) return chord
    const root = match[1]
    const suffix = match[2] || ''

    const latinRoot = GameScene.AM_TO_LATIN_NOTES[root] || root

    if (latinRoot === 'Re' && (suffix === 'm' || suffix === 'min')) return 'Rem'
    if (latinRoot === 'Mi' && (suffix === 'm' || suffix === 'min')) return 'Mim'
    if (latinRoot === 'La' && (suffix === 'm' || suffix === 'min')) return 'Lam'
    if (latinRoot === 'Do' && (suffix === 'm' || suffix === 'min')) return 'Dom'
    if (latinRoot === 'Sol' && (suffix === 'm' || suffix === 'min')) return 'Solm'
    if (latinRoot === 'Fa' && (suffix === 'm' || suffix === 'min')) return 'Fam'
    if (latinRoot === 'Si' && (suffix === 'm' || suffix === 'min')) return 'Sim'

    return `${latinRoot}${suffix}`
  }

  private handleNotationChanged(newNotation: 'latin' | 'american'): void {
    this.currentNotation = newNotation
    
    // Actualizar todas las notas y acordes que están cayendo en pantalla
    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteType = note.getData('noteType') as string

      if (noteType === 'single') {
        const fullName = note.getData('name') as string // Ej: "Do4"
        const displayName = this.translateNoteName(fullName, newNotation)
        const label = note.list[1] as Phaser.GameObjects.Text
        if (label) label.setText(displayName)
      } else if (noteType === 'chord') {
        const chordData = note.getData('chordData') as ChordData
        const translatedChordName = this.translateChordName(chordData.name, newNotation)
        const label = note.list[1] as Phaser.GameObjects.Text
        if (label) label.setText(translatedChordName)

        // Actualizar la lista de notas secundarias
        const notesList = chordData.notes.map(n => this.translateNoteName(n, newNotation))
        const notesLabel = note.list[2] as Phaser.GameObjects.Text
        if (notesLabel) notesLabel.setText(notesList.join('  '))
      }
    })
  }

  /** Maneja el cambio de BPM desde la interfaz */
  private handleBpmChanged(newBpm: number): void {
    this.bpm = newBpm
    this.spawnIntervalMs = 60000 / newBpm
    console.log(`⏱️ Tempo actualizado en juego: ${newBpm} BPM | Intervalo: ${this.spawnIntervalMs.toFixed(0)}ms`)
  }

  /** Maneja la alternancia del sonido del metrónomo */
  private handleMetronomeToggled(active: boolean): void {
    this.isMetronomeActive = active
    console.log(`🔊 Metrónomo ${active ? 'activado' : 'desactivado'}`)
  }

  /** Obtiene o inicializa de forma perezosa el AudioContext para el metrónomo */
  private getMetronomeContext(): AudioContext | null {
    if (!this.metronomeAudioContext) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
        this.metronomeAudioContext = new AudioContextClass()
      } catch (e) {
        console.error('Error al crear el AudioContext del metrónomo:', e)
      }
    }
    return this.metronomeAudioContext
  }

  /** Reproduce un sonido de click sintetizado proceduralmente con Web Audio */
  private playMetronomeClick(): void {
    const ctx = this.getMetronomeContext()
    if (!ctx) return

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    osc.frequency.setValueAtTime(1000, now) // Tono corto agudo y limpio
    gain.gain.setValueAtTime(0.18, now) // volumen controlado
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)

    osc.start(now)
    osc.stop(now + 0.08)

    // Emitir latido para la UI
    this.game.events.emit('metronome-beat')
  }

  /** Calcula la posición X de los carriles basándose en el ancho actual del canvas */
  private calculateLanes(w: number): void {
    const margin = 80
    const availableWidth = w - margin * 2
    const numLanes = 6
    const spacing = availableWidth / (numLanes - 1)

    this.lanes = []
    for (let i = 0; i < numLanes; i++) {
      this.lanes.push(margin + i * spacing)
    }
  }

  /** Maneja el cambio de tamaño del canvas para recalcular carriles y reposicionar elementos */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    const { width, height } = gameSize
    this.calculateLanes(width)
    
    // Redibujar gráficos responsivos
    this.createBackground(width, height)
    this.createDangerLine(width, height)
    
    // Reposicionar UI
    if (this.scoreLabel) {
      this.scoreLabel.setPosition(24, 16)
      this.scoreText.setPosition(24, 30)
      
      this.hpLabel.setPosition(width / 2, 16)
      this.hpText.setPosition(width / 2, 30)
      
      this.comboLabel.setPosition(width - 24, 16)
      this.comboText.setPosition(width - 24, 30)
    }

    // Reposicionar Game Over si está visible
    if (this.gameOverContainer) {
      this.gameOverContainer.setPosition(width / 2, height / 2)
      const overlay = this.gameOverContainer.list[0] as Phaser.GameObjects.Graphics
      if (overlay) {
        overlay.clear()
        const isLight = this.currentTheme === 'light'
        overlay.fillStyle(isLight ? 0xfaf8f3 : 0x0a0a12, 0.95)
        overlay.fillRect(-width / 2, -height / 2, width, height)
      }
    }
  }

  /** Maneja el evento de inicio de juego enviado desde el menú principal */
  private handleGameStart(config: { mode: 'arcade' | 'practice', difficulty: string }): void {
    this.isPlaying = true
    this.gameMode = config.mode
    
    // Configurar velocidad y spawn según dificultad
    if (config.mode === 'practice') {
      this.bpm = 50
    } else {
      if (config.difficulty === 'beginner') {
        this.bpm = 60
      } else if (config.difficulty === 'intermediate') {
        this.bpm = 100
      } else if (config.difficulty === 'advanced') {
        this.bpm = 150
      } else if (config.difficulty === 'master') {
        this.bpm = 200
      }
    }
    
    this.spawnIntervalMs = 60000 / this.bpm

    // Resetear contadores
    this.score = 0
    this.hp = MAX_HP
    this.combo = 0
    this.notesSpawned = 0
    this.notesHit = 0
    this.maxComboReached = 0
    this.isGameOver = false

    // Limpiar notas viejas
    this.notesGroup.clear(true, true)

    // Esconder contenedor de Game Over interno (por si existiera)
    if (this.gameOverContainer) {
      this.gameOverContainer.setVisible(false)
    }

    // Actualizar HUD
    this.updateScoreDisplay()
    this.drawHp()
    this.comboText.setText('x1')
    
    // Reanudar la escena si estaba pausada
    this.scene.resume()
    
    console.log(`🎮 Partida Iniciada: modo=${this.gameMode}, bpm=${this.bpm}`)
  }

  /** Maneja el evento de parada del juego */
  private handleGameStop(): void {
    this.isPlaying = false
    this.notesGroup.clear(true, true)
    this.scene.pause()
    console.log('🎮 Partida Finalizada/Detenida')
  }
}
