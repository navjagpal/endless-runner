import { Scene } from '@babylonjs/core'
import { createChunk, type ChunkData, CHUNK_LENGTH, sharedRoadMat, sharedGrassMat } from './TrackChunk'
import { ZONES } from '../zones/ZoneManager'

const VISIBLE_AHEAD  = 7
const DESPAWN_BEHIND = CHUNK_LENGTH * 2

function zoneIdForDistance(dist: number): string {
  let id = ZONES[0].id
  for (const z of ZONES) {
    if (dist >= z.startDist) id = z.id
  }
  return id
}

export class TrackManager {
  private scene:   Scene
  private chunks:  ChunkData[] = []
  private nextZ  = 0
  /**
   * Run distance minus player z. Normally zero, but a dev fast-forward
   * (`?dist=`) moves the distance without moving the player, and a
   * chunk's zone has to follow the distance.
   */
  private distOffset = 0

  constructor(scene: Scene, distOffset = 0) {
    this.scene = scene
    this.distOffset = distOffset
    for (let i = 0; i < VISIBLE_AHEAD; i++) this._spawnChunk()
  }

  /** Expose shared mats so ZoneManager can lerp them */
  get roadMat()  { return sharedRoadMat  }
  get grassMat() { return sharedGrassMat }

  private _spawnChunk(): void {
    // A chunk's zone is decided by where it *is*: the player reaches
    // z = nextZ after travelling nextZ metres (plus any offset).
    const zoneId = zoneIdForDistance(this.nextZ + this.distOffset)
    const chunk  = createChunk(this.scene, this.nextZ, zoneId)
    this.chunks.push(chunk)
    this.nextZ += CHUNK_LENGTH
  }

  update(playerZ: number, playerDist: number): void {
    this.distOffset = playerDist - playerZ
    const furthest = this.chunks[this.chunks.length - 1]
    if (furthest && furthest.zEnd - playerZ < CHUNK_LENGTH * 3) {
      this._spawnChunk()
    }

    for (let i = this.chunks.length - 1; i >= 0; i--) {
      if (this.chunks[i].zEnd < playerZ - DESPAWN_BEHIND) {
        this.chunks[i].root.dispose()
        this.chunks.splice(i, 1)
      }
    }
  }
}
