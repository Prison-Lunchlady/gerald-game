import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GAME_CONFIG } from './game/config'
import { DEBUG_GERALD } from './game/debug'

export default function App() {
  const gameRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (gameRef.current) return

    gameRef.current = new Phaser.Game({
      ...GAME_CONFIG,
      parent: containerRef.current,
    })
    const allowTestHook = DEBUG_GERALD && window.location.search.includes('codexTest=1')
    if (allowTestHook) window.__GERALD_GAME = gameRef.current

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
      if (window.__GERALD_GAME) delete window.__GERALD_GAME
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    />
  )
}
