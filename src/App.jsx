import React, { useEffect, useRef } from 'react'
import Phaser from 'phaser'
import { GAME_CONFIG } from './game/config'

export default function App() {
  const gameRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (gameRef.current) return

    gameRef.current = new Phaser.Game({
      ...GAME_CONFIG,
      parent: containerRef.current,
    })

    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true)
        gameRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    />
  )
}
