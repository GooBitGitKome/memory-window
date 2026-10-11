export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night';
export type CharacterState = 'IDLE' | 'TEA' | 'LOOK_OUTSIDE' | 'TURN' | 'WAVE' | 'GREETING' | 'LISTENING' | 'SPEAKING' | 'RESTING' | 'READING' | 'WALKING' | 'SITTING';
export function timeOfDay(hour: number): TimeOfDay {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new RangeError('Hour must be 0–23');
  return hour >= 5 && hour < 11 ? 'morning' : hour < 17 && hour >= 11 ? 'day' : hour >= 17 && hour < 20 ? 'evening' : 'night';
}
export const greetings: Record<TimeOfDay, string> = {
  morning: 'おはようございます。今日も、ゆっくり過ごしましょう。',
  day: 'こんにちは。ひと息ついて、ゆっくりしていってくださいね。',
  evening: 'こんばんは。今日も、おつかれさまでした。',
  night: 'こんばんは。静かな夜ですね。どうぞ、ゆっくり。',
};
export function quietState(time: TimeOfDay, step: number): CharacterState {
  if (time === 'night') return 'RESTING';
  return (['IDLE', 'TEA', 'IDLE', 'LOOK_OUTSIDE'] as const)[step % 4];
}
export class KnockDetector {
  private previous: number | null = null;
  reset() { this.previous = null; }
  tap(now: number, single: boolean): boolean {
    if (single) { this.reset(); return true; }
    if (this.previous !== null && now - this.previous >= 70 && now - this.previous <= 900) {
      this.reset(); return true;
    }
    if (this.previous === null || now - this.previous > 900 || now < this.previous) this.previous = now;
    return false;
  }
}
export function nextReaction(state: CharacterState): CharacterState {
  return state === 'TURN' ? 'WAVE' : state === 'WAVE' ? 'GREETING' : 'IDLE';
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export function seasonOfMonth(month: number): Season {
  if (!Number.isInteger(month) || month < 0 || month > 11) throw new RangeError('Month must be 0–11');
  return month >= 2 && month <= 4 ? 'spring' : month >= 5 && month <= 7 ? 'summer' : month >= 8 && month <= 10 ? 'autumn' : 'winter';
}
export * from './conversation.ts';

export type WeatherKind = 'unknown' | 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'stormy';
export function weatherFromCode(code:number):WeatherKind {
  if(!Number.isInteger(code))return 'unknown';
  if(code===0 || code===1)return 'sunny';
  if(code===2 || code===3)return 'cloudy';
  if(code===45 || code===48)return 'foggy';
  if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return 'rainy';
  if([71,73,75,77,85,86].includes(code))return 'snowy';
  if([95,96,99].includes(code))return 'stormy';
  return 'unknown';
}
export function selectActivity(time:TimeOfDay,previous:CharacterState|null,random:number):CharacterState {
  const day:CharacterState[]=['IDLE','IDLE','SITTING','TEA','READING','LOOK_OUTSIDE','WALKING'];
  const night:CharacterState[]=['RESTING','RESTING','RESTING','LOOK_OUTSIDE'];
  const choices=(time==='night'?night:day).filter(item=>item!==previous);
  const value=Number.isFinite(random)?Math.min(0.999999,Math.max(0,random)):0;
  return choices[Math.floor(value*choices.length)];
}
