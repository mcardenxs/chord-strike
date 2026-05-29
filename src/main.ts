/**
 * main.ts
 * ─────────────────────────────────────────────────────────────
 * Entry point del juego.
 * Inicializa Phaser 3 con la configuración base, controla la
 * navegación entre pantallas HTML y la interactividad de los modos
 * (Arcade, Práctica Libre y Círculo de Acordes).
 * ─────────────────────────────────────────────────────────────
 */

import Phaser from 'phaser'
import GameScene from './scenes/GameScene'
import { PitchDetectorService } from './audio/pitchDetector'
import { ChordDetectorService, translateChordName } from './audio/chordDetector'

// ──────────────────────────────────────────
// Configuración de Phaser
// ──────────────────────────────────────────

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,           // Usa WebGL si está disponible, fallback a Canvas
  width: 800,
  height: 600,
  backgroundColor: '#0a0a12',
  parent: 'game-container',    // Monta el canvas dentro de este div del HTML
  scene: [GameScene],

  // Escala responsiva
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  // Sin gravedad — la manejamos manualmente en GameScene.update()
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  }
}

// Iniciar el juego
const game = new Phaser.Game(config)
console.log('🎸 Chord Strike arrancado —', game)

// ──────────────────────────────────────────
// Navegación de Pantallas (Router HTML)
// ──────────────────────────────────────────

// ──────────────────────────────────────────
// Navegación de Pantallas (Router HTML por Hash)
// ──────────────────────────────────────────

let lastSelectedMode: 'arcade' | 'practice' = (localStorage.getItem('selectedMode') as 'arcade' | 'practice') || 'arcade'
let lastSelectedDifficulty = localStorage.getItem('selectedDifficulty') || 'beginner'
let isPhaserReady = false

interface GameOverStats {
  score: number
  notesHit: number
  accuracy: number
  bestCombo: number
}

let lastGameOverStats: GameOverStats | null = null
try {
  const stored = localStorage.getItem('lastGameOverStats')
  if (stored) {
    lastGameOverStats = JSON.parse(stored)
  }
} catch (e) {
  console.error('Error al parsear estadísticas guardadas:', e)
}

function showScreen(screenId: string) {
  const screens = document.querySelectorAll('.screen')
  screens.forEach(s => {
    if (s.id === screenId) {
      s.classList.remove('hidden')
      void (s as HTMLElement).offsetWidth // Forzar reflow para animación
      s.classList.add('active')
    } else {
      s.classList.remove('active')
      s.classList.add('hidden')
    }
  })

  // Controlar pausa/resumen de Phaser según la pantalla activa
  const gameScene = game.scene.getScene('GameScene')
  if (gameScene) {
    if (screenId === 'game-view') {
      gameScene.scene.resume()
      
      const container = document.getElementById('game-container')
      if (container) {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          game.scale.resize(container.clientWidth, container.clientHeight)
        }
        setTimeout(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            game.scale.resize(container.clientWidth, container.clientHeight)
          }
        }, 150)
        setTimeout(() => {
          if (container.clientWidth > 0 && container.clientHeight > 0) {
            game.scale.resize(container.clientWidth, container.clientHeight)
          }
        }, 350)
      }
    } else {
      gameScene.scene.pause()
    }
  }

  // Restringir visibilidad del botón de pausa: Solo en modo Práctica Libre (practice)
  const gamePauseBtn = document.getElementById('game-pause-btn')
  if (gamePauseBtn) {
    if (lastSelectedMode === 'practice') {
      gamePauseBtn.style.display = 'inline-flex'
    } else {
      gamePauseBtn.style.display = 'none'
    }
    // Asegurar que el icono de pausa esté en su estado inicial
    gamePauseBtn.textContent = '⏸'
  }
}

// Iniciar sesión del juego en Phaser
function startGameSession() {
  game.events.emit('game-start', { mode: lastSelectedMode, difficulty: lastSelectedDifficulty })
  
  // Sincronizar el valor inicial del BPM en el footer del HUD
  let initialBpm = 60
  if (lastSelectedMode === 'practice') {
    initialBpm = 50
  } else {
    if (lastSelectedDifficulty === 'beginner') initialBpm = 60
    else if (lastSelectedDifficulty === 'intermediate') initialBpm = 100
    else if (lastSelectedDifficulty === 'advanced') initialBpm = 150
    else if (lastSelectedDifficulty === 'master') initialBpm = 200
  }
  
  const slider = document.getElementById('bpm-slider-horizontal') as HTMLInputElement
  const display = document.getElementById('bpm-val-display')
  if (slider) slider.value = initialBpm.toString()
  if (display) display.textContent = initialBpm.toString()
}

