import Phaser from 'phaser'
import BootScene from './scenes/BootScene'
import PreloadScene from './scenes/PreloadScene'
import MenuScene from './scenes/MenuScene'
import LevelScene from './scenes/LevelScene'
import UpgradeShopScene from './scenes/UpgradeShopScene'
import GameOverScene from './scenes/GameOverScene'
import WinScene from './scenes/WinScene'

export { GAME_WIDTH, GAME_HEIGHT } from './constants'

export const GAME_CONFIG = {
  type: Phaser.AUTO,
  width: 480,
  height: 640,
  backgroundColor: '#1a8fe3',
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  scene: [
    BootScene,
    PreloadScene,
    MenuScene,
    LevelScene,
    UpgradeShopScene,
    GameOverScene,
    WinScene,
  ],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
}
