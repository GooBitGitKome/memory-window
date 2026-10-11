import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
const directory='apps/web/public/samples';await mkdir(directory,{recursive:true});
const line='fill="white" stroke="#222" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
const landscapes=[
  ['spring','春の小道','<path d="M130 260q-20 -40 10 -60q30 -35 55 0q25 30 -10 60Z"/><path d="M155 262v65M140 330q155 -15 250 0M240 325q50 -65 80 -130"/><circle cx="480" cy="90" r="27"/>'],
  ['summer','夏の川辺','<path d="M0 290q140 -50 250 0t390 0M0 330q170 -50 280 0t370 0M85 240v45M58 250q23 -50 30 -50q8 -5 25 50"/><circle cx="480" cy="90" r="27"/>'],
  ['winter','冬の静かな丘','<path d="M0 280q160 -80 320 0t320 0M70 285v-70M40 240l30 -70l32 70ZM480 90h20m-10 -10v20M340 160h16m-8 -8v16M180 110h16m-8 -8v16"/>'],
] as const;
for(const [name,title,paths] of landscapes)await writeFile(`${directory}/${name}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="${title}"><rect width="640" height="360" fill="white"/><g ${line}>${paths}</g></svg>`);
// An original quiet chime synthesized locally, not a recording or commercial music.
const rate=16000;const count=rate*8;const wav=Buffer.alloc(44+count*2);
wav.write('RIFF',0);wav.writeUInt32LE(36+count*2,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(count*2,40);
for(let i=0;i<count;i++){const t=i/rate;const envelope=Math.sin(Math.PI*t/8)**2;const chime=(Math.sin(2*Math.PI*440*t)*Math.exp(-t%2)+0.3*Math.sin(2*Math.PI*660*t))*0.025*envelope;wav.writeInt16LE(Math.round(chime*32767),44+i*2);}
await writeFile(`${directory}/quiet-chime.wav`,wav);
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();
  await page.addInitScript('window.__name = (value) => value');
  await page.goto('about:blank');
  const data=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;document.body.append(canvas);
    const ctx=canvas.getContext('2d')!;const stream=canvas.captureStream(10);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8',videoBitsPerSecond:100000});
    const chunks:Blob[]=[];recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
    const finished=new Promise<Blob>(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:'video/webm'}));});
    let frame=0;
    const draw=()=>{
      ctx.fillStyle='#fff';ctx.fillRect(0,0,640,360);ctx.strokeStyle='#222';ctx.lineWidth=4;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(0,300);ctx.quadraticCurveTo(320,270,640,300);ctx.stroke();
      ctx.beginPath();ctx.arc(510,90,25,0,Math.PI*2);ctx.stroke();
      ctx.beginPath();ctx.moveTo(70,282);ctx.lineTo(70,215);ctx.moveTo(40,225);ctx.quadraticCurveTo(70,155,100,225);ctx.stroke();
      const x=140+frame*1.5;ctx.strokeRect(x,230,190,55);
      for(let i=0;i<4;i++)ctx.strokeRect(x+14+i*45,240,26,20);
      for(const dx of [30,150]){ctx.beginPath();ctx.arc(x+dx,290,10,0,Math.PI*2);ctx.stroke();}
      frame++;
    };
    draw();recorder.start();const timer=setInterval(draw,100);await new Promise(resolve=>setTimeout(resolve,6000));clearInterval(timer);recorder.stop();
    const blob=await finished;stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  await writeFile(`${directory}/quiet-train.webm`,Buffer.from(data));
}finally{await browser.close();}
console.log('Original monochrome landscapes, quiet train video and synthetic chime generated.');