// Renderizar estadísticas de Game Over
function renderGameOverStats() {
  if (!lastGameOverStats) return
  
  const stats = lastGameOverStats
  const statNotes = document.getElementById('stat-notes')
  const statAccuracy = document.getElementById('stat-accuracy')
  const statCombo = document.getElementById('stat-combo')
  
  if (statNotes) statNotes.textContent = stats.notesHit.toString()
  if (statAccuracy) statAccuracy.textContent = `${stats.accuracy}%`
  if (statCombo) statCombo.textContent = stats.bestCombo.toString()
  
  const scoreStr = stats.score.toString().padStart(6, '0')
  const p1 = document.getElementById('go-score-p1')
  const p2 = document.getElementById('go-score-p2')
  const p3 = document.getElementById('go-score-p3')
  const rest = document.getElementById('go-score-rest')
  
  if (p1) p1.textContent = scoreStr[0]
  if (p2) p2.textContent = scoreStr[1]
  if (p3) p3.textContent = scoreStr[2]
  if (rest) rest.textContent = scoreStr.slice(3)
  
  // Guardar record de puntuación
  const currentRecord = parseInt(localStorage.getItem('highscore') || '0', 10)
  const recordBadge = document.getElementById('personal-record-badge')
  if (stats.score > currentRecord) {
    localStorage.setItem('highscore', stats.score.toString())
    if (recordBadge) recordBadge.classList.remove('hidden')
  } else {
    if (recordBadge) recordBadge.classList.add('hidden')
  }
}

// Función principal del enrutador
function handleRouting() {
  const hash = window.location.hash || '#start'
  
  // Detener el juego si navegamos fuera de la pantalla de juego
  if (hash !== '#play') {
    game.events.emit('game-stop')
  }

  let screenId = 'start-screen'
  if (hash === '#start') {
    screenId = 'start-screen'
  } else if (hash === '#mode') {
    screenId = 'mode-screen'
  } else if (hash === '#difficulty') {
    screenId = 'difficulty-screen'
  } else if (hash === '#chord-circle') {
    screenId = 'chord-circle-screen'
  } else if (hash === '#play') {
    screenId = 'game-view'
    if (isPhaserReady) {
      startGameSession()
    }
  } else if (hash === '#gameover') {
    screenId = 'game-over-screen'
  }

  showScreen(screenId)

  // Inicializar sub-pantallas si es necesario
  if (hash === '#chord-circle') {
    initChordCircleMode()
  } else if (hash === '#gameover') {
    renderGameOverStats()
  }
}

// Escuchar cambios de hash e inicialización
window.addEventListener('hashchange', handleRouting)

// Pausar Phaser al inicio una vez que esté listo, y activar enrutamiento
game.events.once('ready', () => {
  const gameScene = game.scene.getScene('GameScene')
  if (gameScene) {
    gameScene.scene.pause()
  }
  isPhaserReady = true
  handleRouting()
})

// Si no hay hash configurado al arrancar, poner #start por defecto
if (!window.location.hash) {
  window.location.hash = '#start'
} else {
  // Forzar enrutamiento inicial si ya existe un hash en recarga
  window.addEventListener('DOMContentLoaded', () => {
    handleRouting()
  })
}

// ── Botón Comenzar (Pantalla de Inicio) ──
const heroStartBtn = document.getElementById('hero-start-btn')
if (heroStartBtn) {
  heroStartBtn.addEventListener('click', () => {
    window.location.hash = '#mode'
  })
}

// ── Selección de Modos (Tarjetas) ──
const cardArcade = document.getElementById('card-arcade')
if (cardArcade) {
  cardArcade.addEventListener('click', () => {
    window.location.hash = '#difficulty'
  })
}

const cardCircle = document.getElementById('card-circle')
if (cardCircle) {
  cardCircle.addEventListener('click', () => {
    window.location.hash = '#chord-circle'
  })
}

