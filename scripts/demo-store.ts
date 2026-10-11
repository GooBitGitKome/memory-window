import { randomUUID, randomBytes } from 'node:crypto';
import { canReadNeed, hasPremium } from '../packages/core/src/index.ts';
import { DraftInput, ShareInput, type Snapshot, type Need, type Grant, type Usage } from '../packages/api-contracts/src/index.ts';

export class DemoError extends Error { constructor(public status: number, public code: string) { super(code); } }
const people = {
  owner: {id:'demo-owner',name:'窓の利用者',role:'end_user' as const},
  free: {id:'demo-free',name:'無料プランの利用者',role:'end_user' as const},
  caregiver: {id:'demo-caregiver',name:'招待する支援者',role:'caregiver' as const},
  stranger: {id:'demo-stranger',name:'権限のない支援者',role:'caregiver' as const},
};
export type DemoIdentity = keyof typeof people;
export class DemoStore {
  private tokens = new Map<string,{identity:DemoIdentity,expiresAt:number}>();
  private subscriptions = new Map<string,string>([['demo-owner','active']]);
  private keys = new Set<string>(['demo-owner']);
  private needs = new Map<string,Need>();
  private grants = new Map<string,Grant>();
  private invites = new Map<string,{ownerId:string,expiresAt:number}>();
  private usage = new Map<string,Usage & {ownerId:string}>();
  login(identity: string) {
    if (!Object.hasOwn(people,identity)) throw new DemoError(400,'invalid_identity');
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token,{identity:identity as DemoIdentity,expiresAt:Date.now()+3600000});
    return {token};
  }
  private user(token: string) {
    const session = this.tokens.get(token);
    if (!session || session.expiresAt <= Date.now()) throw new DemoError(401,'unauthorized');
    return people[session.identity];
  }
  logout(token: string) { this.tokens.delete(token); return {ok:true}; }
  snapshot(token: string): Snapshot {
    const user = this.user(token); const now = Date.now();
    const usage = [...this.usage.values()].filter(item => item.ownerId===user.id);
    const day = new Date().toISOString().slice(0,10);
    return {
      profile:user,subscription:{status:this.subscriptions.get(user.id)??'free',premium:hasPremium(this.subscriptions.get(user.id)??'free')},
      keyRegistered:this.keys.has(user.id),dailyLimitSeconds:1800,dailyReservedSeconds:usage.filter(item => item.startedAt.startsWith(day)).reduce((sum,item)=>sum+item.reservedSeconds,0),
      needs:[...this.needs.values()].filter(item => item.ownerId===user.id && Date.parse(item.expiresAt)>now),
      sharedNeeds:[...this.needs.values()].filter(item => item.ownerId!==user.id && canReadNeed(item.ownerId,user.id,item.status==='shared',[...this.grants.values()].some(grant => grant.active && grant.ownerId===item.ownerId && grant.caregiverId===user.id),Date.parse(item.expiresAt),now)),
      grants:[...this.grants.values()].filter(grant => grant.ownerId===user.id || grant.caregiverId===user.id),
      usage:usage.map(({ownerId:_,...item}) => item),
    };
  }
  private owner(token:string) {
    const user = this.user(token);
    if (user.role!=='end_user') throw new DemoError(403,'owner_required');
    return user;
  }
  private ownedNeed(token:string,id:string) {
    const user = this.owner(token); const need = this.needs.get(id);
    if (!need || need.ownerId!==user.id || Date.parse(need.expiresAt)<=Date.now()) throw new DemoError(404,'not_found');
    return need;
  }
  saveDraft(token:string,input:unknown,id?:string) {
    const user=this.owner(token); const parsed=DraftInput.safeParse(input);
    if (!parsed.success) throw new DemoError(400,'invalid_input');
    if (id) {
      const need=this.ownedNeed(token,id);
      // Editing withdraws previous consent; sharing requires confirmation again.
      Object.assign(need,parsed.data,{status:'draft',revision:need.revision+1}); return {id};
    }
    if ([...this.needs.values()].filter(need=>need.ownerId===user.id).length>=50) throw new DemoError(429,'limit_reached');
    const need:Need={id:randomUUID(),ownerId:user.id,...parsed.data,status:'draft',revision:1,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+30*86400000).toISOString()};
    this.needs.set(need.id,need); return {id:need.id};
  }
  share(token:string,input:unknown) {
    const parsed=ShareInput.safeParse(input); if(!parsed.success) throw new DemoError(400,'consent_required');
    const need=this.ownedNeed(token,parsed.data.id);
    if(need.revision!==parsed.data.revision) throw new DemoError(409,'revision_mismatch');
    if (![...this.grants.values()].some(g=>g.ownerId===need.ownerId && g.active)) throw new DemoError(409,'caregiver_required');
    need.status='shared'; return {ok:true};
  }
  withdraw(token:string,id:string) { this.ownedNeed(token,id).status='draft'; return {ok:true}; }
  deleteNeed(token:string,id:string) { this.ownedNeed(token,id); this.needs.delete(id); return {ok:true}; }
  invite(token:string) {
    const user=this.owner(token); const code=randomBytes(24).toString('hex'); const expiresAt=Date.now()+86400000;
    this.invites.set(code,{ownerId:user.id,expiresAt}); return {code,expiresAt:new Date(expiresAt).toISOString()};
  }
  acceptInvite(token:string,code:string) {
    const user=this.user(token); const invite=this.invites.get(code);
    if (!invite || invite.expiresAt<=Date.now() || invite.ownerId===user.id || user.role!=='caregiver') throw new DemoError(400,'invalid_invite');
    const existing=[...this.grants.values()].find(g=>g.ownerId===invite.ownerId && g.caregiverId===user.id);
    const grant:Grant={id:existing?.id??randomUUID(),ownerId:invite.ownerId,caregiverId:user.id,label:user.name,active:true};
    this.grants.set(grant.id,grant); this.invites.delete(code); return {ok:true};
  }
  revokeGrant(token:string,id:string) {
    const user=this.owner(token); const grant=this.grants.get(id);
    if(!grant || grant.ownerId!==user.id) throw new DemoError(404,'not_found');
    grant.active=false;
    for (const need of this.needs.values()) if(need.ownerId===user.id) need.status='draft';
    return {ok:true};
  }
  setKey(token:string,key:string|null) {
    const user=this.owner(token);
    if(key!==null && key!=='demo-key-placeholder') throw new DemoError(400,'demo_keys_only');
    if(key===null) this.keys.delete(user.id); else this.keys.add(user.id); return {ok:true};
  }
  purchase(token:string) { const user=this.owner(token); this.subscriptions.set(user.id,'active'); return {ok:true}; }
  cancelSubscription(token:string) { const user=this.owner(token); this.subscriptions.set(user.id,'canceled'); return {ok:true}; }
  startVoice(token:string) {
    const state=this.snapshot(token); this.owner(token);
    if(!state.subscription.premium) throw new DemoError(403,'premium_required');
    if(!state.keyRegistered) throw new DemoError(409,'key_required');
    const active=state.usage.some(item=>!item.endedAt && Date.now()-Date.parse(item.startedAt)<300000);
    if(active) throw new DemoError(409,'session_active');
    if(state.dailyReservedSeconds+300>state.dailyLimitSeconds) throw new DemoError(429,'limit_reached');
    const sessionId=randomUUID();
    this.usage.set(sessionId,{id:sessionId,ownerId:state.profile.id,startedAt:new Date().toISOString(),endedAt:null,reservedSeconds:300,durationSeconds:0,inputTokens:null,outputTokens:null});
    return {sessionId,maxSeconds:300,demo:true};
  }
  endVoice(token:string,id:string) {
    const user=this.user(token); const item=this.usage.get(id);
    if(!item || item.ownerId!==user.id) throw new DemoError(404,'not_found');
    if(!item.endedAt) { item.endedAt=new Date().toISOString(); item.durationSeconds=Math.min(item.reservedSeconds,Math.ceil((Date.now()-Date.parse(item.startedAt))/1000)); }
    return {ok:true};
  }
}
