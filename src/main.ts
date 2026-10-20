import './boot'
import { Game } from './game'
import { installDebugApi } from './debug/api'

const container = document.getElementById('app')!
const game = new Game(container)
installDebugApi(game)
game.start()

document.addEventListener('contextmenu', (e) => e.preventDefault())
