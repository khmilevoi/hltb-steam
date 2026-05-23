'use client'

import { useState } from 'react'

const GAME_PLACEHOLDER_IMAGE = '/game-placeholder.svg'

type Props = { src: string; name: string }

export function GameCoverCell({ src, name }: Props) {
  const [imageSrc, setImageSrc] = useState(src || GAME_PLACEHOLDER_IMAGE)

  return (
    <img
      src={imageSrc}
      alt={name}
      width={92}
      height={43}
      className="h-[43px] w-[92px] rounded object-cover"
      onError={() => {
        if (imageSrc !== GAME_PLACEHOLDER_IMAGE) setImageSrc(GAME_PLACEHOLDER_IMAGE)
      }}
    />
  )
}
