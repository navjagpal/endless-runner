import { Game } from './game/Game'
import './style.css'

const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement
new Game(canvas)