const cardFree = document.getElementById('card-free')
if (cardFree) {
  cardFree.addEventListener('click', () => {
    lastSelectedMode = 'practice'
    localStorage.setItem('selectedMode', 'practice')
    window.location.hash = '#play'
  })
}

// ── Volver de Selección de Modos ──
const modeBackBtn = document.getElementById('mode-back-btn')
if (modeBackBtn) {
  modeBackBtn.addEventListener('click', () => {
    window.location.hash = '#start'
  })
}

// ── Selección de Dificultad (Arcade) ──
let activeDiff = localStorage.getItem('selectedDifficulty') || 'beginner'
const diffRows = document.querySelectorAll('.diff-row')

// Sincronizar UI de dificultad al arrancar
diffRows.forEach(row => {
  const d = row.getAttribute('data-diff')
  if (d === activeDiff) {
    row.classList.add('selected')
  } else {
    row.classList.remove('selected')
  }
  
  row.addEventListener('click', () => {
    diffRows.forEach(r => r.classList.remove('selected'))
    row.classList.add('selected')
    activeDiff = d || 'beginner'
    localStorage.setItem('selectedDifficulty', activeDiff)
  })
})

const diffBackBtn = document.getElementById('diff-back-btn')
if (diffBackBtn) {
  diffBackBtn.addEventListener('click', () => {
    window.location.hash = '#mode'
  })
}

const diffStartBtn = document.getElementById('diff-start-btn')
if (diffStartBtn) {
  diffStartBtn.addEventListener('click', () => {
    lastSelectedMode = 'arcade'
    lastSelectedDifficulty = activeDiff
    localStorage.setItem('selectedMode', 'arcade')
    localStorage.setItem('selectedDifficulty', activeDiff)
    window.location.hash = '#play'
  })
}

// ──────────────────────────────────────────
// Sincronización de Controles del Gameplay
// ──────────────────────────────────────────

// BPM Slider horizontal (Footer HUD)
const bpmSliderHorizontal = document.getElementById('bpm-slider-horizontal') as HTMLInputElement
const bpmValDisplay = document.getElementById('bpm-val-display')

if (bpmSliderHorizontal) {
  bpmSliderHorizontal.addEventListener('input', (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10)
    if (bpmValDisplay) bpmValDisplay.textContent = val.toString()
    game.events.emit('bpm-changed', val)
  })
}

// Metrónomo Toggle (Gameplay Footer)
const gameMetronomeToggle = document.getElementById('game-metronome-toggle') as HTMLButtonElement
let gameMetronomeActive = false
if (gameMetronomeToggle) {
  gameMetronomeToggle.addEventListener('click', () => {
    gameMetronomeActive = !gameMetronomeActive
    if (gameMetronomeActive) {
      gameMetronomeToggle.classList.add('active')
      gameMetronomeToggle.textContent = '🔊'
    } else {
      gameMetronomeToggle.classList.remove('active')
      gameMetronomeToggle.textContent = '🔇'
    }
    game.events.emit('metronome-toggled', gameMetronomeActive)
  })
}

// Metrónomo beat dot flash
game.events.on('metronome-beat', () => {
  const beatDot = document.getElementById('metronome-beat-dot')
  if (beatDot) {
    beatDot.classList.add('active')
    setTimeout(() => beatDot.classList.remove('active'), 150)
  }
})

// Pause Button (Gameplay HUD)
const gamePauseBtn = document.getElementById('game-pause-btn')
if (gamePauseBtn) {
  gamePauseBtn.addEventListener('click', () => {
    if (lastSelectedMode !== 'practice') return // Evitar pausa en otros modos que no sean práctica libre
    
    const gameScene = game.scene.getScene('GameScene')
    if (gameScene) {
      if (gameScene.scene.isPaused()) {
        gameScene.scene.resume()
        gamePauseBtn.textContent = '⏸'
      } else {
        gameScene.scene.pause()
        gamePauseBtn.textContent = '▶'
      }
    }
  })
}

