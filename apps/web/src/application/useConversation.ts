import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceReply } from '@memory-window/api-contracts';
import { conversationTransition, detectNeeds, type ConversationState, type NeedCandidate } from '@memory-window/core';
import { isDemo } from '../services/api';
import { RealtimeConnection } from '../services/realtime';
import { playGreeting } from '../services/greeting';
import type { Account } from './useAccount';
export function useConversation(account:Account,onCandidate:(candidate:NeedCandidate)=>void,volume:number) {
  const [state,setState]=useState<ConversationState>('IDLE');
  const [reply,setReply]=useState('');const [error,setError]=useState('');
  const audioRef=useRef<HTMLAudioElement>(null);
  const connection=useRef<RealtimeConnection|null>(null);
  const demoSession=useRef<string|null>(null);
  const cancelVoice=useRef<()=>void>(()=>{});
  const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
  const active=useRef(false);const generation=useRef(0);const ending=useRef<Promise<void>|null>(null);
  const candidateCallback=useRef(onCandidate);candidateCallback.current=onCandidate;
  const accountPresent=useRef(Boolean(account.snapshot));accountPresent.current=Boolean(account.snapshot);
  const transition=useCallback((event:Parameters<typeof conversationTransition>[1])=>setState(current=>conversationTransition(current,event)),[]);
  const stop=useCallback(async()=>{
    if(ending.current)return ending.current;
    if(!active.current && !connection.current && !demoSession.current){transition('closed');return;}
    generation.current++;active.current=false;transition('stop');cancelVoice.current();timers.current.forEach(clearTimeout);timers.current=[];
    const current=connection.current;connection.current=null;const id=demoSession.current;demoSession.current=null;
    const finish=Promise.resolve().then(async()=>{
      try {if(current)await current.close();if(id)await account.api.request('voice-end','POST',{sessionId:id});}
      catch {setError('会話は端末で終了しました。接続先への終了通知を確認できませんでした。');}
      finally {setReply('');transition('closed');void account.refresh().catch(()=>{ if(accountPresent.current) setError('利用情報を更新できませんでした。設定画面で最新の情報を確認してください。'); });ending.current=null;}
    });ending.current=finish;return finish;
  },[account.api,account.refresh,transition]);
  const touchIdle=useCallback(()=>{
    const timer=setTimeout(()=>{setError('しばらくお話がなかったため、会話を終了しました。');void stop();},90000);timers.current.push(timer);
    return timer;
  },[stop]);
  const idleTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const activity=useCallback(()=>{if(idleTimer.current)clearTimeout(idleTimer.current);idleTimer.current=touchIdle();},[touchIdle]);
  const start=useCallback(async()=>{
    if(active.current || ending.current)return;
    active.current=true;const run=++generation.current;setError('');setReply('');transition('greet');transition('connect');
    try {
      if(isDemo) {
        const result=VoiceReply.parse(await account.api.request('voice','POST',{}));
        if(run!==generation.current){await account.api.request('voice-end','POST',{sessionId:result.sessionId});return;}
        demoSession.current=result.sessionId;transition('ready');setReply('こんにちは。ここで、ゆっくりお話ししましょう。');
        timers.current.push(setTimeout(()=>void stop(),result.maxSeconds*1000));
      } else {
        if(!audioRef.current)throw new Error('音声の準備ができませんでした。');
        const real=new RealtimeConnection(account.api,{
          onListening:()=>{if(active.current){transition('ready');transition('listening');activity();}},
          onSpeaking:()=>{if(active.current){transition('speaking');activity();}},
          onInput:text=>{activity();detectNeeds(text).forEach(candidate=>candidateCallback.current(candidate));},
          onOutput:text=>{setReply(text);activity();},
          onError:message=>setError(message),onClosed:()=>{void stop();},
        },audioRef.current);connection.current=real;
        const maxSeconds=await real.start();if(run!==generation.current)return;
        timers.current.push(setTimeout(()=>void stop(),maxSeconds*1000));
      }
      activity();await account.refresh();
    } catch(error) {setError(error instanceof Error?error.message:'会話に接続できませんでした。');await stop();}
  },[account.api,account.refresh,transition,stop,activity]);
  const sayDemo=useCallback((text:string)=>{
    if(!isDemo || !active.current || !text.trim())return;
    activity();cancelVoice.current();transition('listening');
    const candidates=detectNeeds(text);candidates.forEach(candidate=>candidateCallback.current(candidate));
    const answer=candidates.length?'そうだったのですね。お手伝いの希望として、内容を確認できます。共有するかどうかは、ご自身で決めてくださいね。':'お話ししてくださって、ありがとうございます。ゆっくり過ごしましょう。';
    transition('speaking');setReply(answer);
    if(volume>0)cancelVoice.current=playGreeting(answer,volume,()=>{});
    timers.current.push(setTimeout(()=>transition('listening'),4500));
  },[activity,transition,volume]);
  useEffect(()=>{
    const end=()=>{void stop();};const hidden=()=>{if(document.hidden)end();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',end);window.addEventListener('memory-window:suspend',end);window.addEventListener('offline',end);
    return ()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',end);window.removeEventListener('memory-window:suspend',end);window.removeEventListener('offline',end);void stop();};
  },[stop]);
  return {state,reply,error,start,stop,sayDemo,audioRef,active:state!=='IDLE'};
}
