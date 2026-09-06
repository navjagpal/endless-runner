/**
 * The same gestures as the runner: swipe left/right to change lane, swipe
 * up or tap to jump, swipe down for the vehicle's action. Keyboard for a
 * desk. Everything routes through the callbacks so the HUD's optional
 * on-screen arrows can drive the same handlers.
 */

export type InputAction = 'left' | 'right' | 'jump' | 'action'

export class InputHandler {
  private startX = 0
  private startY = 0
  private startTime = 0
  private readonly SWIPE = 40
  private onAction: (a: InputAction) => void

  constructor(canvas: HTMLCanvasElement, onAction: (a: InputAction) => void) {
    this.onAction = onAction
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':  case 'KeyA': this.onAction('left'); break
        case 'ArrowRight': case 'KeyD': this.onAction('right'); break
        case 'ArrowUp':    case 'KeyW': case 'Space': this.onAction('jump'); break
        case 'ArrowDown':  case 'KeyS': case 'Enter': case 'KeyH': this.onAction('action'); break
      }
    })
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      this.startX = t.clientX; this.startY = t.clientY; this.startTime = Date.now()
      e.preventDefault()
    }, { passive: false })
    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]
      const dx = t.clientX - this.startX, dy = t.clientY - this.startY
      const elapsed = Date.now() - this.startTime
      if (elapsed < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) { this.onAction('jump'); e.preventDefault(); return }
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > this.SWIPE) this.onAction('right'); else if (dx < -this.SWIPE) this.onAction('left')
      } else {
        if (dy > this.SWIPE) this.onAction('action'); else if (dy < -this.SWIPE) this.onAction('jump')
      }
      e.preventDefault()
    }, { passive: false })
    // Mouse on a desktop: a click is a jump, a drag is a swipe.
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return
      this.startX = e.clientX; this.startY = e.clientY; this.startTime = Date.now()
    })
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch') return
      const dx = e.clientX - this.startX, dy = e.clientY - this.startY
      if (Date.now() - this.startTime < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) { this.onAction('jump'); return }
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > this.SWIPE) this.onAction('right'); else if (dx < -this.SWIPE) this.onAction('left')
      } else {
        if (dy > this.SWIPE) this.onAction('action'); else if (dy < -this.SWIPE) this.onAction('jump')
      }
    })
  }
}