// Back Button (Gameplay HUD)
const gameBackBtn = document.getElementById('game-back-btn')
if (gameBackBtn) {
  gameBackBtn.addEventListener('click', () => {
    if (lastSelectedMode === 'arcade') {
      window.location.hash = '#difficulty'
    } else {
      window.location.hash = '#mode'
    }
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia de Cifrado (Do/Re/Mi vs C/D/E)
// ──────────────────────────────────────────
const gameNotationToggle = document.getElementById('game-notation-toggle') as HTMLButtonElement
let currentNotation: 'latin' | 'american' = (localStorage.getItem('notation') as 'latin' | 'american') || 'latin'

function applyNotation(notation: 'latin' | 'american') {
  currentNotation = notation
  localStorage.setItem('notation', notation)
  
  PitchDetectorService.setNotation(notation)
  ChordDetectorService.setNotation(notation)
  
  if (gameNotationToggle) {
    gameNotationToggle.innerHTML = `CIFRADO: <span class="notation-active">${notation === 'latin' ? 'DO RE MI' : 'C D E'}</span>`
  }
  
  // También actualizar el selector de tonalidad del Círculo de Acordes si está activo
  updateKeyPills()
  
  game.events.emit('notation-changed', notation)
}

if (gameNotationToggle) {
  gameNotationToggle.addEventListener('click', () => {
    const nextNotation = currentNotation === 'latin' ? 'american' : 'latin'
    applyNotation(nextNotation)
    
    // Re-renderizar círculo de acordes con la nueva notación si la pantalla está visible
    const circleScreen = document.getElementById('chord-circle-screen')
    if (circleScreen && !circleScreen.classList.contains('hidden')) {
      const chords = generateDiatonicChords(chordCircleKey, currentNotation)
      renderCircleChords(chords)
      renderSequenceStrip(chords)
      updateCircleVisuals()
    }
  })
}

// ──────────────────────────────────────────
// Sincronizar alternancia de Modo Claro/Oscuro
// ──────────────────────────────────────────
const themeToggle = document.getElementById('theme-toggle') as HTMLButtonElement
const gameThemeToggle = document.getElementById('game-theme-toggle') as HTMLButtonElement
let currentTheme = localStorage.getItem('theme') || 'dark'

function applyTheme(theme: string) {
  currentTheme = theme
  localStorage.setItem('theme', theme)
  
  const updateToggleText = (el: HTMLButtonElement | null) => {
    if (el) {
      el.textContent = theme === 'light' ? '☀️' : '🌙'
      el.title = theme === 'light' ? 'Activar modo oscuro' : 'Activar modo claro'
    }
  }

  if (theme === 'light') {
    document.body.classList.add('light-theme')
  } else {
    document.body.classList.remove('light-theme')
  }
  
  updateToggleText(themeToggle)
  updateToggleText(gameThemeToggle)
  
  game.events.emit('theme-changed', theme)
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light'
    applyTheme(nextTheme)
  })
}

if (gameThemeToggle) {
  gameThemeToggle.addEventListener('click', () => {
    const nextTheme = document.body.classList.contains('light-theme') ? 'dark' : 'light'
    applyTheme(nextTheme)
  })
}

// Inicializar preferencias al arrancar
applyNotation(currentNotation)
applyTheme(currentTheme)

// ──────────────────────────────────────────
// Iniciar Detectores de Audio (Microphone)
// ──────────────────────────────────────────

const pitchDetector = new PitchDetectorService()
const chordDetector = new ChordDetectorService()

// Reanudar el AudioContext de Phaser ante cualquier interacción del usuario para que se escuche el metrónomo
function resumePhaserAudio() {
  if (game && game.sound && (game.sound as any).context) {
    const ctx = (game.sound as any).context as AudioContext
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().then(() => {
        console.log('🔊 Phaser AudioContext reanudado con éxito')
      }).catch((err: any) => {
        console.warn('⚠️ No se pudo reanudar el AudioContext de Phaser:', err)
      })
    }
  }
}
window.addEventListener('click', resumePhaserAudio)
window.addEventListener('touchstart', resumePhaserAudio)

