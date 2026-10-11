import {useState,type FormEvent} from 'react';
import type {useWeather} from '../application/useWeather';
import {isDemo} from '../services/api';
const names={unknown:'不明',sunny:'晴れ',cloudy:'曇り',rainy:'雨',snowy:'雪',foggy:'霧',stormy:'雷雨'} as const;
export function WeatherControls({weather}:{weather:ReturnType<typeof useWeather>}){
  const [query,setQuery]=useState('');
  const status=weather.result?`${weather.result.place} · ${names[weather.kind]}${weather.mode==='demo'?'（模擬）':''}${weather.stale?'（更新できていません）':''}`:'天候連動は停止中です。';
  return <details className="settings weather-settings"><summary>外の天候</summary><div>
    <p role="status">{status}</p>
    <p>現在地を使うと、おおよその位置（約0.1度に丸めた座標）をOpen-Meteoへ送信します。端末の位置情報の許可は、下のボタンを押した時に求めます。IPアドレスも通信先へ伝わります。地域検索では入力した地域名を送信します。設定と結果はこの画面を閉じるまで有効です。</p>
    <div className="weather-actions"><button disabled={weather.busy} onClick={()=>void weather.locate()}>現在地の天候を表示</button><button onClick={weather.off}>天候連動を停止</button></div>
    <form onSubmit={(event:FormEvent)=>{event.preventDefault();void weather.search(query);}}><label>地域を選ぶ<input value={query} maxLength={80} onChange={event=>setQuery(event.target.value)} placeholder="例：東京"/></label><button disabled={weather.busy || query.trim().length<2}>地域を検索</button></form>
    {weather.places.length>0&&<div className="weather-actions" aria-label="地域の検索結果">{weather.places.map((place,index)=><button key={`${place.name}-${index}`} disabled={weather.busy} onClick={()=>void weather.update(place)}>{place.name}</button>)}</div>}
    {isDemo&&<div className="weather-actions" aria-label="模擬天候">{(['sunny','cloudy','rainy','snowy','foggy','stormy'] as const).map(kind=><button key={kind} onClick={()=>weather.simulate(kind)}>{names[kind]}を試す</button>)}</div>}
    {weather.busy&&<p role="status">地域の天候を確認しています。</p>}{weather.error&&<p role="alert">{weather.error}</p>}
    {weather.mode==='real'&&weather.result&&<p className="quiet-note">最終更新：{new Date(weather.result.fetchedAt).toLocaleString('ja-JP')}。30分ごとに更新します。天候は地域の推定値です。</p>}
  </div></details>;
}
