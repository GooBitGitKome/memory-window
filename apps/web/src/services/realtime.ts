import { VoiceReply } from '@memory-window/api-contracts';
import type { ApiClient } from './api';
export interface VoiceCallbacks { onListening:()=>void;onSpeaking:()=>void;onInput:(text:string)=>void;onOutput:(text:string)=>void;onError:(message:string)=>void;onClosed:()=>void; }
export class RealtimeConnection {
  private pc:RTCPeerConnection|null=null;
  private mic:MediaStream|null=null;
  private events:RTCDataChannel|null=null;
  private audio:HTMLAudioElement;
  private sessionId:string|null=null;
  private abort=new AbortController();
  private closed=false;
  private closing:Promise<void>|null=null;
  constructor(private api:ApiClient,private callbacks:VoiceCallbacks,audio:HTMLAudioElement) {this.audio=audio;}
  async start() {
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('この端末ではマイクを利用できません。HTTPS接続とマイク権限を確認してください。');
    this.mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
    if(this.closed) {this.mic.getTracks().forEach(track=>track.stop());this.mic=null;return 0;}
    const pc=new RTCPeerConnection();this.pc=pc;
    this.mic.getTracks().forEach(track=>pc.addTrack(track,this.mic!));
    pc.ontrack=event=>{if(this.closed)return;this.audio.srcObject=event.streams[0]??new MediaStream([event.track]);void this.audio.play().catch(()=>this.callbacks.onError('音声の再生ボタンを押してください。'));};
    pc.onconnectionstatechange=()=>{ if(pc.connectionState==='failed' || pc.connectionState==='disconnected') {this.callbacks.onError('接続が切れました。もう一度会話を始められます。');void this.close();} };
    const events=pc.createDataChannel('oai-events');this.events=events;
    events.onopen=()=>this.callbacks.onListening();
    events.onclose=()=>{if(!this.closed) void this.close();};
    events.onmessage=event=>{
      try {
        if(typeof event.data!=='string' || event.data.length>65536)return;
        const value:unknown=JSON.parse(event.data);
        if(!value || typeof value!=='object' || !('type' in value) || typeof value.type!=='string')return;
        const data=value as Record<string,unknown>;
        if(data.type==='input_audio_buffer.speech_started') this.callbacks.onListening();
        if(data.type==='output_audio_buffer.started') this.callbacks.onSpeaking();
        if(data.type==='output_audio_buffer.stopped' || data.type==='output_audio_buffer.cleared') this.callbacks.onListening();
        if(data.type==='conversation.item.input_audio_transcription.completed' && typeof data.transcript==='string') this.callbacks.onInput(data.transcript.slice(0,4000));
        if(data.type==='response.output_audio_transcript.done' && typeof data.transcript==='string') this.callbacks.onOutput(data.transcript.slice(0,4000));
        if(data.type==='error') {this.callbacks.onError('会話でエラーが発生しました。再接続してください。');void this.close();}
      } catch {this.callbacks.onError('会話データを確認できませんでした。');void this.close();}
    };
    const offer=await pc.createOffer();await pc.setLocalDescription(offer);
    const result=VoiceReply.parse(await this.api.request('voice','POST',{sdp:offer.sdp},true,this.abort.signal));
    // Even if cancelled while the handshake was in flight, account for and end a created server session.
    this.sessionId=result.sessionId;
    if(this.closed) {await this.api.request('voice-end','POST',{sessionId:result.sessionId});return 0;}
    if(result.demo || !result.sdp) throw new Error('音声接続の応答を確認できませんでした。');
    await pc.setRemoteDescription({type:'answer',sdp:result.sdp});
    return result.maxSeconds;
  }
  close():Promise<void> {
    if(this.closing)return this.closing;
    this.closed=true;this.abort.abort();
    this.mic?.getTracks().forEach(track=>track.stop());this.mic=null;
    if(this.events){this.events.onmessage=null;this.events.onopen=null;this.events.onclose=null;this.events.close();this.events=null;}
    if(this.pc){this.pc.ontrack=null;this.pc.onconnectionstatechange=null;this.pc.close();this.pc=null;}
    this.audio.pause();this.audio.srcObject=null;
    const id=this.sessionId;this.sessionId=null;
    this.closing=Promise.resolve().then(async()=>{
      try {if(id) await this.api.request('voice-end','POST',{sessionId:id});}
      finally {this.callbacks.onClosed();}
    });return this.closing;
  }
}
