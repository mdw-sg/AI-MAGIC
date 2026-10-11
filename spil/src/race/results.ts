// After the race: podium with the top three cars, the player's trophy, confetti, and
// buttons to race again or go home.
import { Particles } from '../effects'
import {
  MEDAL,
  drawAgainIcon,
  drawCar,
  drawIconButton,
  drawTrophy,
  hitButton,
  roundRect,
  type Ctx,
  type IconButton,
} from '../ui'
import type { RaceResult } from './race'

export class Results {
  private confetti = new Particles()
  private time = 0
  private w = 0
  private h = 0

  private result: RaceResult

  constructor(result: RaceResult) {
    this.result = result
  }

  private get againButton(): IconButton {
    return { x: this.w - 120, y: this.h - 110, r: 75 }
  }
  private get menuButton(): IconButton {
    return { x: 70, y: this.h - 70, r: 40 }
  }

  click(x: number, y: number): 'again' | 'menu' | null {
    if (hitButton(this.againButton, x, y)) return 'again'
    if (hitButton(this.menuButton, x, y)) return 'menu'
    return null
  }

  update(dt: number) {
    this.time += dt
    if (this.result.place <= 3 && Math.random() < dt * 40) this.confetti.confetti(this.w)
    this.confetti.update(dt)
  }

  draw(ctx: Ctx, w: number, h: number, now: number) {
    this.w = w
    this.h = h
    const { place, order, player } = this.result

    const bg = ctx.createLinearGradient(0, 0, 0, h)
    bg.addColorStop(0, '#3b6fd6')
    bg.addColorStop(1, '#a8d8ff')
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#4cbb4f'
    ctx.fillRect(0, h * 0.82, w, h * 0.18)

    // Podium: 2nd, 1st, 3rd
    const unit = Math.min(w / 6, h / 4.5)
    const baseY = h * 0.82
    const steps = [
      { rank: 2, x: w / 2 - unit * 1.25, hgt: unit * 0.9 },
      { rank: 1, x: w / 2, hgt: unit * 1.3 },
      { rank: 3, x: w / 2 + unit * 1.25, hgt: unit * 0.6 },
    ]
    for (const step of steps) {
      ctx.fillStyle = MEDAL[step.rank - 1]
      roundRect(ctx, step.x - unit * 0.6, baseY - step.hgt, unit * 1.2, step.hgt, 10)
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.font = `bold ${Math.round(unit * 0.45)}px system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(step.rank), step.x, baseY - step.hgt / 2)

      const colors = order[step.rank - 1]
      if (!colors) continue
      const cs = unit * 0.9
      const hop = colors === player ? Math.abs(Math.sin(now / 250)) * unit * 0.12 : 0
      const cy = baseY - step.hgt - cs * 0.18 - hop
      drawCar(ctx, step.x, cy, cs, 0, colors)
      if (colors === player) {
        ctx.fillStyle = '#fff'
        ctx.font = `${Math.round(unit * 0.4)}px system-ui, sans-serif`
        ctx.fillText('⭐', step.x, cy - cs * 0.6)
      }
    }

    // Player outside the top three stands beside the podium with their number.
    if (place > 3) {
      const x = w / 2 + unit * 2.6
      const cs = unit * 0.8
      drawCar(ctx, x, baseY - cs * 0.18, cs, 0, player)
      ctx.font = `${Math.round(unit * 0.35)}px system-ui, sans-serif`
      ctx.fillText('⭐', x, baseY - cs * 0.8)
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#222'
      ctx.lineWidth = 6
      ctx.font = `bold ${Math.round(unit * 0.5)}px system-ui, sans-serif`
      ctx.strokeText(String(place), x, baseY - cs * 1.3)
      ctx.fillText(String(place), x, baseY - cs * 1.3)
    }

    // Trophy for the top three grows in.
    if (place <= 3) {
      const grow = Math.min(1, this.time * 2)
      ctx.save()
      ctx.translate(w / 2, h * 0.36)
      ctx.scale(grow, grow)
      ctx.rotate(Math.sin(now / 400) * 0.05)
      drawTrophy(ctx, 0, 0, h * 0.28, MEDAL[place - 1])
      ctx.restore()
    }

    this.confetti.draw(ctx)

    const ab = this.againButton
    drawIconButton(ctx, ab, '', '#2ecc71', Math.sin(now / 250) * 0.04)
    drawAgainIcon(ctx, ab.x, ab.y, ab.r)
    drawIconButton(ctx, this.menuButton, '🏠', '#2f7de1')
  }
}
