import {
  Scene,
  MeshBuilder,
  PBRMaterial,
  Color3,
  Mesh,
} from '@babylonjs/core'
import { SkyMaterial } from '@babylonjs/materials'

export interface EnvironmentAssets {
  skyMat:      SkyMaterial
  farGroundMat: PBRMaterial
  farGround:   Mesh
}

export function setupEnvironment(scene: Scene): EnvironmentAssets {
  const skyMat      = _createSky(scene)
  const { farGround, farGroundMat } = _createFarGround(scene)
  _createFog(scene)
  return { skyMat, farGroundMat, farGround }
}

function _createSky(scene: Scene): SkyMaterial {
  const skybox = MeshBuilder.CreateBox('skyBox', { size: 900 }, scene)
  skybox.infiniteDistance = true
  skybox.isPickable       = false

  const sky = new SkyMaterial('sky', scene)
  sky.backFaceCulling = false
  sky.turbidity       = 5
  sky.luminance       = 1.0
  sky.inclination     = 0.38
  sky.azimuth         = 0.25
  sky.rayleigh        = 2.0
  skybox.material     = sky

  scene.clearColor.set(0.55, 0.78, 0.95, 1)
  return sky
}

function _createFog(scene: Scene): void {
  scene.fogMode    = Scene.FOGMODE_EXP2
  scene.fogColor   = new Color3(0.68, 0.84, 0.96)
  scene.fogDensity = 0.005
}

function _createFarGround(scene: Scene): { farGround: Mesh; farGroundMat: PBRMaterial } {
  const farGround = MeshBuilder.CreateGround('farGround', { width: 500, height: 1600 }, scene)
  farGround.position.y  = -0.25   // below road top (y=0) to prevent Z-fighting
  farGround.position.z  = 600
  farGround.isPickable  = false

  const farGroundMat = new PBRMaterial('farGroundMat', scene)
  farGroundMat.albedoColor = new Color3(0.22, 0.55, 0.15)
  farGroundMat.metallic    = 0
  farGroundMat.roughness   = 1
  farGround.material       = farGroundMat
  farGround.receiveShadows = true

  return { farGround: farGround as Mesh, farGroundMat }
}
