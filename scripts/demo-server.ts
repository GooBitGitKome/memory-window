import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { DemoStore, DemoError } from './demo-store.ts';

const port=Number(process.env.DEMO_PORT??4174);
if(!Number.isInteger(port) || port<1024 || port>65535) throw new Error('Invalid DEMO_PORT');
const root=resolve('apps/web/dist-demo');
let store=new DemoStore();
const contentTypes:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
function respond(res:ServerResponse,status:number,body:unknown) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));
}
async function body(req:IncomingMessage):Promise<Record<string,unknown>> {
  let text='';for await(const chunk of req) { text+=String(chunk);if(Buffer.byteLength(text)>65536) throw new DemoError(413,'too_large'); }
  if(!text) return {};
  try { const result:unknown=JSON.parse(text);if(!result || typeof result!=='object' || Array.isArray(result)) throw new Error();return result as Record<string,unknown>; } catch { throw new DemoError(400,'invalid_json'); }
}
function field(data:Record<string,unknown>,key:string) { if(typeof data[key]!=='string') throw new DemoError(400,'invalid_input'); return data[key]; }
const server=createServer((req,res) => { void (async()=>{
  try {
    const expectedHosts=[`localhost:${port}`,`127.0.0.1:${port}`];
    if(!expectedHosts.includes(req.headers.host??'')) throw new DemoError(403,'invalid_host');
    if(req.headers.origin && !expectedHosts.some(host=>req.headers.origin===`http://${host}`)) throw new DemoError(403,'invalid_origin');
    const url=new URL(req.url??'/',`http://127.0.0.1:${port}`);
    if(url.pathname.startsWith('/api/')) {
      const route=url.pathname.slice(5);const token=(req.headers.authorization??'').replace(/^Bearer /,'');
      const data=req.method==='GET'?{}:await body(req);
      let result:unknown;
      if(route==='demo/login' && req.method==='POST') result=store.login(field(data,'identity'));
      else if(route==='demo/reset' && req.method==='POST') {if(data.confirm!==true)throw new DemoError(400,'確認が必要です');store=new DemoStore();result={ok:true};}
      else if(route==='logout' && req.method==='POST') result=store.logout(token);
      else if(route==='state' && req.method==='GET') result=store.snapshot(token);
      else if(route==='needs' && req.method==='POST') result=store.saveDraft(token,data);
      else if(route==='needs' && req.method==='PATCH') result=store.saveDraft(token,{title:data.title,description:data.description},field(data,'id'));
      else if(route==='needs' && req.method==='DELETE') result=store.deleteNeed(token,field(data,'id'));
      else if(route==='share' && req.method==='POST') result=store.share(token,data);
      else if(route==='withdraw' && req.method==='POST') result=store.withdraw(token,field(data,'id'));
      else if(route==='invite' && req.method==='POST') result=store.invite(token);
      else if(route==='accept-invite' && req.method==='POST') result=store.acceptInvite(token,field(data,'code'));
      else if(route==='revoke-grant' && req.method==='POST') result=store.revokeGrant(token,field(data,'id'));
      else if(route==='key' && req.method==='POST') result=store.setKey(token,field(data,'key'));
      else if(route==='key' && req.method==='DELETE') result=store.setKey(token,null);
      else if(route==='checkout' && req.method==='POST' && data.confirm===true) result=store.purchase(token);
      else if(route==='portal' && req.method==='POST' && data.confirm===true) result=store.cancelSubscription(token);
      else if(route==='voice' && req.method==='POST') result=store.startVoice(token);
      else if(route==='voice-end' && req.method==='POST') result=store.endVoice(token,field(data,'sessionId'));
      else throw new DemoError(404,'not_found');
      respond(res,200,result);return;
    }
    if(req.method!=='GET' && req.method!=='HEAD') throw new DemoError(405,'method_not_allowed');
    let path=resolve(root,`.${decodeURIComponent(url.pathname)}`);
    if(path!==root && !path.startsWith(root+sep)) throw new DemoError(404,'not_found');
    if(path===root || !extname(path)) path=resolve(root,'index.html');
    const file=await readFile(path).catch(()=>{throw new DemoError(404,'not_found');});
    res.writeHead(200,{'Content-Type':contentTypes[extname(path)]??'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':url.pathname.includes('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
    res.end(req.method==='HEAD'?undefined:file);
  } catch(error) {if(error instanceof DemoError) respond(res,error.status,{error:error.code});else respond(res,500,{error:'internal_error'});}
})(); });
server.listen(port,'127.0.0.1',()=>console.log(`Memory Window DEMO: http://localhost:${port}/ — simulated accounts/AI/payments, no external requests.`));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>process.exit(0)));
