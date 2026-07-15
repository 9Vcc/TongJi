import { useEffect, useLayoutEffect, useRef, useState } from 'react'

interface PupilProps {
  mouseX: number
  mouseY: number
  size?: number
  maxDistance?: number
  pupilColor?: string
  forceLookX?: number
  forceLookY?: number
}

interface EyeBallProps {
  mouseX: number
  mouseY: number
  size?: number
  pupilSize?: number
  maxDistance?: number
  eyeColor?: string
  pupilColor?: string
  isBlinking?: boolean
  forceLookX?: number
  forceLookY?: number
}

interface Center {
  x: number
  y: number
}

/** 计算瞳孔偏移量（纯函数，无副作用） */
function calcPupilOffset(
  mouseX: number,
  mouseY: number,
  centerX: number,
  centerY: number,
  maxDistance: number,
): { x: number; y: number } {
  const deltaX = mouseX - centerX
  const deltaY = mouseY - centerY
  const distance = Math.min(Math.sqrt(deltaX ** 2 + deltaY ** 2), maxDistance)
  const angle = Math.atan2(deltaY, deltaX)
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
}

/**
 * Pupil 组件 — 无状态纯函数
 * 中心位置通过 ref 缓存（mount/resize 时计算一次），渲染时直接计算位置
 * transition 极短（0.03s）确保跟手且无抖动
 */
