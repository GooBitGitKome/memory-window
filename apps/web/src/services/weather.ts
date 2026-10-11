import {weatherFromCode,type WeatherKind} from '@memory-window/core';
export type WeatherResult={kind:WeatherKind;fetchedAt:number;place:string};
export type Place={name:string;latitude:number;longitude:number};
const controllerTimeout=10000;
async function load(url:URL,signal:AbortSignal):Promise<unknown>{
  const timeout=AbortSignal.timeout(controllerTimeout);
  const response=await fetch(url,{signal:AbortSignal.any([signal,timeout]),cache:'no-store'});
  if(!response.ok)throw new Error('天候サービスへ接続できませんでした。');
  return response.json();
}
export async function searchPlaces(query:string,signal:AbortSignal):Promise<Place[]>{
  const name=query.trim();if(name.length<2 || name.length>80)throw new Error('地域名を2文字以上で入力してください。');
  const url=new URL('https://geocoding-api.open-meteo.com/v1/search');url.searchParams.set('name',name);url.searchParams.set('count','5');url.searchParams.set('language','ja');url.searchParams.set('format','json');
  const data=await load(url,signal);
  if(!data || typeof data!=='object' || !('results' in data) || !Array.isArray(data.results))return [];
  return data.results.flatMap((row:unknown)=>{
    if(!row || typeof row!=='object' || !('name' in row) || !('latitude' in row) || !('longitude' in row) || typeof row.name!=='string' || typeof row.latitude!=='number' || typeof row.longitude!=='number' || !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) || Math.abs(row.latitude)>90 || Math.abs(row.longitude)>180)return [];
    return [{name:row.name,latitude:row.latitude,longitude:row.longitude}];
  });
}
export async function fetchWeather(place:Place,signal:AbortSignal):Promise<WeatherResult>{
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude',(Math.round(place.latitude*10)/10).toFixed(1));url.searchParams.set('longitude',(Math.round(place.longitude*10)/10).toFixed(1));url.searchParams.set('current','weather_code');url.searchParams.set('forecast_days','1');
  const data=await load(url,signal);
  if(!data || typeof data!=='object' || !('current' in data) || !data.current || typeof data.current!=='object' || !('weather_code' in data.current) || typeof data.current.weather_code!=='number')throw new Error('天候データを確認できませんでした。');
  return {kind:weatherFromCode(data.current.weather_code),fetchedAt:Date.now(),place:place.name};
}
export function currentPosition():Promise<GeolocationPosition>{
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('この端末では位置情報を利用できません。地域を選んでください。'));return;}
    navigator.geolocation.getCurrentPosition(resolve,()=>reject(new Error('現在地を取得できませんでした。地域を選んでください。')),{enableHighAccuracy:false,maximumAge:30*60*1000,timeout:10000});
  });
}
