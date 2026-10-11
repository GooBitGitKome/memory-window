import { useEffect, useState } from 'react';
import type { CharacterState, Season, TimeOfDay, WeatherKind } from '@memory-window/core';

const poses: Record<CharacterState, string> = {
  IDLE: 'idle', TEA: 'tea', LOOK_OUTSIDE: 'looking', TURN: 'looking',
  WAVE: 'wave', GREETING: 'wave', LISTENING: 'idle', SPEAKING: 'speaking',
  RESTING: 'resting', READING: 'reading', WALKING: 'walking', SITTING: 'sitting',
};

const weatherLabels: Record<WeatherKind, string> = {
  unknown: '静かな風景', sunny: '晴れ', cloudy: '曇り', rainy: '雨',
  snowy: '雪', foggy: '霧', stormy: '雷雨',
};

function useCharacterFrame(state: CharacterState) {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [frame, setFrame] = useState<{ state: CharacterState; alternate: boolean }>({ state, alternate: false });

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setFrame({ state, alternate: false });
    if (reducedMotion) return;

    if (state === 'WALKING' || state === 'SPEAKING') {
      const interval = window.setInterval(() => setFrame(current => ({
        state, alternate: current.state === state ? !current.alternate : true,
      })), state === 'WALKING' ? 400 : 260);
      return () => window.clearInterval(interval);
    }

    if (state === 'IDLE' || state === 'LISTENING') {
      let timeout: number;
      const schedule = () => {
        timeout = window.setTimeout(() => {
          setFrame({ state, alternate: true });
          timeout = window.setTimeout(() => {
            setFrame({ state, alternate: false });
            schedule();
          }, 140);
        }, 5000 + Math.random() * 4000);
      };
      schedule();
      return () => window.clearTimeout(timeout);
    }
  }, [state, reducedMotion]);

  return !reducedMotion && frame.state === state && frame.alternate;
}

/** The room and figure are independent image assets; complete poses replace limb transforms. */
export function WindowScene({ state, time, season = 'autumn', weather = 'unknown' }: {
  state: CharacterState; time: TimeOfDay; season?: Season; weather?: WeatherKind;
}) {
  const pose = poses[state];
  const alternateFrame = useCharacterFrame(state);
  const seated = pose === 'sitting' || pose === 'reading' || pose === 'resting';
  const outside = time === 'night' && (weather === 'unknown' || weather === 'sunny')
    ? 'night' : weather === 'unknown' ? 'neutral' : weather;
  return <span className={`scene state-${state.toLowerCase()} weather-${weather} time-${time} season-${season}`} role="img" aria-label={`カーテンの向こうの部屋。人物が暮らし、外は${weatherLabels[weather]}です。`}>
    <span className="outdoor-weather" aria-hidden="true">
      <img className="weather-art" src={`/art/weather-${outside}.png`} alt="" draggable={false} />
    </span>
    <svg className="room-art" viewBox="0 0 1536 1024" aria-hidden="true" focusable="false">
      <defs>
        <mask id="room-glass-mask" maskUnits="userSpaceOnUse" style={{ maskType: 'luminance' }}>
          <rect width="1536" height="1024" fill="white" />
          {/* The cut-outs stop inside the original mullion, sill and curtains. */}
          <path d="M866 66 H1137 V474 H833 L828 426 L821 360 L820 303 L832 245 L848 180 L859 112 Z" fill="black" />
          <path d="M1154 66 H1410 L1417 112 L1428 180 L1440 245 L1450 302 L1453 360 L1448 427 L1440 474 H1154 Z" fill="black" />
        </mask>
      </defs>
      <image href="/art/room.png" width="1536" height="1024" mask="url(#room-glass-mask)" />
    </svg>
    <span className={`character-sprite${seated ? ' character-seated' : ''}`} aria-hidden="true">
      <img key={pose} className="character-pose" src={`/art/character-v2-${state === 'WALKING' && alternateFrame ? 'walking-step' : pose}.png`} alt="" draggable={false} />
      {(state === 'IDLE' || state === 'LISTENING' || state === 'SPEAKING') && <img
        className={`character-frame ${state === 'SPEAKING' ? 'mouth-frame' : 'blink-frame'}${alternateFrame ? ' is-visible' : ''}`}
        src={`/art/character-v2-${state === 'SPEAKING' ? 'speaking-closed' : 'blink'}.png`}
        alt="" draggable={false}
      />}
    </span>
  </span>;
}