window.addEventListener('click', async () => {
  const micStatus = document.getElementById('mic-status')
  if (micStatus) {
    micStatus.classList.add('active')
    micStatus.innerHTML = '<span class="dot"></span>MIC ESCUCHANDO'
  }

  if (!pitchDetector.running) {
    await pitchDetector.start((result) => {
      // Emitir el evento de nota detectada al juego de Phaser
      game.events.emit('note-detected', result.note)

      // ── Actualizar Afinador Horizontal HUD permanente ──
      const tunerBarNote = document.getElementById('tuner-bar-note')
      const tunerBarCents = document.getElementById('tuner-bar-cents')
      const tunerBarPin = document.getElementById('tuner-bar-pin')

      if (tunerBarNote) tunerBarNote.textContent = result.note
      
      const midiNote = Math.round(12 * Math.log2(result.frequency / 440) + 69)
      const idealHz = 440 * Math.pow(2, (midiNote - 69) / 12)
      const centsDeviation = Math.round(1200 * Math.log2(result.frequency / idealHz))
      
      if (tunerBarCents) {
        const sign = centsDeviation >= 0 ? '+' : ''
        tunerBarCents.textContent = `${sign}${centsDeviation}c`
        
        if (Math.abs(centsDeviation) <= 10) {
          tunerBarCents.style.color = 'var(--green)'
        } else {
          tunerBarCents.style.color = 'var(--yellow)'
        }
      }
      
      if (tunerBarPin) {
        const percentage = Math.max(0, Math.min(100, 50 + (centsDeviation / 50) * 50))
        tunerBarPin.style.left = `${percentage}%`
        
        if (Math.abs(centsDeviation) <= 10) {
          tunerBarPin.style.backgroundColor = 'var(--green)'
          tunerBarPin.style.boxShadow = '0 0 8px var(--green)'
        } else {
          tunerBarPin.style.backgroundColor = 'var(--yellow)'
          tunerBarPin.style.boxShadow = '0 0 8px var(--yellow)'
        }
      }
    })
  }

  if (!chordDetector.running) {
    await chordDetector.start((chordName) => {
      // Emitir acorde a Phaser
      game.events.emit('chord-detected', chordName)
      
      // Controlar el modo Círculo de Acordes si está activo y guiado
      if (guideActive && chordName) {
        handleChordCircleInput(chordName)
      }
    })
  }
}, { once: true })

// ──────────────────────────────────────────
// Lógica del Modo Círculo de Acordes
// ──────────────────────────────────────────

let chordCircleKey = 'Do'
let guideActive = false
let targetChordIndex = 0

const ES_TO_EN_KEY: Record<string, string> = { 'Do': 'C', 'Re': 'D', 'Mi': 'E', 'Fa': 'F', 'Sol': 'G', 'La': 'A', 'Si': 'B' }

const MAJOR_SCALE_INTERVALS = [0, 2, 4, 5, 7, 9, 11]
const CHORD_SUFFIXES = ['', 'm', 'm', '', '', 'm', 'dim']

function generateDiatonicChords(key: string, notation: 'latin' | 'american'): string[] {
  const latinRoots = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si']
  const englishRoots = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  
  let rootIdx = latinRoots.indexOf(key)
  if (rootIdx === -1) rootIdx = englishRoots.indexOf(key)
  if (rootIdx === -1) rootIdx = 0
  
  const chords: string[] = []
  for (let i = 0; i < 7; i++) {
    const noteIdx = (rootIdx + MAJOR_SCALE_INTERVALS[i]) % 12
    const noteName = notation === 'latin' ? latinRoots[noteIdx] : englishRoots[noteIdx]
    const suffix = CHORD_SUFFIXES[i]
    
    if (notation === 'latin' && suffix === 'm' && !noteName.endsWith('#')) {
      chords.push(`${noteName}m`)
    } else {
      chords.push(`${noteName}${suffix}`)
    }
  }
  return chords
}

function updateKeyPills() {
  const pills = document.querySelectorAll('.key-pill')
  pills.forEach(pill => {
    const key = pill.getAttribute('data-key') || 'Do'
    if (currentNotation === 'latin') {
      pill.textContent = key
    } else {
      pill.textContent = ES_TO_EN_KEY[key] || key
    }
  })
}

function initChordCircleMode() {
  updateKeyPills()
  guideActive = false
  targetChordIndex = 0
  
  const guideBtn = document.getElementById('circle-guide-btn')
  if (guideBtn) guideBtn.textContent = 'Iniciar Guía'
  
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  renderCircleChords(chords)
  renderSequenceStrip(chords)
  updateCircleVisuals()
}

