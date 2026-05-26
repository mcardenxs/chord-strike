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
  { name: 'Do',  color: 0xff3b30, glow: '#ff3b30', points: 100 }, // Do (Rojo)
  { name: 'Re',  color: 0xff9500, glow: '#ff9500', points: 150 }, // Re (Naranja)
  { name: 'Mi',  color: 0xffcc00, glow: '#ffcc00', points: 120 }, // Mi (Amarillo)
  { name: 'Fa',  color: 0x4cd964, glow: '#4cd964', points: 130 }, // Fa (Verde)
  { name: 'Sol',  color: 0x5ac8fa, glow: '#5ac8fa', points: 110 }, // Sol (Cian)
  { name: 'La',  color: 0x007aff, glow: '#007aff', points: 140 }, // La (Azul)
  { name: 'Si',  color: 0xff2d55, glow: '#ff2d55', points: 160 }, // Si (Violeta/Rosa)
]

/** Datos de un acorde en el juego */
interface ChordData {
  name: string;        // Nombre del acorde (ej: "Am")
  notes: string[];     // Notas que componen el acorde (ej: ['A', 'C', 'E'])
  color: number;       // Color hex para el gráfico
  glow: string;        // Color CSS para texto/detalles
  points: number;      // Puntos al completarlo
}

