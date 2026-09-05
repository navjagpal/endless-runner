import { Player } from './Player'

export class InputHandler {
  private player: Player
  private touchStartX = 0
  private touchStartY = 0
  private touchStartTime = 0
  private readonly SWIPE_THRESHOLD = 40

  constructor(player: Player, canvas: HTMLCanvasElement) {
    this.player = player
    this._bindKeyboard()
    this._bindTouch(canvas)
  }

  private _bindKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          this.player.moveLeft()
          break
        case 'ArrowRight':
        case 'KeyD':
          this.player.moveRight()
          break
        case 'ArrowUp':
        case 'KeyW':
        case 'Space':
          this.player.jump()
          break
        case 'ArrowDown':
        case 'KeyS':
          this.player.slide()
          break
      }
    })
  }

  private _bindTouch(canvas: HTMLCanvasElement): void {
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0]
      this.touchStartX = t.clientX
      this.touchStartY = t.clientY
      this.touchStartTime = Date.now()
      e.preventDefault()
    }, { passive: false })

    canvas.addEventListener('touchend', (e) => {
      const t = e.changedTouches[0]
      const dx = t.clientX - this.touchStartX
      const dy = t.clientY - this.touchStartY
      const elapsed = Date.now() - this.touchStartTime

      if (elapsed < 300 && Math.abs(dx) < 20 && Math.abs(dy) < 20) {
        // Tap = jump
        this.player.jump()
        return
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > this.SWIPE_THRESHOLD) this.player.moveRight()
        else if (dx < -this.SWIPE_THRESHOLD) this.player.moveLeft()
      } else {
        if (dy > this.SWIPE_THRESHOLD) this.player.slide()
        else if (dy < -this.SWIPE_THRESHOLD) this.player.jump()
      }
      e.preventDefault()
    }, { passive: false })
  }
}