function renderCircleChords(chords: string[]) {
  const container = document.getElementById('circle-viz-area')
  if (!container) return
  
  const oldNodes = container.querySelectorAll('.circle-degree-node')
  oldNodes.forEach(node => node.remove())
  
  const w = container.clientWidth || 320
  const h = container.clientHeight || 480
  const centerX = w / 2
  const centerY = h / 2
  const R = Math.min(w, h) * 0.35
  
  const romans = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII°']
  
  chords.forEach((chord, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7
    const x = centerX + R * Math.cos(angle)
    const y = centerY + R * Math.sin(angle)
    
    const nodeEl = document.createElement('div')
    nodeEl.className = 'circle-degree-node'
    nodeEl.id = `circle-node-${i}`
    nodeEl.style.left = `${x - 38}px`
    nodeEl.style.top = `${y - 38}px`
    
    nodeEl.innerHTML = `
      <span class="node-chord">${chord}</span>
      <span class="node-roman">${romans[i]}</span>
    `
    
    nodeEl.addEventListener('click', () => {
      if (guideActive) {
        targetChordIndex = i
        updateCircleVisuals()
      }
    })
    
    container.appendChild(nodeEl)
  })
  
  const svg = document.getElementById('circle-svg-lines')
  if (svg) {
    svg.innerHTML = ''
    chords.forEach((_, i) => {
      const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 7
      const x = centerX + R * Math.cos(angle)
      const y = centerY + R * Math.sin(angle)
      
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
      line.setAttribute('x1', centerX.toString())
      line.setAttribute('y1', centerY.toString())
      line.setAttribute('x2', x.toString())
      line.setAttribute('y2', y.toString())
      line.setAttribute('stroke', 'var(--faint)')
      line.setAttribute('stroke-width', '2')
      line.setAttribute('stroke-dasharray', '4,4')
      line.id = `circle-line-${i}`
      svg.appendChild(line)
    })
  }
}

function renderSequenceStrip(chords: string[]) {
  const strip = document.getElementById('circle-sequence-strip')
  if (!strip) return
  strip.innerHTML = ''
  
  chords.forEach((chord, i) => {
    const item = document.createElement('div')
    item.className = 'seq-item'
    item.id = `circle-seq-${i}`
    item.textContent = chord
    strip.appendChild(item)
  })
}

function updateCircleVisuals() {
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  
  chords.forEach((_, i) => {
    const nodeEl = document.getElementById(`circle-node-${i}`)
    const seqEl = document.getElementById(`circle-seq-${i}`)
    const lineEl = document.getElementById(`circle-line-${i}`)
    
    if (nodeEl) {
      nodeEl.classList.remove('pendiente', 'tocado', 'actual', 'tonica', 'dominante')
      if (guideActive) {
        if (i < targetChordIndex) {
          nodeEl.classList.add('tocado')
        } else if (i === targetChordIndex) {
          nodeEl.classList.add('actual')
        } else {
          nodeEl.classList.add('pendiente')
        }
      } else {
        if (i === 0) nodeEl.classList.add('tonica')
        else if (i === 4) nodeEl.classList.add('dominante')
        else nodeEl.classList.add('pendiente')
      }
    }
    
    if (seqEl) {
      seqEl.className = 'seq-item'
      if (guideActive) {
        if (i < targetChordIndex) {
          seqEl.classList.add('completed')
        } else if (i === targetChordIndex) {
          seqEl.classList.add('current')
        }
      }
    }
    
    if (lineEl) {
      if (guideActive) {
        if (i < targetChordIndex) {
          lineEl.setAttribute('stroke', 'var(--green)')
          lineEl.setAttribute('stroke-width', '3')
        } else if (i === targetChordIndex) {
          lineEl.setAttribute('stroke', 'var(--white)')
          lineEl.setAttribute('stroke-width', '2')
        } else {
          lineEl.setAttribute('stroke', 'var(--faint)')
          lineEl.setAttribute('stroke-width', '2')
        }
      } else {
        lineEl.setAttribute('stroke', 'var(--faint)')
        lineEl.setAttribute('stroke-width', '2')
      }
    }
  })
  
  const progressText = document.getElementById('circle-progress-text')
  const progressBar = document.getElementById('circle-progress-bar')
  if (progressText) progressText.textContent = `${targetChordIndex} / 7`
  if (progressBar) progressBar.style.width = `${(targetChordIndex / 7) * 100}%`
}

