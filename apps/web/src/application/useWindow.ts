import { useCallback, useEffect, useRef, useState } from 'react';
import { greetings, KnockDetector, nextReaction, quietState, selectActivity, seasonOfMonth, timeOfDay, type CharacterState } from '@memory-window/core';
import { playGreeting } from '../services/greeting';
export function useWindow(single:boolean,volume:number,enabled=true){
  const [time,setTime]=useState(()=>timeOfDay(new Date().getHours()));
  const [season,setSeason]=useState(()=>seasonOfMonth(new Date().getMonth()));
  const [state,setState]=useState<CharacterState>(()=>quietState(timeOfDay(new Date().getHours()),0));
  const [message,setMessage]=useState('');const [audioFailed,setAudioFailed]=useState(false);
  const detector=useRef(new KnockDetector());const busy=useRef(false);const active=useRef(enabled);
  const cancelAudio=useRef<()=>void>(()=>{});const timers=useRef<ReturnType<typeof setTimeout>[]>([]);
  const activityTimer=useRef<ReturnType<typeof setTimeout>|null>(null);const previous=useRef<CharacterState|null>(null);const scheduleRef=useRef<()=>void>(()=>{});
  const clear=useCallback(()=>{timers.current.forEach(clearTimeout);timers.current=[];if(activityTimer.current)clearTimeout(activityTimer.current);activityTimer.current=null;cancelAudio.current();cancelAudio.current=()=>{};},[]);
  const knock=useCallback(()=>{
    if(!enabled || busy.current || document.hidden)return;
    timers.current.forEach(clearTimeout);timers.current=[];cancelAudio.current();busy.current=true;setAudioFailed(false);setMessage(greetings[time]);setState('TURN');
    cancelAudio.current=volume>0?playGreeting(greetings[time],volume,()=>setAudioFailed(true)):()=>{};
    timers.current=[setTimeout(()=>setState(nextReaction('TURN')),650),setTimeout(()=>setState(nextReaction('WAVE')),1900),setTimeout(()=>{setState(quietState(time,0));setMessage('');busy.current=false;},8500)];
  },[enabled,time,volume]);
  useEffect(()=>{detector.current.reset();},[single]);
  useEffect(()=>{active.current=enabled;if(!enabled){clear();busy.current=false;detector.current.reset();setMessage('');setState(quietState(time,0));}else if(!activityTimer.current)scheduleRef.current();},[enabled,time,clear]);
  useEffect(()=>{
    let alive=true;
    const schedule=()=>{if(!alive)return;
      activityTimer.current=setTimeout(()=>{
        if(!alive)return;
        const current=timeOfDay(new Date().getHours());setTime(current);setSeason(seasonOfMonth(new Date().getMonth()));
        if(!document.hidden && active.current && !busy.current){
          const next=selectActivity(current,previous.current,Math.random());previous.current=next;setState(next);
          timers.current=[setTimeout(()=>{if(alive && active.current && !busy.current)setState(quietState(current,0));},next==='READING'||next==='RESTING'?22000:12000)];
        }
        schedule();
      },45000+Math.random()*45000);
    };
    scheduleRef.current=schedule;
    const reset=()=>{clear();detector.current.reset();busy.current=false;setMessage('');
      const current=timeOfDay(new Date().getHours());setTime(current);setSeason(seasonOfMonth(new Date().getMonth()));setState(quietState(current,0));schedule();
    };
    const visibility=()=>{if(document.hidden)reset();else reset();};
    schedule();document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',reset);window.addEventListener('memory-window:suspend',reset);window.addEventListener('memory-window:resume',reset);
    return()=>{alive=false;clear();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',reset);window.removeEventListener('memory-window:suspend',reset);window.removeEventListener('memory-window:resume',reset);};
  },[clear]);
  return {time,season,state,message,audioFailed,knock,tap:()=>{if(detector.current.tap(performance.now(),single))knock();}};
}