function Pupil({
  mouseX,
  mouseY,
  size = 12,
  maxDistance = 5,
  pupilColor = '#2D2D2D',
  forceLookX,
  forceLookY,
}: PupilProps) {
  const pupilRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<Center | null>(null)
  const [, setTick] = useState(0)

  useLayoutEffect(() => {
    const update = () => {
      if (!pupilRef.current) return
      const rect = pupilRef.current.getBoundingClientRect()
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      setTick((t) => t + 1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  let pos: { x: number; y: number } = { x: 0, y: 0 }
  if (forceLookX !== undefined && forceLookY !== undefined) {
    pos = { x: forceLookX, y: forceLookY }
  } else if (centerRef.current) {
    pos = calcPupilOffset(mouseX, mouseY, centerRef.current.x, centerRef.current.y, maxDistance)
  }

  return (
    <div
      ref={pupilRef}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: pupilColor,
        borderRadius: '50%',
        transform: `translate(${pos.x}px, ${pos.y}px)`,
        willChange: 'transform',
      }}
    />
  )
}

/**
 * EyeBall 组件 — 无状态纯函数
 * 瞳孔位置在渲染时直接计算，transition 极短确保跟手
 */
function EyeBall({
  mouseX,
  mouseY,
  size = 18,
  pupilSize = 7,
  maxDistance = 5,
  eyeColor = 'white',
  pupilColor = '#2D2D2D',
  isBlinking = false,
  forceLookX,
  forceLookY,
}: EyeBallProps) {
  const eyeRef = useRef<HTMLDivElement>(null)
  const centerRef = useRef<Center | null>(null)
  const [, setTick] = useState(0)

  useLayoutEffect(() => {
    const update = () => {
      if (!eyeRef.current) return
      const rect = eyeRef.current.getBoundingClientRect()
      centerRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }
      setTick((t) => t + 1)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  let pos: { x: number; y: number } = { x: 0, y: 0 }
  if (forceLookX !== undefined && forceLookY !== undefined) {
    pos = { x: forceLookX, y: forceLookY }
  } else if (centerRef.current) {
    pos = calcPupilOffset(mouseX, mouseY, centerRef.current.x, centerRef.current.y, maxDistance)
  }

  return (
    <div
      ref={eyeRef}
      style={{
        width: `${size}px`,
        height: isBlinking ? '2px' : `${size}px`,
        backgroundColor: eyeColor,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        transition: 'height 0.15s ease',
      }}
    >
      {!isBlinking && (
        <div
          style={{
            width: `${pupilSize}px`,
            height: `${pupilSize}px`,
            backgroundColor: pupilColor,
            borderRadius: '50%',
            transform: `translate(${pos.x}px, ${pos.y}px)`,
            willChange: 'transform',
          }}
        />
      )}
    </div>
  )
}

export interface AnimatedCharactersProps {
  isTyping?: boolean
  isPasswordFocused?: boolean
  showPassword?: boolean
  passwordLength?: number
}

export default function AnimatedCharacters({
  isTyping = false,
  isPasswordFocused = false,
  showPassword = false,
  passwordLength = 0,
}: AnimatedCharactersProps) {
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)
  const [isPurpleBlinking, setIsPurpleBlinking] = useState(false)
  const [isBlackBlinking, setIsBlackBlinking] = useState(false)
  const [isLookingAtEachOther, setIsLookingAtEachOther] = useState(false)
  const [isPurplePeeking, setIsPurplePeeking] = useState(false)

  const purpleRef = useRef<HTMLDivElement>(null)
  const blackRef = useRef<HTMLDivElement>(null)
  const yellowRef = useRef<HTMLDivElement>(null)
  const orangeRef = useRef<HTMLDivElement>(null)

  const centersRef = useRef<Record<string, Center>>({})
  const [, setCentersTick] = useState(0)

  // rAF 节流 mousemove：每帧最多触发一次状态更新
  useEffect(() => {
    let rafId: number | null = null
    const latestMouse = { x: 0, y: 0 }

    const handleMouseMove = (e: MouseEvent) => {
      latestMouse.x = e.clientX
      latestMouse.y = e.clientY
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null
          setMouseX(latestMouse.x)
          setMouseY(latestMouse.y)
        })
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [])

  // 缓存角色中心位置（仅 mount + resize 时计算）
  useLayoutEffect(() => {
    const updateCenters = () => {
      const refs: Record<string, React.RefObject<HTMLDivElement | null>> = {
        purple: purpleRef,
        black: blackRef,
        yellow: yellowRef,
        orange: orangeRef,
      }
      const centers: Record<string, Center> = {}
      for (const [name, ref] of Object.entries(refs)) {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect()
          centers[name] = {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 3,
          }
        }
      }
      centersRef.current = centers
      setCentersTick((t) => t + 1)
    }
    updateCenters()
    window.addEventListener('resize', updateCenters)
    return () => window.removeEventListener('resize', updateCenters)
  }, [])

  // 眨眼定时器（紫色角色）
  useEffect(() => {
    const run = () => {
      const t = setTimeout(() => {
        setIsPurpleBlinking(true)
        setTimeout(() => {
          setIsPurpleBlinking(false)
          run()
        }, 150)
      }, Math.random() * 4000 + 3000)
      return t
    }
    const timeout = run()
    return () => clearTimeout(timeout)
  }, [])

  // 眨眼定时器（黑色角色）
  useEffect(() => {
    const run = () => {
      const t = setTimeout(() => {
        setIsBlackBlinking(true)
        setTimeout(() => {
          setIsBlackBlinking(false)
          run()
        }, 150)
      }, Math.random() * 4000 + 3000)
      return t
    }
    const timeout = run()
    return () => clearTimeout(timeout)
  }, [])

  // 输入用户名时紫黑角色对视
  useEffect(() => {
    if (isTyping) {
      setIsLookingAtEachOther(true)
      const timer = setTimeout(() => setIsLookingAtEachOther(false), 800)
      return () => clearTimeout(timer)
    }
    setIsLookingAtEachOther(false)
  }, [isTyping])

  // 显示密码时紫色角色随机偷看
  useEffect(() => {
    if (passwordLength > 0 && showPassword) {
      const peek = setTimeout(() => {
        setIsPurplePeeking(true)
        setTimeout(() => setIsPurplePeeking(false), 800)
      }, Math.random() * 3000 + 2000)
      return () => clearTimeout(peek)
    }
    setIsPurplePeeking(false)
  }, [passwordLength, showPassword])

  const calculatePosition = (name: string) => {
    const center = centersRef.current[name]
    if (!center) return { faceX: 0, faceY: 0, bodySkew: 0 }
    const deltaX = mouseX - center.x
    const deltaY = mouseY - center.y
    return {
      faceX: Math.max(-15, Math.min(15, deltaX / 20)),
      faceY: Math.max(-10, Math.min(10, deltaY / 30)),
      bodySkew: Math.max(-6, Math.min(6, -deltaX / 120)),
    }
  }

  const purplePos = calculatePosition('purple')
  const blackPos = calculatePosition('black')
  const yellowPos = calculatePosition('yellow')
  const orangePos = calculatePosition('orange')

  const isHidingPassword = passwordLength > 0 && !showPassword
  const isLookingAway = isPasswordFocused && !showPassword

  const primaryColor = 'var(--color-primary)'
  const darkColor = '#2D2D2D'
  const orangeColor = '#FF9B6B'
  const yellowColor = '#E8D754'

  const getCharStyle = (
    backgroundColor: string,
    zIndex: number,
    pos: { bodySkew: number },
    dimensions: React.CSSProperties,
    transform?: string,
  ): React.CSSProperties => {
    // 状态切换时用较长过渡，鼠标跟随时用极短过渡确保跟手
    const transformTransition = isPasswordFocused || isTyping
      ? 'transform 0.6s ease-out'
      : 'transform 0.05s linear'

    return {
      position: 'absolute',
      backgroundColor,
      zIndex,
      transformOrigin: 'bottom center',
      willChange: 'transform',
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      transition: `${transformTransition}, height 0.6s ease-in-out`,
      transform: transform || `skewX(${pos.bodySkew || 0}deg) translateZ(0)`,
      bottom: '-2px',
      borderBottom: `4px solid ${backgroundColor}`,
      ...dimensions,
    }
  }

  return (
    <div style={{ position: 'relative', width: '550px', height: '400px', overflow: 'hidden', pointerEvents: 'none' }}>
      {/* 紫色角色（使用主题主色） */}
      <div
        ref={purpleRef}
        style={getCharStyle(
          primaryColor, 1, purplePos,
          {
            left: '70px',
            width: '180px',
            height: isLookingAway || isTyping || isHidingPassword ? '440px' : '400px',
            borderRadius: '10px 10px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : isLookingAway
            ? 'skewX(-14deg) translateX(-20px) translateZ(0)'
            : isTyping || isHidingPassword
            ? `skewX(${(purplePos.bodySkew || 0) - 12}deg) translateX(40px) translateZ(0)`
            : `skewX(${purplePos.bodySkew || 0}deg) translateZ(0)`
        )}
      >
        {/* 眼睛容器：基础位置用 left/top（状态切换时过渡），鼠标跟随用 transform（无过渡延迟） */}
        <div style={{
          position: 'absolute',
          display: 'flex',
          gap: '32px',
          left: isLookingAway ? '20px' : (passwordLength > 0 && showPassword ? '20px' : (isLookingAtEachOther ? '55px' : '45px')),
          top: isLookingAway ? '25px' : (passwordLength > 0 && showPassword ? '35px' : (isLookingAtEachOther ? '65px' : '40px')),
          transform: (isLookingAway || (passwordLength > 0 && showPassword) || isLookingAtEachOther)
            ? 'none'
            : `translate(${purplePos.faceX}px, ${purplePos.faceY}px)`,
          transition: 'left 0.6s ease-out, top 0.6s ease-out',
        }}>
          <EyeBall mouseX={mouseX} mouseY={mouseY} isBlinking={isPurpleBlinking} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? (isPurplePeeking ? 4 : -4) : (isLookingAtEachOther ? 3 : undefined))} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? (isPurplePeeking ? 5 : -4) : (isLookingAtEachOther ? 4 : undefined))} eyeColor="white" pupilColor={darkColor} />
          <EyeBall mouseX={mouseX} mouseY={mouseY} isBlinking={isPurpleBlinking} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? (isPurplePeeking ? 4 : -4) : (isLookingAtEachOther ? 3 : undefined))} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? (isPurplePeeking ? 5 : -4) : (isLookingAtEachOther ? 4 : undefined))} eyeColor="white" pupilColor={darkColor} />
        </div>
      </div>

      {/* 黑色角色 */}
      <div
        ref={blackRef}
        style={getCharStyle(
          darkColor, 2, blackPos,
          {
            left: '240px',
            width: '120px',
            height: '310px',
            borderRadius: '8px 8px 0 0',
          },
          passwordLength > 0 && showPassword
            ? 'skewX(0deg) translateZ(0)'
            : isLookingAway
            ? 'skewX(12deg) translateX(-10px) translateZ(0)'
            : isLookingAtEachOther
            ? `skewX(${(blackPos.bodySkew || 0) * 1.5 + 10}deg) translateX(20px) translateZ(0)`
            : `skewX(${(blackPos.bodySkew || 0) * 1.5}deg) translateZ(0)`
        )}
      >
        <div style={{
          position: 'absolute',
          display: 'flex',
          gap: '24px',
          left: isLookingAway ? '10px' : (passwordLength > 0 && showPassword ? '10px' : (isLookingAtEachOther ? '32px' : '26px')),
          top: isLookingAway ? '20px' : (passwordLength > 0 && showPassword ? '28px' : (isLookingAtEachOther ? '12px' : '32px')),
          transform: (isLookingAway || (passwordLength > 0 && showPassword) || isLookingAtEachOther)
            ? 'none'
            : `translate(${blackPos.faceX}px, ${blackPos.faceY}px)`,
          transition: 'left 0.6s ease-out, top 0.6s ease-out',
        }}>
          <EyeBall mouseX={mouseX} mouseY={mouseY} size={16} pupilSize={6} isBlinking={isBlackBlinking} forceLookX={isLookingAway ? -4 : (passwordLength > 0 && showPassword ? -4 : (isLookingAtEachOther ? 0 : undefined))} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : (isLookingAtEachOther ? -4 : undefined))} eyeColor="white" pupilColor={darkColor} />
          <EyeBall mouseX={mouseX} mouseY={mouseY} size={16} pupilSize={6} isBlinking={isBlackBlinking} forceLookX={isLookingAway ? -4 : (passwordLength > 0 && showPassword ? -4 : (isLookingAtEachOther ? 0 : undefined))} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : (isLookingAtEachOther ? -4 : undefined))} eyeColor="white" pupilColor={darkColor} />
        </div>
      </div>

      {/* 橙色角色 */}
      <div
        ref={orangeRef}
        style={getCharStyle(
          orangeColor, 3, orangePos,
          {
            left: '0px',
            width: '240px',
            height: '200px',
            borderRadius: '120px 120px 0 0',
          },
          passwordLength > 0 && showPassword ? 'skewX(0deg) translateZ(0)' : `skewX(${orangePos.bodySkew || 0}deg) translateZ(0)`
        )}
      >
        <div style={{
          position: 'absolute',
          display: 'flex',
          gap: '32px',
          left: isLookingAway ? '50px' : (passwordLength > 0 && showPassword ? '50px' : '82px'),
          top: isLookingAway ? '75px' : (passwordLength > 0 && showPassword ? '85px' : '90px'),
          transform: (isLookingAway || (passwordLength > 0 && showPassword))
            ? 'none'
            : `translate(${orangePos.faceX || 0}px, ${orangePos.faceY || 0}px)`,
          transition: 'left 0.2s ease-out, top 0.2s ease-out',
        }}>
          <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -5 : undefined)} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : undefined)} pupilColor={darkColor} />
          <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -5 : undefined)} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : undefined)} pupilColor={darkColor} />
        </div>
      </div>

      {/* 黄色角色 */}
      <div
        ref={yellowRef}
        style={getCharStyle(
          yellowColor, 4, yellowPos,
          {
            left: '310px',
            width: '140px',
            height: '230px',
            borderRadius: '70px 70px 0 0',
          },
          passwordLength > 0 && showPassword ? 'skewX(0deg) translateZ(0)' : `skewX(${yellowPos.bodySkew || 0}deg) translateZ(0)`
        )}
      >
        <div style={{
          position: 'absolute',
          display: 'flex',
          gap: '24px',
          left: isLookingAway ? '20px' : (passwordLength > 0 && showPassword ? '20px' : '52px'),
          top: isLookingAway ? '30px' : (passwordLength > 0 && showPassword ? '35px' : '40px'),
          transform: (isLookingAway || (passwordLength > 0 && showPassword))
            ? 'none'
            : `translate(${yellowPos.faceX || 0}px, ${yellowPos.faceY || 0}px)`,
          transition: 'left 0.2s ease-out, top 0.2s ease-out',
        }}>
          <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -5 : undefined)} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : undefined)} pupilColor={darkColor} />
          <Pupil mouseX={mouseX} mouseY={mouseY} forceLookX={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -5 : undefined)} forceLookY={isLookingAway ? -5 : (passwordLength > 0 && showPassword ? -4 : undefined)} pupilColor={darkColor} />
        </div>
        {/* 嘴巴：鼠标跟随用 transform，状态切换用 left/top */}
        <div style={{
          position: 'absolute',
          width: '80px',
          height: '4px',
          backgroundColor: darkColor,
          borderRadius: '999px',
          left: isLookingAway ? '15px' : (passwordLength > 0 && showPassword ? '10px' : '40px'),
          top: isLookingAway ? '78px' : (passwordLength > 0 && showPassword ? '88px' : '88px'),
          transform: (isLookingAway || (passwordLength > 0 && showPassword))
            ? 'none'
            : `translate(${yellowPos.faceX || 0}px, ${yellowPos.faceY || 0}px)`,
          transition: 'left 0.2s ease-out, top 0.2s ease-out',
        }} />
      </div>
    </div>
  )
}