function handleChordCircleInput(detectedChord: string) {
  const chords = generateDiatonicChords(chordCircleKey, currentNotation)
  const targetChord = chords[targetChordIndex]
  
  if (detectedChord.toLowerCase() === targetChord.toLowerCase()) {
    // Acertó el acorde actual
    targetChordIndex++
    
    // Efecto de parpadeo verde en el badge de micrófono para feedback inmediato
    const micStatus = document.getElementById('mic-status')
    if (micStatus) {
      micStatus.style.backgroundColor = 'var(--green-pale)'
      setTimeout(() => {
        micStatus.style.backgroundColor = ''
      }, 300)
    }
    
    if (targetChordIndex >= 7) {
      // Completó los 7 acordes diatónicos
      guideActive = false
      const guideBtn = document.getElementById('circle-guide-btn')
      if (guideBtn) guideBtn.textContent = 'Iniciar Guía'
      
      // Mostrar popup de felicitación
      setTimeout(() => {
        alert(`🎉 ¡Excelente trabajo! Has completado el círculo diatónico de ${chordCircleKey} Mayor de manera impecable.`)
        targetChordIndex = 0
        updateCircleVisuals()
      }, 300)
    } else {
      updateCircleVisuals()
    }
  }
}

// Iniciar/Detener Guía interactiva
const circleGuideBtn = document.getElementById('circle-guide-btn')
if (circleGuideBtn) {
  circleGuideBtn.addEventListener('click', () => {
    guideActive = !guideActive
    if (guideActive) {
      circleGuideBtn.textContent = 'Detener Guía'
      targetChordIndex = 0
    } else {
      circleGuideBtn.textContent = 'Iniciar Guía'
      targetChordIndex = 0
    }
    updateCircleVisuals()
  })
}

// Volver al menú
const circleBackBtn = document.getElementById('circle-back-btn')
if (circleBackBtn) {
  circleBackBtn.addEventListener('click', () => {
    guideActive = false
    showScreen('mode-screen')
  })
}

// Key selector pills click
const keyPills = document.querySelectorAll('.key-pill')
keyPills.forEach(pill => {
  pill.addEventListener('click', () => {
    keyPills.forEach(p => p.classList.remove('active'))
    pill.classList.add('active')
    
    chordCircleKey = pill.getAttribute('data-key') || 'Do'
    
    // Detener guía si estaba activa
    guideActive = false
    if (circleGuideBtn) circleGuideBtn.textContent = 'Iniciar Guía'
    targetChordIndex = 0
    
    const chords = generateDiatonicChords(chordCircleKey, currentNotation)
    renderCircleChords(chords)
    renderSequenceStrip(chords)
    updateCircleVisuals()
  })
})

// Ajustar el rendering de los nodos al cambiar de tamaño la ventana
window.addEventListener('resize', () => {
  const circleScreen = document.getElementById('chord-circle-screen')
  if (circleScreen && !circleScreen.classList.contains('hidden')) {
    const chords = generateDiatonicChords(chordCircleKey, currentNotation)
    renderCircleChords(chords)
    updateCircleVisuals()
  }
})

// ──────────────────────────────────────────
// Gestión de la Pantalla de Game Over HTML
// ──────────────────────────────────────────

game.events.on('game-over', (stats: { score: number, notesHit: number, accuracy: number, bestCombo: number }) => {
  lastGameOverStats = stats
  localStorage.setItem('lastGameOverStats', JSON.stringify(stats))
  window.location.hash = '#gameover'
})

// Reintentar desde la pantalla de Game Over
const goRetryBtn = document.getElementById('go-retry-btn')
if (goRetryBtn) {
  goRetryBtn.addEventListener('click', () => {
    window.location.hash = '#play'
  })
}

// Menú principal desde la pantalla de Game Over
const goMenuBtn = document.getElementById('go-menu-btn')
if (goMenuBtn) {
  goMenuBtn.addEventListener('click', () => {
    window.location.hash = '#start'
  })
}

// ──────────────────────────────────────────
// Limpieza al cerrar
// ──────────────────────────────────────────
window.addEventListener('beforeunload', () => {
  pitchDetector.stop()
  chordDetector.stop()
})
