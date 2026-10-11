// Racing game: menu → race → results. main owns the canvas, the loop, input routing and
// the trophy shelf (kept in the iPad's browser storage, never in the repo).
import './style.css'
import { audio } from './audio'
import { Race, type RaceResult } from './race/race'
import { Results } from './race/results'
import { Tilt } from './tilt'
import { MEDAL, drawPlayButton, drawTrophy, hitButton, type IconButton } from './ui'

const canvas = document.getElementById('game') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const tilt = new Tilt()

let w = 0
let h = 0
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  w = window.innerWidth
  h = window.innerHeight
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}
window.addEventListener('resize', resize)
resize()

// ---- trophies ------------------------------------------------------------

const TROPHY_KEY = 'spil.racer.trophies'
function loadTrophies(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(TROPHY_KEY) ?? '[]')
    if (Array.isArray(v) && v.length === 3) return v.map(Number)
  } catch {
    // Unreadable or blocked storage: start with an empty shelf.
  }
  return [0, 0, 0]
}
let trophies = loadTrophies()
function addTrophy(place: number) {
  if (place > 3) return
  trophies[place - 1]++
  try {
    localStorage.setItem(TROPHY_KEY, JSON.stringify(trophies))
  } catch {
    // Not saved, but the shelf still shows it this session.
  }
}

// ---- scenes --------------------------------------------------------------

let scene: 'menu' | 'race' | 'results' = 'menu'
let race = new Race()
let results: Results | null = null
let sceneChangedAt = 0
const keys = { left: false, right: false }

const playButton = (): IconButton => ({ x: w / 2, y: h * 0.45, r: Math.min(w, h) * 0.16 })

function setScene(next: typeof scene) {
  scene = next
  sceneChangedAt = performance.now()
}

function startRace() {
  race = new Race()
  race.onFinish = finishRace
  race.start()
  setScene('race')
}

function finishRace(result: RaceResult) {
  addTrophy(result.place)
  results = new Results(result)
  setScene('results')
}

function goToMenu() {
  race = new Race()
  setScene('menu')
}

// ---- input ---------------------------------------------------------------

// Menu and results react to `click`: iOS only allows the motion-permission prompt, audio
// and speech to start from a completed tap.
canvas.addEventListener('click', (e) => {
  if (performance.now() - sceneChangedAt < 350) return
  const { clientX: x, clientY: y } = e
  if (scene === 'menu' && hitButton(playButton(), x, y)) {
    void tilt.enable()
    audio.unlock()
    startRace()
  } else if (scene === 'results' && results) {
    const action = results.click(x, y)
    if (action === 'again') startRace()
    else if (action === 'menu') goToMenu()
  }
})

// In the race, buttons react the moment a finger lands (turbo must feel instant).
canvas.addEventListener('pointerdown', (e) => {
  if (scene !== 'race') return
  const action = race.pointer(e.clientX, e.clientY, tilt)
  if (action === 'restart') startRace()
  else if (action === 'menu') goToMenu()
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') keys.left = true
  if (e.key === 'ArrowRight') keys.right = true
  if (e.key === ' ' && scene === 'race') race.fireTurbo()
})
window.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft') keys.left = false
  if (e.key === 'ArrowRight') keys.right = false
})

// Leaving the app (home button, notification) pauses the race.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && scene === 'race' && race.state !== 'finished') race.paused = true
})

// ---- loop ----------------------------------------------------------------

function steering() {
  if (keys.left) return -1
  if (keys.right) return 1
  return tilt.steer
}

function drawMenu(now: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(0, 0, w, h)
  drawPlayButton(ctx, playButton(), now)

  // Trophy shelf
  const size = Math.min(90, h * 0.12)
  trophies.forEach((count, i) => {
    if (count === 0) return
    const x = 70 + i * (size + 40)
    const y = h - 30
    drawTrophy(ctx, x, y, size, MEDAL[i])
    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#222'
    ctx.lineWidth = 5
    ctx.font = `bold ${Math.round(size * 0.35)}px system-ui, sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.strokeText(String(count), x + size * 0.3, y - size * 0.05)
    ctx.fillText(String(count), x + size * 0.3, y - size * 0.05)
  })

  ctx.font = '13px ui-monospace, monospace'
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.fillText(`version ${__BUILD__}`, w - 16, 24)
}

let last = performance.now()
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now

  if (scene === 'results' && results) {
    results.update(dt)
    results.draw(ctx, w, h, now)
  } else {
    // During the countdown, however the wheel is held counts as straight ahead.
    if (scene === 'race' && race.state === 'countdown') tilt.calibrate()
    race.update(dt, steering())
    race.draw(ctx, w, h, now)
    if (scene === 'menu') drawMenu(now)
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// Dev-only handle for poking at the game from the browser console or test scripts.
if (import.meta.env.DEV) Object.assign(window, { game: { get race() { return race } } })

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
}
