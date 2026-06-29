export const GAME_OVER_MESSAGES = [
  "You drowned! Take swimming lessons next time!",
  "You swim like a rock, because you ARE A ROCK!",
  "Try actually floating next time. Smh.",
  "Can you even survive BEING WET?!",
  "Gerald has returned to the bottom.",
  "The pool won this round.",
  "Bro, it's water. Relax.",
  "That was less swimming and more sinking with confidence.",
  "Gerald believed in himself. The water disagreed.",
  "Maybe buy better floaties next time.",
  "The deep end is not impressed.",
  "Gerald is now pool furniture.",
]

export function getRandomGameOverMessage() {
  return GAME_OVER_MESSAGES[Math.floor(Math.random() * GAME_OVER_MESSAGES.length)]
}
