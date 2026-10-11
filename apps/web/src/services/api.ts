import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Snapshot, TokenReply } from '@memory-window/api-contracts';
export const isDemo = import.meta.env.MODE === 'demo';
const supabaseUrl=import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publicKey=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const isConfigured=isDemo || Boolean(supabaseUrl && publicKey);
const messages:Record<string,string>={
  revision_mismatch:'内容が更新されました。最新の内容を確認して、もう一度同意してください。',unauthorized:'ログインしてください。',premium_required:'会話にはPremiumプランが必要です。',key_required:'先にAPI接続を設定してください。',
  limit_reached:'今日の利用上限に達しました。また明日お話ししましょう。',session_active:'すでに会話中です。終了してから再試行してください。',
  caregiver_required:'先に支援者を招待してください。',consent_required:'共有する内容と同意を確認してください。',
  invalid_invite:'招待コードが無効か、期限が切れています。',invalid_input:'入力内容を確認してください。',not_found:'対象が見つかりません。権限と最新の表示を確認してください。',
  demo_keys_only:'デモでは実際のAPIキーを入力しないでください。',provider_unavailable:'接続先が応答しませんでした。しばらくしてから再試行してください。',
  voice_disabled:'実接続の利用制限が未設定です。管理者による設定が必要です。',payment_disabled:'決済が未設定です。',owner_required:'この操作は利用者本人のアカウントで行ってください。',
};
export class ApiError extends Error { constructor(public code:string,public status:number) { super(messages[code]??'処理できませんでした。接続を確認して再試行してください。'); } }
export class ApiClient {
  private token='';
  private version=0;
  get sessionVersion(){return this.version;}
  private auth:SupabaseClient|null=null;
  private getAuth() {
    if(!supabaseUrl || !publicKey) throw new ApiError('not_configured',503);
    this.auth??=createClient(supabaseUrl,publicKey,{auth:{persistSession:false,autoRefreshToken:true,detectSessionInUrl:false}});
    return this.auth;
  }
  async login(identity:string,email='',password='',signup=false,role='end_user') {
    if(isDemo) { this.token=TokenReply.parse(await this.request('demo/login','POST',{identity},false)).token;this.version++;return; }
    const auth=this.getAuth();
    const result=signup?await auth.auth.signUp({email,password,options:{data:{role}}}):await auth.auth.signInWithPassword({email,password});
    if(result.error) throw new Error('ログインできませんでした。入力内容・確認メール・アカウント設定を確認してください。');
    if(!result.data.session) throw new Error('確認メールを開いてからログインしてください。');
    this.token=result.data.session.access_token;this.version++;
  }
  async logout() {
    try { if(isDemo && this.token) await this.request('logout','POST',{});else if(this.auth) { const {error}=await this.auth.auth.signOut({scope:'local'});if(error) throw new ApiError('logout_failed',500); } }
    finally { this.token='';this.version++; }
  }
  async request(endpoint:string,method='GET',body?:unknown,authenticated=true,signal?:AbortSignal):Promise<unknown> {
    if(!isConfigured) throw new ApiError('not_configured',503);
    if(!isDemo && authenticated) {
      const {data:{session},error}=await this.getAuth().auth.getSession();
      if(error || !session) throw new ApiError('unauthorized',401);
      this.token=session.access_token;
    }
    if(authenticated && !this.token) throw new ApiError('unauthorized',401);
    const path=isDemo?`/api/${endpoint}`:`${supabaseUrl}/functions/v1/memory-window/${endpoint}`;
    const controller=new AbortController();const abort=()=>controller.abort(); signal?.addEventListener('abort',abort,{once:true});
    if(signal?.aborted) controller.abort();
    const timer=setTimeout(abort,20000);
    try {
      const response=await fetch(path,{method,headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`} : {}),...(!isDemo?{apikey:publicKey!}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
      const data:unknown=await response.json();
      if(!response.ok) { const code=data && typeof data==='object' && 'error' in data && typeof data.error==='string'?data.error:'request_failed';throw new ApiError(code,response.status); }
      return data;
    } catch(error) { if(error instanceof ApiError) throw error; if(signal?.aborted) throw error; throw new ApiError('provider_unavailable',503); }
    finally { clearTimeout(timer);signal?.removeEventListener('abort',abort); }
  }
  async snapshot() { return Snapshot.parse(await this.request('state')); }
}
