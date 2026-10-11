import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Snapshot } from '@memory-window/api-contracts';
import { ApiClient } from '../services/api';
export function useAccount() {
  const api=useMemo(()=>new ApiClient(),[]);
  const refreshSequence=useRef(0);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const refresh=useCallback(async()=>{ const version=api.sessionVersion;const sequence=++refreshSequence.current;const state=await api.snapshot();if(version===api.sessionVersion && sequence===refreshSequence.current)setSnapshot(state);return state; },[api]);
  const run=useCallback(async(action:()=>Promise<unknown>,refreshAfter=true)=>{
    setPending(true);setError('');
    try {const result=await action(); if(refreshAfter) await refresh();return result;}
    catch(error) {setError(error instanceof Error?error.message:'処理できませんでした。');return undefined;}
    finally {setPending(false);}
  },[refresh]);
  const logout=useCallback(async()=>{await run(()=>api.logout(),false);setSnapshot(null);},[api,run]);
  useEffect(()=>{
    if(snapshot?.profile.role!=='caregiver')return;
    const update=()=>{if(document.hidden)return;void refresh().catch(()=>{setSnapshot(current=>current?{...current,sharedNeeds:[]}:null);setError('共有情報を更新できませんでした。接続を確認してください。');});};
    const timer=setInterval(update,10000);window.addEventListener('focus',update);
    return ()=>{clearInterval(timer);window.removeEventListener('focus',update);};
  },[snapshot?.profile.id,snapshot?.profile.role,refresh]);
  return {api,snapshot,error,pending,run,refresh,logout,setError};
}
export type Account = ReturnType<typeof useAccount>;
