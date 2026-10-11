import { StrictMode, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { CharacterState, NeedCandidate } from '@memory-window/core';
import { useWindow } from './application/useWindow';
import { useAccount } from './application/useAccount';
import { useConversation } from './application/useConversation';
import { Management } from './features/Management';
import { WindowScene } from './scenes/WindowScene';
import { WallClock } from './scenes/WallClock';
import { MemoryMedia, type MediaKind } from './components/MemoryMedia';
import { setupPlatform } from './services/platform';
import { isDemo } from './services/api';
import { useWeather } from './application/useWeather';
import { WeatherControls } from './components/WeatherControls';
import './style.css';
import './scenes/scene.css';
function App() {
  const account=useAccount();
  const weather=useWeather();
  const sceneRoot=useRef<HTMLElement>(null);const [immersive,setImmersive]=useState(false);const [browserFullscreen,setBrowserFullscreen]=useState(false);
  const [view,setView]=useState(location.pathname==='/settings'?'settings':'window');
  const [media,setMedia]=useState<MediaKind|null>(null);
  const [platformError,setPlatformError]=useState('');
  const [candidates,setCandidates]=useState<NeedCandidate[]>([]);
  const [single,setSingle]=useState(false);const [volume,setVolume]=useState(0.7);const [demoText,setDemoText]=useState('');
  const previousUser=useRef<string|null>(null);
  const addCandidate=useCallback((candidate:NeedCandidate)=>setCandidates(current=>current.some(item=>item.title===candidate.title)?current:[...current,candidate].slice(0,4)),[]);
  const conversation=useConversation(account,addCandidate,volume);
  const windowState=useWindow(single,volume,!conversation.active && !media);
  const [approaching,setApproaching]=useState(false);
  const [conversationFocus,setConversationFocus]=useState(false);
  useEffect(()=>{
    if(!conversation.active){setApproaching(false);setConversationFocus(false);return;}
    setConversationFocus(true);
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    setApproaching(true);
    const timer=window.setTimeout(()=>setApproaching(false),2600);
    return()=>window.clearTimeout(timer);
  },[conversation.active]);
  useEffect(()=>{
    let stopped=false;let cleanup=()=>{};
    void setupPlatform().then(remove=>{if(stopped)remove();else cleanup=remove;}).catch(()=>setPlatformError('オフライン機能を準備できませんでした。オンラインでは利用できます。'));
    return ()=>{stopped=true;cleanup();};
  },[]);
  useEffect(()=>{const id=account.snapshot?.profile.id??null;if(id!==previousUser.current){setCandidates([]);previousUser.current=id;}},[account.snapshot?.profile.id]);
  useEffect(()=>{const sync=()=>setBrowserFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',sync);return()=>document.removeEventListener('fullscreenchange',sync);},[]);
  const fullscreen=immersive||browserFullscreen;
  const toggleFullscreen=async()=>{if(fullscreen){if(document.fullscreenElement)await document.exitFullscreen();setImmersive(false);return;}try{if(!sceneRoot.current?.requestFullscreen)throw new Error();await sceneRoot.current.requestFullscreen();}catch{setImmersive(true);}};
  useEffect(()=>{const pop=()=>setView(location.pathname==='/settings'?'settings':'window');window.addEventListener('popstate',pop);return ()=>window.removeEventListener('popstate',pop);},[]);
  const navigate=(next:'settings'|'window')=>{if(next==='settings'){void conversation.stop();if(document.fullscreenElement)void document.exitFullscreen();setImmersive(false);}history.pushState({},'',next==='settings'?'/settings':'/');setView(next);};
  const labels={morning:'朝のひととき',day:'昼のひととき',evening:'夕暮れのひととき',night:'夜のひととき'};
  const character:CharacterState=approaching?'WALKING':conversation.state==='SPEAKING'?'SPEAKING':conversation.state==='LISTENING'?'LISTENING':conversation.state==='CONNECTING'?'TURN':windowState.state;
  const conversationLabel={IDLE:'会話を始める',GREETING:'ご挨拶しています',CONNECTING:'接続しています',LISTENING:'お話を聞いています',SPEAKING:'お返事しています',DISCONNECTING:'会話を終了しています'};
  if(view==='settings')return <Management account={account} candidates={candidates} onDismiss={index=>setCandidates(current=>current.filter((_,i)=>i!==index))} onBack={()=>navigate('window')}/>;
  return <main ref={sceneRoot} className={`scene-main${immersive?' immersive':''}${conversationFocus?' conversation-mode':''}`}>
    {isDemo && <div className="demo-banner"><span>体験デモ · AI会話と決済は模擬動作です</span><button onClick={()=>navigate('settings')}>{account.snapshot?`${account.snapshot.profile.name} · 設定`:'アカウントを選ぶ'}</button></div>}
    <button className="fullscreen-toggle" onClick={()=>void toggleFullscreen()} aria-label={fullscreen?'全画面を終了':'全画面で表示'}>{fullscreen?'全画面を終了':'全画面'}</button>
    <header><h1>思い出の窓</h1><p>{labels[windowState.time]}</p></header>
    <section className={`scene-interaction${conversationFocus?' conversation-focused':''}${approaching?' conversation-approaching':''}`}>
      <button className="window" aria-label={single?'窓をノックする。一度タップしてください':'窓をノックする。二度ゆっくりタップしてください。キーボードではEnterまたはスペース'} onClick={event=>{if(event.detail===0)windowState.knock();else windowState.tap();}}>
        <WindowScene state={character} time={windowState.time} season={windowState.season} weather={weather.kind}/>
      </button>
      <WallClock />
      <button className="scene-hotspot television-hotspot" aria-label="思い出のテレビを開く" onClick={()=>{void conversation.stop();setMedia('television');}}/>
      <button className="scene-hotspot radio-hotspot" aria-label="思い出のラジオを開く" onClick={()=>{void conversation.stop();setMedia('radio');}}/>
    </section>
    <div className="greeting" role="status" aria-live="polite">{conversation.reply || windowState.message || 'ここで、ゆっくり。'}{windowState.audioFailed && <small>音声を再生できませんでした。ご挨拶を文字でお届けします。</small>}</div>
    <section className="conversation-controls" aria-label="会話の操作">
      {!conversation.active?<button onClick={()=>{if(!account.snapshot)navigate('settings');else void conversation.start();}}>会話を始める</button>:<><p>{conversationLabel[conversation.state]}</p><button onClick={()=>void conversation.stop()}>会話を終える</button></>}
      {conversation.error && <p role="alert">{conversation.error}</p>}
      {conversation.active && isDemo && <form className="demo-conversation" onSubmit={event=>{event.preventDefault();conversation.sayDemo(demoText);setDemoText('');}}><label>デモのお話（録音・外部AI送信はしません）<input value={demoText} maxLength={4000} placeholder="例：電球が切れたんです" onChange={e=>setDemoText(e.target.value)}/></label><button disabled={approaching||!demoText.trim()}>お話を送る</button><div className="button-row"><button type="button" disabled={approaching} onClick={()=>conversation.sayDemo('電球が切れたんです')}>「電球が切れた」と話す</button><button type="button" disabled={approaching} onClick={()=>conversation.sayDemo('買い物に行きづらいんです')}>「買い物が大変」と話す</button></div></form>}
      {conversation.active && !isDemo && <><p className="quiet-note">会話中だけマイクを利用し、音声をOpenAIへ送信します。全文や音声をアプリに保存しません。</p></>}
      <audio ref={conversation.audioRef} hidden={!conversation.active || isDemo} controls autoPlay/>
      {candidates.length>0 && <button className="candidate-link" onClick={()=>navigate('settings')}>お手伝いの候補を確認（{candidates.length}件）</button>}
    </section>
    <nav className="content-actions" aria-label="思い出のコンテンツ"><button onClick={()=>{void conversation.stop();setMedia('television');}}>テレビ</button><button onClick={()=>{void conversation.stop();setMedia('radio');}}>ラジオ</button><button onClick={()=>{void conversation.stop();setMedia('photos');}}>写真</button></nav>
    {media && <MemoryMedia kind={media} onClose={()=>setMedia(null)}/>}
    {platformError && <p role="status">{platformError}</p>}
    <footer><p>{single?'窓に一度ふれると、ご挨拶します。':'窓を、ゆっくり二度ノックしてみてください。'}</p><p className="quiet-note">眺めるだけでも、大丈夫です。</p></footer>
    <WeatherControls weather={weather}/>
    <details className="settings"><summary>操作・音声の設定</summary><div><label><input type="checkbox" checked={single} onChange={e=>setSingle(e.target.checked)}/> 一度のタップでノックする</label><label>挨拶の音量 <input type="range" min="0" max="1" step="0.1" value={volume} onChange={e=>setVolume(Number(e.target.value))}/><span>{Math.round(volume*100)}%</span></label><p>設定はこの画面を閉じるまで有効です。</p><a href="/settings" onClick={event=>{event.preventDefault();navigate('settings');}}>アカウント・支援者・プライバシーの設定</a></div></details>
  </main>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