/** Tipos de acordes diatónicos en la escala de Do Mayor con colores cromáticos coincidentes */
const CHORD_TYPES: ChordData[] = [
  { name: 'Do',   notes: ['Do', 'Mi', 'Sol'], color: 0xff3b30, glow: '#ff3b30', points: 300 }, // Do Mayor
  { name: 'Rem',  notes: ['Re', 'Fa', 'La'], color: 0xff9500, glow: '#ff9500', points: 350 }, // Re Menor
  { name: 'Mim',  notes: ['Mi', 'Sol', 'Si'], color: 0xffcc00, glow: '#ffcc00', points: 320 }, // Mi Menor
  { name: 'Fa',   notes: ['Fa', 'La', 'Do'], color: 0x4cd964, glow: '#4cd964', points: 340 }, // Fa Mayor
  { name: 'Sol',  notes: ['Sol', 'Si', 'Re'], color: 0x5ac8fa, glow: '#5ac8fa', points: 310 }, // Sol Mayor
  { name: 'Lam',  notes: ['La', 'Do', 'Mi'], color: 0x007aff, glow: '#007aff', points: 330 }, // La Menor
]

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
    this.scoreLabel = undefined as any
    this.scoreText = undefined as any
    this.hpLabel = undefined as any
    this.hpText = undefined as any
    this.comboLabel = undefined as any
    this.comboText = undefined as any
    this.gameOverContainer = undefined as any
    this.dangerText = undefined as any

    // Obtener tema inicial
    this.currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark'

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

    // ── Escuchar cambio de tamaño de pantalla ──
    this.scale.on('resize', this.handleResize, this)

    // Apagar la escucha al reiniciar o cerrar la escena para evitar duplicación
    this.events.once('shutdown', () => {
      this.game.events.off('note-detected', this.handleNoteDetected, this)
      this.game.events.off('chord-detected', this.handleChordDetected, this)
      this.game.events.off('bpm-changed', this.handleBpmChanged, this)
      this.game.events.off('metronome-toggled', this.handleMetronomeToggled, this)
      this.game.events.off('theme-changed', this.handleThemeChanged, this)
      this.scale.off('resize', this.handleResize, this)
    })

    console.log('🎮 GameScene lista — ¡a destruir notas!')
  }

  // ─────────────────────────────────────────
  // UPDATE: loop principal (llamado ~60fps)
  // ─────────────────────────────────────────
  update(_time: number, delta: number): void {
    if (this.isGameOver) return

    // — Spawn de notas por timer manual —
    this.spawnTimer += delta
    if (this.spawnTimer >= this.spawnIntervalMs) {
      this.spawnTimer = 0
      this.spawnNote()
    }

    // — Mover notas hacia abajo y revisar si llegaron al borde —
    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const speed = note.getData('speed') as number

      // Mover hacia abajo según velocidad y delta time
      note.y += speed * (delta / 1000)

      // Si pasó la línea de peligro → perder HP
      if (note.y >= this.scale.height - 20) {
        this.noteEscaped(note)
      }
    })
  }

  // ─────────────────────────────────────────
  // MÉTODOS PRIVADOS
  // ─────────────────────────────────────────

  /** Fondo oscuro/claro de piano roll con rejilla de carriles y pentagrama */
  private createBackground(w: number, h: number): void {
    if (!this.bgGraphics) {
      this.bgGraphics = this.add.graphics()
    }
    this.bgGraphics.clear()

    const isLight = this.currentTheme === 'light'
    const bgColor = isLight ? 0xf5f2eb : 0x08070d
    const gridColor = isLight ? 0x08070d : 0x1a1829
    const gridAlpha = isLight ? 0.05 : 0.4
    const staveColor = isLight ? 0xb0a896 : 0x4a3b63
    const staveAlpha = isLight ? 0.5 : 0.6

    // Fondo principal
    this.bgGraphics.fillStyle(bgColor, 1)
    this.bgGraphics.fillRect(0, 0, w, h)

    // Rejilla de piano roll sutil (líneas horizontales de tiempo)
    this.bgGraphics.lineStyle(1, gridColor, gridAlpha)
    for (let y = 0; y < h; y += 60) {
      this.bgGraphics.lineBetween(0, y, w, y)
    }

    // Líneas verticales de carriles
    this.lanes.forEach(laneX => {
      this.bgGraphics.lineBetween(laneX, 0, laneX, h)
    })

    // ── DIBUJAR PENTAGRAMA (5 líneas horizontales) ──
    // Se colocan en el centro vertical de la pantalla con un espaciado de 24px
    const centerY = h / 2
    this.bgGraphics.lineStyle(1.5, staveColor, staveAlpha)
    for (let i = -2; i <= 2; i++) {
      const staveY = centerY + i * 24
      this.bgGraphics.lineBetween(40, staveY, w - 40, staveY)
    }
  }

  /** Línea de peligro sutil en la parte inferior */
  private createDangerLine(w: number, h: number): void {
    const dangerY = h - 50
    if (!this.dangerLineGraphics) {
      this.dangerLineGraphics = this.add.graphics()
    }
    this.dangerLineGraphics.clear()

    // Línea de límite roja/rosa vibrante
    this.dangerLineGraphics.lineStyle(1.5, 0xff2d55, 0.6)
    this.dangerLineGraphics.lineBetween(40, dangerY, w - 40, dangerY)

    // Texto "LÍMITE"
    if (!this.dangerText) {
      this.dangerText = this.add.text(w / 2, dangerY - 14, '— LÍMITE —', {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '10px',
        color: 'rgba(255, 45, 85, 0.7)',
        letterSpacing: 2
      }).setOrigin(0.5)
    } else {
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

  /** UI superior: score, HP y combo */
  private createUI(w: number): void {
    const isLight = this.currentTheme === 'light'
    const textColor = isLight ? '#08070d' : '#ffffff'
    const labelColor = isLight ? 'rgba(8, 7, 13, 0.6)' : 'rgba(163, 158, 184, 0.7)'

    const panelStyle = {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '14px',
      color: textColor,
      fontStyle: '600',
    }

    const labelStyle = {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '10px',
      color: labelColor,
      letterSpacing: 1.5,
      fontStyle: '600',
    }

    // — Score —
    this.scoreLabel = this.add.text(24, 16, 'PUNTOS', labelStyle)
    this.scoreText = this.add.text(24, 30, '000000', {
      ...panelStyle,
      fontSize: '22px',
    })

    // — HP —
    this.hpLabel = this.add.text(w / 2, 16, 'ESCUDO', labelStyle).setOrigin(0.5, 0)
    this.hpText = this.add.text(w / 2, 30, this.buildHpString(), {
      ...panelStyle,
      fontSize: '18px',
      color: '#ff2d55', // Rosa/Rojo vibrante
    }).setOrigin(0.5, 0)

    // — Combo —
    this.comboLabel = this.add.text(w - 24, 16, 'COMBO', labelStyle).setOrigin(1, 0)
    this.comboText = this.add.text(w - 24, 30, 'x1', {
      ...panelStyle,
      fontSize: '22px',
      color: '#ffcc00', // Amarillo vibrante
    }).setOrigin(1, 0)
  }

  /** Construye el string de esferas para el HP */
  private buildHpString(): string {
    return '●'.repeat(this.hp) + '○'.repeat(MAX_HP - this.hp)
  }

  /** Crea una nota musical o un acorde en un carril vertical libre de superposiciones */
  private spawnNote(): void {
    // Decidir si se genera una nota simple (70%) o un acorde (30%)
    const spawnChord = Phaser.Math.Between(1, 100) <= 30

    // Velocidad uniforme escalada por el BPM
    const speedMultiplier = this.bpm / 60
    const speed = BASE_FALL_SPEED * speedMultiplier

    // Si el metrónomo está activo, reproducir click
    if (this.isMetronomeActive) {
      this.playMetronomeClick()
    }

    // ── Sistema de Prevención de Superposición por Carriles ──
    const availableLanes = LANES.filter(laneX => {
      // Un carril está libre si ninguna nota activa está en ese carril y arriba (y < 140)
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
      // Fallback: Elegir el carril cuya nota más alta esté más abajo en la pantalla (mayor coordenada Y)
      let bestLane = LANES[0]
      let maxTopY = -Infinity

      LANES.forEach(laneX => {
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
    const fillAlpha = isLight ? 0.65 : 0.35
    const labelColor = isLight ? '#08070d' : '#ffffff'
    const detailColor = isLight ? 'rgba(8, 7, 13, 0.8)' : 'rgba(255, 255, 255, 0.75)'
    const symbolColor = isLight ? 'rgba(8, 7, 13, 0.5)' : 'rgba(255, 255, 255, 0.5)'

    if (spawnChord) {
      // ──────────────────────────────────────────
      // SPAWN DE ACORDE (Do, Rem, Mim, Fa, Sol, Lam)
      // ──────────────────────────────────────────
      const chord = CHORD_TYPES[Phaser.Math.Between(0, CHORD_TYPES.length - 1)]

      // Círculo principal relleno translúcido más opaco para contraste
      circle.fillStyle(chord.color, fillAlpha)
      circle.fillCircle(0, 0, CHORD_RADIUS)

      // Doble borde elegante (estética musical para acordes)
      circle.lineStyle(2, chord.color, 0.9)
      circle.strokeCircle(0, 0, CHORD_RADIUS)
      circle.lineStyle(1.2, chord.color, 0.5)
      circle.strokeCircle(0, 0, CHORD_RADIUS - 4)

      // Texto del nombre del acorde (ej: "Lam")
      const label = this.add.text(0, -9, chord.name, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '14px',
        fontStyle: '700',
        color: labelColor,
        align: 'center',
      }).setOrigin(0.5)

      // Lista de notas requeridas (ej: "La  Do  Mi")
      const notesLabel = this.add.text(0, 10, chord.notes.join('  '), {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '10px',
        fontStyle: '600',
        color: detailColor,
        align: 'center',
      }).setOrigin(0.5)

      // Agrupar en contenedor
      container = this.add.container(x, y, [circle, label, notesLabel])
      container.setSize(CHORD_RADIUS * 2, CHORD_RADIUS * 2)
      container.setInteractive()

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

      // Círculo principal relleno translúcido más opaco para contraste
      circle.fillStyle(type.color, fillAlpha)
      circle.fillCircle(0, 0, NOTE_RADIUS)

      // Borde elegante
      circle.lineStyle(2, type.color, 0.9)
      circle.strokeCircle(0, 0, NOTE_RADIUS)

      // Texto de la nota
      const label = this.add.text(0, -3, fullName, {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '13px',
        fontStyle: '600',
        color: labelColor,
        align: 'center',
      }).setOrigin(0.5)

      // Nota musical Unicode decorativa
      const symbol = this.add.text(0, 11, '♩', {
        fontFamily: "'Outfit', sans-serif",
        fontSize: '11px',
        color: symbolColor,
      }).setOrigin(0.5).setAlpha(isLight ? 0.7 : 0.5)

      // Agrupar en contenedor
      container = this.add.container(x, y, [circle, label, symbol])
      container.setSize(NOTE_RADIUS * 2, NOTE_RADIUS * 2)
      container.setInteractive()

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
    ripple.lineStyle(1, 0xffffff, 0.4) // Blanco translúcido para fondo oscuro
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

    // — Explosión de partículas —
    this.explodeNote(note.x, note.y, color)

    // — Flash de texto "+POINTS" —
    this.combo++
    const multiplier = Math.min(Math.floor(this.combo / 3) + 1, 5)
    const earned = points * multiplier

    this.score += earned
    this.updateScoreDisplay()

    // Texto flotante de puntos
    const floatText = this.add.text(note.x, note.y, `+${earned}`, {
      fontFamily: "'Outfit', sans-serif",
      fontSize: multiplier > 1 ? '18px' : '13px',
      fontStyle: '600',
      color: multiplier > 1 ? '#b89663' : glow,
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
    // Efecto de "miss" — flash rojo/rosa vibrante
    const flash = this.add.graphics()
    flash.fillStyle(0xff2d55, 0.12)
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
    this.hpText.setText(this.buildHpString())

    // Nota de miss flotante
    const missText = this.add.text(note.x, this.scale.height - 70, 'MISS', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '15px',
      fontStyle: '600',
      color: '#ff2d55',
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

  /** Crea una explosión de partículas en la posición dada */
  private explodeNote(x: number, y: number, color: number): void {
    const numParticles = 12
    for (let i = 0; i < numParticles; i++) {
      const angle = (i / numParticles) * Math.PI * 2
      const speed = Phaser.Math.FloatBetween(60, 180)
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

    // Ring de expansión
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
      fontFamily: "'Outfit', sans-serif",
      fontSize: '14px',
      fontStyle: '700',
      color: '#b89663', // Ochre suave
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

    // Mostrar Game Over después de un breve delay
    this.time.delayedCall(500, () => {
      this.gameOverContainer.setVisible(true)
      this.tweens.add({
        targets: this.gameOverContainer,
        alpha: 1,
        duration: 600,
        ease: 'Quad.easeIn'
      })

      // Actualizar el score final en el overlay
      const scoreDisplay = this.gameOverContainer.getAt(2) as Phaser.GameObjects.Text
      if (scoreDisplay) {
        scoreDisplay.setText(`PUNTOS: ${this.score.toString().padStart(6, '0')}`)
      }
    })
  }

  /** Crea el overlay de Game Over (adaptable al tema claro/oscuro) */
  private createGameOverScreen(w: number, h: number): void {
    const isLight = this.currentTheme === 'light'
    const overlayColor = isLight ? 0xf5f2eb : 0x08070d
    const textColor = isLight ? '#08070d' : '#ffffff'
    const buttonBgColor = isLight ? 0xe5e0d8 : 0x1a1829
    const buttonHoverBgColor = isLight ? 0xd5cfc4 : 0x2d2b3e

    const wasVisible = this.gameOverContainer ? this.gameOverContainer.visible : false
    const oldAlpha = this.gameOverContainer ? this.gameOverContainer.alpha : 0

    if (this.gameOverContainer) {
      this.gameOverContainer.destroy()
    }

    // Fondo semitransparente
    const overlay = this.add.graphics()
    overlay.fillStyle(overlayColor, 0.95)
    overlay.fillRect(-w / 2, -h / 2, w, h)

    // Título en color de tema
    const title = this.add.text(0, -60, 'Juego Terminado', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '36px',
      fontStyle: '600',
      color: textColor,
    }).setOrigin(0.5)

    // Score final en color amarillo vibrante
    const scoreDisplay = this.add.text(0, -10, `PUNTOS: ${this.score.toString().padStart(6, '0')}`, {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '18px',
      color: '#ffcc00',
    }).setOrigin(0.5)

    // Botón de reinicio (píldora adaptable a tema)
    const btnBg = this.add.graphics()
    btnBg.fillStyle(buttonBgColor, 1)
    btnBg.fillRoundedRect(-80, 40, 160, 44, 22)

    const btnText = this.add.text(0, 62, 'JUGAR DE NUEVO', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '12px',
      fontStyle: '600',
      color: textColor,
      letterSpacing: 1
    }).setOrigin(0.5)

    // Hacer el botón interactivo
    const hitArea = this.add.zone(-80, 40, 160, 44)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      btnBg.clear()
      btnBg.fillStyle(buttonHoverBgColor, 1)
      btnBg.fillRoundedRect(-80, 40, 160, 44, 22)
    })

    hitArea.on('pointerout', () => {
      btnBg.clear()
      btnBg.fillStyle(buttonBgColor, 1)
      btnBg.fillRoundedRect(-80, 40, 160, 44, 22)
    })

    hitArea.on('pointerdown', () => {
      this.scene.restart()
    })

    this.gameOverContainer = this.add.container(w / 2, h / 2, [
      overlay, title, scoreDisplay, btnBg, btnText, hitArea
    ])

    this.gameOverContainer.setVisible(wasVisible)
    this.gameOverContainer.setAlpha(oldAlpha)
  }

  /** Actualiza dinámicamente los colores de los textos de la UI según el tema */
  private updateUIColors(): void {
    const isLight = this.currentTheme === 'light'
    const textColor = isLight ? '#08070d' : '#ffffff'
    const labelColor = isLight ? 'rgba(8, 7, 13, 0.6)' : 'rgba(163, 158, 184, 0.7)'

    if (this.scoreLabel) this.scoreLabel.setColor(labelColor)
    if (this.scoreText) this.scoreText.setColor(textColor)
    if (this.hpLabel) this.hpLabel.setColor(labelColor)
    if (this.comboLabel) this.comboLabel.setColor(labelColor)
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
      const textColor = isLight ? '#08070d' : '#ffffff'
      const subtextColor = isLight ? 'rgba(8, 7, 13, 0.8)' : 'rgba(255, 255, 255, 0.75)'
      const symbolColor = isLight ? 'rgba(8, 7, 13, 0.5)' : 'rgba(255, 255, 255, 0.5)'
      const fillAlpha = isLight ? 0.65 : 0.35

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
            child.fillStyle(chord.color, fillAlpha)
            child.fillCircle(0, 0, CHORD_RADIUS)
            child.lineStyle(2, chord.color, 0.9)
            child.strokeCircle(0, 0, CHORD_RADIUS)
            child.lineStyle(1.2, chord.color, 0.5)
            child.strokeCircle(0, 0, CHORD_RADIUS - 4)
          } else {
            const type = container.getData('type') as NoteData
            child.fillStyle(type.color, fillAlpha)
            child.fillCircle(0, 0, NOTE_RADIUS)
            child.lineStyle(2, type.color, 0.9)
            child.strokeCircle(0, 0, NOTE_RADIUS)
          }
        }
      })
    })
  }

  /** Maneja el evento de nota detectada por el micrófono */
  private handleNoteDetected(detectedNote: string): void {
    if (this.isGameOver) return

    // Obtener la nota base detectada (ej: "Do4" -> "Do", "Fa#3" -> "Fa#")
    const match = detectedNote.match(/^(Do|Re|Mi|Fa|Sol|La|Si)#?/)
    if (!match) return
    const detectedBase = match[0]

    // Buscar notas simples en pantalla que coincidan con la nota base
    const matchingNotes: Phaser.GameObjects.Container[] = []

    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteType = note.getData('noteType') as string

      if (noteType === 'single') {
        const noteName = note.getData('name') as string // Ej: "Do4"
        const matchName = noteName.match(/^(Do|Re|Mi|Fa|Sol|La|Si)#?/)
        const noteBase = matchName ? matchName[0] : ''
        if (noteBase === detectedBase) {
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

    // Buscar acordes activos en pantalla que coincidan con el acorde detectado
    const matchingChords: Phaser.GameObjects.Container[] = []

    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteType = note.getData('noteType') as string

      if (noteType === 'chord') {
        const chordName = note.getData('name') as string // Ej: "Am", "C"
        if (chordName === detectedChord) {
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

  /** Reproduce un sonido de click sintetizado proceduralmente con Web Audio */
  private playMetronomeClick(): void {
    const ctx = (this.sound as any).context as AudioContext
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.connect(gain)
    gain.connect(ctx.destination)

    const now = ctx.currentTime
    osc.frequency.setValueAtTime(800, now) // Tono corto agudo y limpio
    gain.gain.setValueAtTime(0.08, now) // volumen controlado
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

    osc.start(now)
    osc.stop(now + 0.05)
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

  /** Maneja el cambio de tamaño del canvas para recalcular carriles */
  private handleResize(gameSize: Phaser.Structs.Size): void {
    this.calculateLanes(gameSize.width)
  }
}
