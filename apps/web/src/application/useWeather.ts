import {useCallback,useEffect,useRef,useState} from 'react';
import type {WeatherKind} from '@memory-window/core';
import {currentPosition,fetchWeather,searchPlaces,type Place,type WeatherResult} from '../services/weather';
import {isDemo} from '../services/api';
export function useWeather(){
  const [mode,setMode]=useState<'off'|'real'|'demo'>('off');
  const [result,setResult]=useState<WeatherResult|null>(null);
  const [places,setPlaces]=useState<Place[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const selected=useRef<Place|null>(null);const controller=useRef<AbortController|null>(null);const generation=useRef(0);const lastAttempt=useRef(0);
  const cancel=useCallback(()=>{generation.current++;controller.current?.abort();controller.current=null;setBusy(false);},[]);
  const update=useCallback(async(place:Place)=>{
    cancel();const current=generation.current;const abort=new AbortController();controller.current=abort;lastAttempt.current=Date.now();setBusy(true);setError('');
    try{const weather=await fetchWeather(place,abort.signal);if(current===generation.current){selected.current=place;setMode('real');setResult(weather);}}
    catch{if(current===generation.current)setError('天候を更新できませんでした。時間をおいて再試行してください。');}
    finally{if(current===generation.current){setBusy(false);controller.current=null;}}
  },[cancel]);
  const locate=useCallback(async()=>{
    cancel();const current=generation.current;setBusy(true);setError('');
    try{const position=await currentPosition();if(current!==generation.current)return;await update({name:'現在地付近',latitude:position.coords.latitude,longitude:position.coords.longitude});}
    catch(error){if(current===generation.current){setBusy(false);setError(error instanceof Error?error.message:'現在地を取得できませんでした。');}}
  },[cancel,update]);
  const search=useCallback(async(query:string)=>{
    cancel();const current=generation.current;const abort=new AbortController();controller.current=abort;setBusy(true);setError('');setPlaces([]);
    try{const found=await searchPlaces(query,abort.signal);if(current===generation.current){setPlaces(found);if(!found.length)setError('地域が見つかりませんでした。');}}
    catch(error){if(current===generation.current)setError(error instanceof Error?error.message:'地域を検索できませんでした。');}
    finally{if(current===generation.current){setBusy(false);controller.current=null;}}
  },[cancel]);
  const simulate=(kind:WeatherKind)=>{if(!isDemo)return;cancel();selected.current=null;setMode('demo');setError('');setResult({kind,place:'模擬天候',fetchedAt:Date.now()});};
  const off=()=>{cancel();selected.current=null;setMode('off');setResult(null);setPlaces([]);setError('');};
  useEffect(()=>{
    const tick=()=>{if(document.hidden || mode!=='real' || !selected.current)return;
      if(Date.now()-lastAttempt.current>=30*60*1000)void update(selected.current);
    };
    const timer=setInterval(tick,60*1000);document.addEventListener('visibilitychange',tick);window.addEventListener('memory-window:resume',tick);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);window.removeEventListener('memory-window:resume',tick);};
  },[mode,result,update]);
  useEffect(()=>()=>{generation.current++;controller.current?.abort();},[]);
  const expired=mode==='real' && result && Date.now()-result.fetchedAt>2*60*60*1000;
  return {mode,stale:Boolean(expired),kind:expired?'unknown' as const:result?.kind??'unknown' as const,result,places,error,busy,locate,search,update,simulate,off};
}
