import { useState, type FormEvent } from 'react';
import { InviteReply, RedirectReply, type Need } from '@memory-window/api-contracts';
import type { NeedCandidate } from '@memory-window/core';
import type { Account } from '../application/useAccount';
import { isConfigured, isDemo } from '../services/api';

function NeedCard({ need, account }: {need:Need;account:Account}) {
  const [title,setTitle]=useState(need.title);const [description,setDescription]=useState(need.description);const [consent,setConsent]=useState(false);
  return <article className="need-card">
    <p className="eyebrow">{need.status==='shared'?'共有中':'自分だけに表示'} · 保存期限 {new Date(need.expiresAt).toLocaleDateString('ja-JP')}</p>
    <label>お願いの名前<input value={title} maxLength={80} onChange={e=>{setTitle(e.target.value);setConsent(false);}}/></label>
    <label>共有する内容<textarea value={description} maxLength={300} onChange={e=>{setDescription(e.target.value);setConsent(false);}}/></label>
    <button disabled={account.pending || !title.trim() || !description.trim()} onClick={()=>void account.run(()=>account.api.request('needs','PATCH',{id:need.id,title,description})).then(()=>setConsent(false))}>訂正して非公開で保存</button>
    {need.status==='draft' && <><label className="consent-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>この内容だけを、招待済みの支援者に共有することに同意します</label><button disabled={account.pending || !consent || title!==need.title || description!==need.description} onClick={()=>void account.run(()=>account.api.request('share','POST',{id:need.id,consent:true,revision:need.revision})).then(()=>setConsent(false))}>同意した内容を共有</button></>}
    {need.status==='shared' && <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.request('withdraw','POST',{id:need.id}))}>共有を撤回</button>}
    <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.request('needs','DELETE',{id:need.id}))}>このお願いを削除</button>
  </article>;
}
export function Management({account,candidates,onDismiss,onBack}:{account:Account;candidates:NeedCandidate[];onDismiss:(index:number)=>void;onBack:()=>void}) {
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [signup,setSignup]=useState(false);const [role,setRole]=useState('end_user');
  const [key,setKey]=useState('');const [invite,setInvite]=useState('');const [acceptCode,setAcceptCode]=useState('');const [notice,setNotice]=useState('');
  const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const login=(event:FormEvent)=>{event.preventDefault();void account.run(()=>account.api.login('',email,password,signup,role));};
  const state=account.snapshot;
  const request=async(endpoint:string,method='POST',data:unknown={})=>account.api.request(endpoint,method,data);
  const checkout=()=>void account.run(async()=>{
    const result=await request('checkout','POST',{confirm:true});
    if(isDemo){setNotice('模擬決済が完了しました。実際の料金は発生していません。');return;}
    const {url}=RedirectReply.parse(result);if(new URL(url).hostname!=='checkout.stripe.com')throw new Error('決済の送信先を確認できませんでした。');window.location.assign(url);
  });
  const portal=()=>void account.run(async()=>{
    const result=await request('portal','POST',{confirm:true});
    if(isDemo){setNotice('模擬サブスクリプションを解約しました。');return;}
    const {url}=RedirectReply.parse(result);if(new URL(url).hostname!=='billing.stripe.com')throw new Error('会員管理の送信先を確認できませんでした。');window.location.assign(url);
  });
  return <main className="management">
    <header className="panel-header"><div><p className="eyebrow">思い出の窓 · 設定と支援</p><h1>安心して使うために</h1></div><button onClick={onBack}>窓に戻る</button></header>
    {isDemo && <p className="demo-banner">デモ · アカウント、AI会話、決済は模擬動作です。実際の秘密鍵を入力しないでください。</p>}
    {isDemo && <button disabled={account.pending} onClick={()=>void account.run(async()=>{await account.logout();await account.api.request('demo/reset','POST',{confirm:true},false);setNotice('デモのデータを初期化しました。');},false)}>デモの全データを初期化</button>}
    {account.error && <p role="alert" className="notice">{account.error}</p>}{notice && <p role="status" className="notice">{notice}</p>}
    {!state && <section className="settings-card"><h2>アカウント</h2>
      {isDemo ? <><p>デモ用の役割を選んで、権限の違いを確認できます。</p><div className="button-row">
        <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.login('owner'))}>利用者として体験（Premium）</button>
        <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.login('free'))}>無料プランを体験</button>
        <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.login('caregiver'))}>招待する支援者として体験</button>
        <button disabled={account.pending} onClick={()=>void account.run(()=>account.api.login('stranger'))}>権限のない支援者として体験</button>
      </div></> : isConfigured ? <form onSubmit={login}>
        <label>メールアドレス<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label>パスワード<input type="password" autoComplete={signup?'new-password':'current-password'} required minLength={8} value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <label className="consent-check"><input type="checkbox" checked={signup} onChange={e=>setSignup(e.target.checked)}/>新しいアカウントを作る</label>
        {signup && <label>利用目的<select value={role} onChange={e=>setRole(e.target.value)}><option value="end_user">窓を利用する本人</option><option value="caregiver">招待を受ける支援者</option></select></label>}
        <button disabled={account.pending}>{signup?'確認メールを送る':'ログイン'}</button>
      </form> : <p>実接続はまだ設定されていません。デモ版は README の手順で起動できます。</p>}
    </section>}
    {state && <>
      <section className="settings-card"><h2>{state.profile.name}</h2><p>{state.profile.role==='caregiver'?'支援者':'利用者'} · {state.subscription.premium?'Premium':'Free'}</p><div className="button-row"><button disabled={account.pending} onClick={()=>void account.run(()=>account.refresh(),false)}>最新の情報を確認</button><button disabled={account.pending} onClick={()=>{setInvite('');setKey('');setNotice('');void account.logout();}}>ログアウト</button></div></section>
      {state.profile.role!=='caregiver' && <>
      <section className="settings-card"><h2>会員プラン</h2><p>窓とノックは無料です。AIとの会話はPremiumで利用できます。OpenAI利用料金は別契約です。</p><p>{isDemo?'デモの価格は0円です。実際の契約・決済は行いません。':'価格と請求条件は決済画面でご確認ください。'}</p><div className="button-row">{!state.subscription.premium?<button disabled={account.pending} onClick={checkout}>{isDemo?'Premiumを体験する（模擬決済）':'料金を確認して申し込む'}</button>:<button disabled={account.pending} onClick={portal}>{isDemo?'模擬プランを解約':'契約・解約を管理'}</button>}</div></section>
      <section className="settings-card"><h2>AI接続設定</h2><p>{state.keyRegistered?'接続キーは登録済みです。内容は表示しません。':'接続キーは未登録です。'}</p>
        {isDemo?<button disabled={account.pending} onClick={()=>void account.run(()=>request('key','POST',{key:'demo-key-placeholder'}))}>デモ用接続を登録</button>:<form onSubmit={e=>{e.preventDefault();void account.run(async()=>{try{return await request('key','POST',{key});}finally{setKey('');}});}}><label>OpenAI APIキー<input type="password" autoComplete="off" maxLength={512} required value={key} onChange={e=>setKey(e.target.value)}/></label><p>キーをサーバーへ送信し、暗号化して保存します。ブラウザには保存しません。</p><button disabled={account.pending || !key}>登録・更新</button></form>}
        <button disabled={account.pending || !state.keyRegistered} onClick={()=>void account.run(()=>request('key','DELETE'))}>接続キーを削除</button>
      </section>
      <section className="settings-card"><h2>利用時間</h2><p>今日の予約済み利用枠 {Math.ceil(state.dailyReservedSeconds/60)} 分 / {Math.ceil(state.dailyLimitSeconds/60)} 分</p><p>利用枠は接続開始時に確保します。短く終了しても当日の枠は戻りません。</p><p>{isDemo?'API使用量・請求額はデモでは発生しません。':'接続時間とAPIトークン数は利用状況です。正確な請求額はOpenAIの契約画面でご確認ください。'}</p>{state.usage.length>0 && <ul className="usage-list">{state.usage.slice(-8).reverse().map(item=><li key={item.id}>{new Date(item.startedAt).toLocaleString('ja-JP')} · {item.endedAt?`${item.durationSeconds}秒`:'接続中または終了確認待ち'} · APIトークン {item.inputTokens===null?'未確認':`${item.inputTokens} / ${item.outputTokens}`}</li>)}</ul>}</section>
      <section className="settings-card"><h2>支援者の招待と許可</h2><p>招待を受けた支援者には、あなたが同意したお願いだけを共有できます。会話全文は共有しません。</p><button disabled={account.pending} onClick={()=>void account.run(async()=>{const result=InviteReply.parse(await request('invite'));setInvite(result.code);},false)}>招待コードを作る</button>
        {invite && <label>24時間有効の招待コード<input readOnly value={invite} aria-label="招待コード"/><small>支援者にこのコードを渡してください。</small></label>}
        {state.grants.filter(grant=>grant.ownerId===state.profile.id).map(grant=><article key={grant.id} className="grant-row"><p>{grant.label} · {grant.active?'許可中':'許可を撤回済み'}</p>{grant.active && <button disabled={account.pending} onClick={()=>void account.run(()=>request('revoke-grant','POST',{id:grant.id}))}>支援者の許可を撤回</button>}</article>)}
      </section>
      <section className="settings-card"><h2>お手伝いの希望</h2><p>候補はAIやルールの推測です。内容を確認・訂正してから保存してください。保存後も、同意するまで共有されません。</p>
        {candidates.map((candidate,index)=><article key={`${candidate.title}-${index}`} className="candidate-card"><h3>{candidate.title}（候補）</h3><p>{candidate.description}</p><div className="button-row"><button disabled={account.pending} onClick={()=>void account.run(()=>request('needs','POST',candidate)).then(result=>{if(result)onDismiss(index);})}>候補を非公開で保存</button><button onClick={()=>onDismiss(index)}>この候補を破棄</button></div></article>)}
        <details><summary>自分でお願いを書く</summary><form onSubmit={e=>{e.preventDefault();void account.run(()=>request('needs','POST',{title,description})).then(result=>{if(result){setTitle('');setDescription('');}});}}><label>お願いの名前<input required maxLength={80} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>内容<textarea required maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label><button disabled={account.pending}>非公開で保存</button></form></details>
        {state.needs.map(need=><NeedCard key={`${need.id}-${need.title}-${need.description}`} need={need} account={account}/>)}
      </section>
      </>}
      {state.profile.role==='caregiver' && <>
        <section className="settings-card"><h2>本人からの招待</h2><form onSubmit={e=>{e.preventDefault();void account.run(()=>request('accept-invite','POST',{code:acceptCode.trim()})).then(result=>{if(result)setAcceptCode('');});}}><label>招待コード<input required value={acceptCode} onChange={e=>setAcceptCode(e.target.value)} autoComplete="off"/></label><button disabled={account.pending}>招待を受ける</button></form></section>
        <section className="settings-card"><h2>同意して共有されたお願い</h2><p>会話内容は表示しません。本人が共有を撤回すると、最新の一覧から取り除かれます。</p>{state.sharedNeeds.length===0?<p>共有されたお願いはありません。</p>:state.sharedNeeds.map(need=><article className="need-card" key={need.id}><h3>{need.title}</h3><p>{need.description}</p><small>保存期限 {new Date(need.expiresAt).toLocaleDateString('ja-JP')}</small></article>)}</section>
      </>}
    </>}
    <section className="settings-card"><h2>プライバシーと安心</h2><p>通常の会話全文や音声をアプリのデータベースに保存しません。本人が確認したお願いは30日で保存期限を迎え、訂正・削除・共有撤回ができます。</p><p>AIは人間ではなく、医療判断や緊急対応を保証しません。困ったときは身近な人や適切な窓口へ相談してください。</p><p>実会話では音声をOpenAIへ送信します。外部サービスのデータ保持条件はアプリの保存方針と別に適用されます。</p><a href="https://developers.openai.com/api/docs/guides/your-data" target="_blank" rel="noreferrer">OpenAIのデータ取り扱い</a></section>
  </main>;
}
