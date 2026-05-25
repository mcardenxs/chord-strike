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

/** Paleta de notas disponibles con sus propiedades visuales */
const NOTE_TYPES: NoteData[] = [
  { name: 'C',  color: 0x8fa89b, glow: '#5c7566', points: 100 }, // Verde Sabia
  { name: 'D',  color: 0xd69f96, glow: '#b57970', points: 150 }, // Terracota
  { name: 'E',  color: 0xe3c18f, glow: '#b89663', points: 120 }, // Ochre
  { name: 'F',  color: 0xb5a3c4, glow: '#8c779c', points: 130 }, // Lavanda
  { name: 'G',  color: 0x9cb0c2, glow: '#708699', points: 110 }, // Azul Pizarra
  { name: 'A',  color: 0xe0ad8a, glow: '#b8815a', points: 140 }, // Melocotón
  { name: 'B',  color: 0xdca6b5, glow: '#b57a8b', points: 160 }, // Rosa Palo
]

const OCTAVES = [2, 3, 4, 5]        // Octavas posibles (ej: C4, A3)
const NOTE_RADIUS = 28               // Radio del círculo base
const SPAWN_INTERVAL_MS = 1200       // Cada cuánto aparece una nota (ms)
const NOTE_FALL_SPEED_MIN = 60       // px/segundo mínimo
const NOTE_FALL_SPEED_MAX = 140      // px/segundo máximo
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

  // — Grupos de objetos —
  private notesGroup!: Phaser.GameObjects.Group

  // — UI Elements (texto) —
  private scoreText!: Phaser.GameObjects.Text
  private hpText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private gameOverContainer!: Phaser.GameObjects.Container

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

    // Leer el valor inicial del slider del DOM para el BPM
    const bpmSlider = document.getElementById('bpm-slider') as HTMLInputElement
    this.bpm = bpmSlider ? parseInt(bpmSlider.value, 10) : 60
    this.spawnIntervalMs = 60000 / this.bpm

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

    // ── Escuchar cambios de BPM ──
    this.game.events.on('bpm-changed', this.handleBpmChanged, this)

    // Apagar la escucha al reiniciar o cerrar la escena para evitar duplicación
    this.events.once('shutdown', () => {
      this.game.events.off('note-detected', this.handleNoteDetected, this)
      this.game.events.off('bpm-changed', this.handleBpmChanged, this)
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

  /** Fondo crema con pentagrama musical muy sutil */
  private createBackground(w: number, h: number): void {
    const bg = this.add.graphics()
    bg.fillStyle(0xf9f7f5, 1) // Fondo crema claro sólido
    bg.fillRect(0, 0, w, h)

    // Pentagrama musical muy tenue en el centro de la pantalla
    const staff = this.add.graphics()
    staff.lineStyle(1, 0xebe8e4, 1)
    const startY = h / 2 - 40
    for (let i = 0; i < 5; i++) {
      staff.lineBetween(40, startY + i * 20, w - 40, startY + i * 20)
    }
  }

  /** Línea de peligro sutil en la parte inferior */
  private createDangerLine(w: number, h: number): void {
    const dangerY = h - 50
    const line = this.add.graphics()

    // Línea delgada color arcilla suave
    line.lineStyle(1, 0xd69f96, 0.4)
    line.lineBetween(40, dangerY, w - 40, dangerY)

    // Texto "LÍMITE"
    this.add.text(w / 2, dangerY - 14, '— LÍMITE —', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '10px',
      color: 'rgba(181, 121, 112, 0.5)',
      letterSpacing: 2
    }).setOrigin(0.5)
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
    const panelStyle = {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '14px',
      color: '#4a4744',
      fontStyle: '600',
    }

    const labelStyle = {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '10px',
      color: 'rgba(74, 71, 68, 0.45)',
      letterSpacing: 1.5,
      fontStyle: '600',
    }

    // — Score —
    this.add.text(24, 16, 'PUNTOS', labelStyle)
    this.scoreText = this.add.text(24, 30, '000000', {
      ...panelStyle,
      fontSize: '22px',
    })

    // — HP —
    this.add.text(w / 2, 16, 'ESCUDO', labelStyle).setOrigin(0.5, 0)
    this.hpText = this.add.text(w / 2, 30, this.buildHpString(), {
      ...panelStyle,
      fontSize: '18px',
      color: '#d69f96', // Terracota suave
    }).setOrigin(0.5, 0)

    // — Combo —
    this.add.text(w - 24, 16, 'COMBO', labelStyle).setOrigin(1, 0)
    this.comboText = this.add.text(w - 24, 30, 'x1', {
      ...panelStyle,
      fontSize: '22px',
      color: '#b89663', // Ochre suave
    }).setOrigin(1, 0)
  }

  /** Construye el string de esferas para el HP */
  private buildHpString(): string {
    return '●'.repeat(this.hp) + '○'.repeat(MAX_HP - this.hp)
  }

  /** Crea una nota musical en una posición aleatoria X */
  private spawnNote(): void {
    const { width } = this.scale
    const margin = NOTE_RADIUS + 10

    // Elegir tipo de nota al azar
    const type = NOTE_TYPES[Phaser.Math.Between(0, NOTE_TYPES.length - 1)]
    const octave = OCTAVES[Phaser.Math.Between(0, OCTAVES.length - 1)]
    const fullName = `${type.name}${octave}`

    // Posición X aleatoria dentro del campo
    const x = Phaser.Math.Between(margin, width - margin)
    const y = -NOTE_RADIUS - 10  // Empieza fuera de pantalla

    // Velocidad aleatoria escalada por el BPM
    const speedMultiplier = this.bpm / 60
    const speed = Phaser.Math.FloatBetween(NOTE_FALL_SPEED_MIN, NOTE_FALL_SPEED_MAX) * speedMultiplier

    // — Gráfico del círculo —
    const circle = this.add.graphics()

    // Círculo principal relleno translúcido suave
    circle.fillStyle(type.color, 0.25)
    circle.fillCircle(0, 0, NOTE_RADIUS)

    // Borde elegante
    circle.lineStyle(1.5, type.color, 0.8)
    circle.strokeCircle(0, 0, NOTE_RADIUS)

    // — Texto de la nota —
    const label = this.add.text(0, -3, fullName, {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '13px',
      fontStyle: '600',
      color: '#4a4744',
      align: 'center',
    }).setOrigin(0.5)

    // — Nota musical Unicode decorativa —
    const symbol = this.add.text(0, 11, '♩', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '11px',
      color: '#706c68',
    }).setOrigin(0.5).setAlpha(0.35)

    // — Agrupar todo en un Container —
    const container = this.add.container(x, y, [circle, label, symbol])
    container.setSize(NOTE_RADIUS * 2, NOTE_RADIUS * 2)
    container.setInteractive()  // Hace el container clickeable

    // Guardar datos en el container
    container.setData('speed', speed)
    container.setData('type', type)
    container.setData('name', fullName)

    // Click directo en el container
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
      scale: { from: 1, to: 1.05 },
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
    ripple.lineStyle(1, 0x8c8680, 0.3) // Gris sutil para fondo claro
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

  /** Destruye una nota con efectos */
  private destroyNote(note: Phaser.GameObjects.Container): void {
    if (!note.active) return

    const type = note.getData('type') as NoteData

    // — Explosión de partículas —
    this.explodeNote(note.x, note.y, type.color)

    // — Flash de texto "+POINTS" —
    this.combo++
    const multiplier = Math.min(Math.floor(this.combo / 3) + 1, 5)
    const earned = type.points * multiplier

    this.score += earned
    this.updateScoreDisplay()

    // Texto flotante de puntos
    const floatText = this.add.text(note.x, note.y, `+${earned}`, {
      fontFamily: "'Outfit', sans-serif",
      fontSize: multiplier > 1 ? '18px' : '13px',
      fontStyle: '600',
      color: multiplier > 1 ? '#b89663' : type.glow,
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
    // Efecto de "miss" — flash terracota suave
    const flash = this.add.graphics()
    flash.fillStyle(0xd69f96, 0.15)
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
      color: '#b57970',
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

  /** Crea el overlay de Game Over (oculto al inicio) */
  private createGameOverScreen(w: number, h: number): void {
    // Fondo semitransparente color crema claro
    const overlay = this.add.graphics()
    overlay.fillStyle(0xf9f7f5, 0.88)
    overlay.fillRect(-w / 2, -h / 2, w, h)

    // Título
    const title = this.add.text(0, -60, 'Juego Terminado', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '36px',
      fontStyle: '600',
      color: '#4a4744',
    }).setOrigin(0.5)

    // Score final
    const scoreDisplay = this.add.text(0, -10, 'PUNTOS: 000000', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '18px',
      color: '#706c68',
    }).setOrigin(0.5)

    // Botón de reinicio (píldora minimalista)
    const btnBg = this.add.graphics()
    btnBg.fillStyle(0xebe8e4, 1)
    btnBg.fillRoundedRect(-80, 40, 160, 44, 22)

    const btnText = this.add.text(0, 62, 'JUGAR DE NUEVO', {
      fontFamily: "'Outfit', sans-serif",
      fontSize: '12px',
      fontStyle: '600',
      color: '#4a4744',
      letterSpacing: 1
    }).setOrigin(0.5)

    // Hacer el botón interactivo
    const hitArea = this.add.zone(-80, 40, 160, 44)
      .setOrigin(0)
      .setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      btnBg.clear()
      btnBg.fillStyle(0xdfdad4, 1) // Tono un poco más oscuro
      btnBg.fillRoundedRect(-80, 40, 160, 44, 22)
    })

    hitArea.on('pointerout', () => {
      btnBg.clear()
      btnBg.fillStyle(0xebe8e4, 1)
      btnBg.fillRoundedRect(-80, 40, 160, 44, 22)
    })

    hitArea.on('pointerdown', () => {
      // Reiniciar la escena
      this.scene.restart()
    })

    this.gameOverContainer = this.add.container(w / 2, h / 2, [
      overlay, title, scoreDisplay, btnBg, btnText, hitArea
    ])

    this.gameOverContainer.setVisible(false)
    this.gameOverContainer.setAlpha(0)
  }

  /** Maneja el evento de nota detectada por el micrófono */
  private handleNoteDetected(detectedNote: string): void {
    if (this.isGameOver) return

    // Obtener la nota base detectada (ej: "C4" -> "C", "F#3" -> "F#")
    const detectedBase = detectedNote.slice(0, -1)

    // Buscar todas las notas en pantalla que coincidan con la nota base
    const matchingNotes: Phaser.GameObjects.Container[] = []

    this.notesGroup.getChildren().forEach((obj) => {
      const note = obj as Phaser.GameObjects.Container
      const noteName = note.getData('name') as string // Ej: "C4"
      const noteBase = noteName.slice(0, -1) // Ej: "C"

      if (noteBase === detectedBase) {
        matchingNotes.push(note)
      }
    })

    // Si hay notas que coinciden, destruir la que esté más abajo (mayor coordenada y)
    if (matchingNotes.length > 0) {
      // Ordenar por coordenada y de mayor a menor (las más bajas primero)
      matchingNotes.sort((a, b) => b.y - a.y)
      const lowestNote = matchingNotes[0]
      
      // Destruir la nota
      this.destroyNote(lowestNote)
      console.log(`🎯 Nota ${lowestNote.getData('name')} destruida por tono de micrófono!`)
    }
  }

  /** Maneja el cambio de BPM desde la interfaz */
  private handleBpmChanged(newBpm: number): void {
    this.bpm = newBpm
    this.spawnIntervalMs = 60000 / newBpm
    console.log(`⏱️ Tempo actualizado en juego: ${newBpm} BPM | Intervalo: ${this.spawnIntervalMs.toFixed(0)}ms`)
  }
}
