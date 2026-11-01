const cv=document.getElementById('c');let ctx=cv.getContext('2d');const mainCtx=ctx;
const lvlEl=document.getElementById('lvl'),progbar=document.getElementById('progbar'),win=document.getElementById('win');
let W,H,D;
let dirty=true,lastPct=-1;
function resize(){
  D=Math.min(2,window.devicePixelRatio||1);W=innerWidth;H=innerHeight;
  cv.width=W*D;cv.height=H*D;
  if(window.__ready)buildLayers();
  dirty=true;
}
addEventListener('resize',resize);addEventListener('orientationchange',()=>setTimeout(resize,150));

const COLORS=['#00f0ff','#ff2bd6','#7cff4f','#ffb300','#8a5cff','#ff4d6d','#2dffb2'];
const DIRS=[[0,-1],[1,0],[0,1],[-1,0]];
let level=1,L,color,pos,painted,count,total,hist=[],anim=null,won=false;

function slide(g,r,c,d){
  const p=[];let y=r,x=c;
  for(;;){
    const ny=y+DIRS[d][1],nx=x+DIRS[d][0];
    if(ny<0||nx<0||ny>=g.length||nx>=g[0].length||g[ny][nx])break;
    y=ny;x=nx;p.push([y,x]);
  }
  return p;
}

// Formatos de casa (máscara: true = parte da casa)
const SHAPES=[
 {n:'CASA',f:()=>true},
 {n:'CASA EM L',f:(r,c,R,C)=>c<Math.ceil(C*.45)||r>=Math.floor(R*.5)},
 {n:'TORRE CENTRAL',f:(r,c,R,C)=>Math.abs(c-(C-1)/2)<=C*.2||r>=Math.floor(R*.45)},
 {n:'PIRÂMIDE',f:(r,c,R,C)=>{const t=Math.floor(C/2)-1,i=Math.max(0,t-Math.floor(r*(t+1)/(R*.6)));return c>=i&&c<C-i}},
 {n:'CASTELO',f:(r,c)=>r>0||c%2===0},
 {n:'CASA EM U',f:(r,c,R,C)=>!(r<R*.45&&c>=Math.floor(C/3)&&c<C-Math.floor(C/3))},
 {n:'IGREJA',f:(r,c,R,C)=>Math.abs(c-(C-1)/2)<=C*.17||(r>=Math.floor(R*.3)&&r<Math.floor(R*.55))},
 {n:'ESCADARIA',f:(r,c,R,C)=>r>=R-Math.round(R*.4+R*.6*c/(C-1))},
 {n:'TORRES GÊMEAS',f:(r,c,R,C)=>c<Math.floor(C*.3)||c>=C-Math.floor(C*.3)||r>=Math.floor(R*.4)},
 {n:'MANSÃO',f:(r,c,R,C)=>{const m=Math.abs(c-(C-1)/2);return (m<=1&&r>=0)||(m<=C*.35&&r>=Math.floor(R*.25))||r>=Math.floor(R*.5)}}
];
let lastShape=-1;
function pickShape(lv){
  if(lv===1){lastShape=0;return SHAPES[0]}
  let i;do{i=1+(Math.random()*(SHAPES.length-1)|0)}while(i===lastShape);
  lastShape=i;return SHAPES[i];
}

// Gera fases sempre solucionáveis: uma caminhada aleatória define as paredes; o resto vira obstáculo
function gen(lv){
  const cols=7+2*Math.min(2,lv>>2),rows=9+Math.min(4,lv>>1);
  const sh=pickShape(lv),flip=Math.random()<.5;
  const m=Array.from({length:rows},(_,r)=>Array.from({length:cols},(_,c)=>!!sh.f(r,flip?cols-1-c:c,rows,cols)));
  let best=null;const t0=performance.now();
  for(let a=0;a<300;a++){
    if(best&&performance.now()-t0>90)break;
    const dens=.08+Math.random()*.1;
    const g=m.map(row=>row.map(v=>v?(Math.random()<dens?1:0):1));
    const free=[];
    g.forEach((row,r)=>row.forEach((v,c)=>{if(!v)free.push([r,c])}));
    if(free.length<20)continue;
    const start=free[Math.random()*free.length|0];
    let [r,c]=start;
    const vis=new Set([r+','+c]);
    const target=Math.floor(free.length*(.72+Math.min(.15,lv*.01)));
    for(let i=0;i<800&&vis.size<target;i++){
      const opts=[0,1,2,3].map(d=>({d,p:slide(g,r,c,d)})).filter(o=>o.p.length);
      if(!opts.length)break;
      let pick;
      if(Math.random()<.7){
        opts.forEach(o=>o.n=o.p.filter(q=>!vis.has(q[0]+','+q[1])).length+Math.random());
        pick=opts.reduce((x,y)=>y.n>x.n?y:x);
      }else pick=opts[Math.random()*opts.length|0];
      pick.p.forEach(q=>vis.add(q[0]+','+q[1]));
      [r,c]=pick.p[pick.p.length-1];
    }
    if(!best||vis.size>best.vis.size)best={vis,start};
    if(vis.size>=target*.9)break;
  }
  const {vis,start}=best;
  const g2=m.map((row,y)=>row.map((v,x)=>vis.has(y+','+x)?0:1));
  const t=g2.map(row=>row.map(()=>{const k=Math.random();return k<.5?0:k<.65?1:k<.8?2:3}));
  return{g:g2,m,t,start,rows,cols,total:vis.size,name:sh.n};
}

function newLevel(){
  L=gen(level);color=COLORS[(level-1)%COLORS.length];
  lvlEl.textContent='NÍVEL '+level+' · '+L.name;
  resetLevel();buildLayers();
}
function resetLevel(){
  pos={r:L.start[0],c:L.start[1]};
  painted=L.g.map(row=>row.map(()=>false));
  painted[pos.r][pos.c]=true;count=1;total=L.total;
  hist=[];anim=null;won=false;win.classList.remove('on');dirty=true;
}

function move(d){
  if(anim||won)return;
  const p=slide(L.g,pos.r,pos.c,d);
  if(!p.length)return;
  hist.push({pos:{...pos},painted:painted.map(r=>r.slice()),count});
  anim={p,d,t:0,from:{...pos},k:0};dirty=true;
}
function undo(){
  if(anim||won||!hist.length)return;
  const h=hist.pop();pos=h.pos;painted=h.painted;count=h.count;dirty=true;
}

function tick(dt){
  if(!anim)return;
  anim.t+=dt*13;
  const n=anim.p.length;
  while(anim.k<n&&anim.t>=anim.k+.5){
    const [r,c]=anim.p[anim.k];
    if(!painted[r][c]){painted[r][c]=true;count++;burst(r,c)}
    anim.k++;
  }
  if(anim.t>=n){
    const [r,c]=anim.p[n-1];pos={r,c};anim=null;
    if(count>=total){won=true;setTimeout(()=>win.classList.add('on'),350)}
  }
}

function rr(x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):ctx.rect(x,y,w,h)}

let parts=[],G={};
function burst(r,c){
  for(let i=0;i<4&&parts.length<60;i++)parts.push({x:c+.5,y:r+.5,vx:(Math.random()-.5)*5,vy:(Math.random()-.5)*5,l:1});
}

function drawItem(t,x,y,s){
  ctx.save();
  if(t===0){ // janela holográfica
    ctx.shadowColor='#00f0ff';ctx.shadowBlur=s*.2;
    ctx.fillStyle='rgba(0,240,255,.18)';ctx.fillRect(x+s*.2,y+s*.15,s*.6,s*.7);
    ctx.strokeStyle='#00f0ff';ctx.lineWidth=Math.max(1.5,s*.04);ctx.strokeRect(x+s*.2,y+s*.15,s*.6,s*.7);
    ctx.shadowBlur=0;ctx.beginPath();ctx.moveTo(x+s*.5,y+s*.15);ctx.lineTo(x+s*.5,y+s*.85);ctx.moveTo(x+s*.2,y+s*.5);ctx.lineTo(x+s*.8,y+s*.5);ctx.stroke();
  }else if(t===1){ // ventilação
    ctx.fillStyle='#1d2850';ctx.fillRect(x+s*.15,y+s*.2,s*.7,s*.6);
    ctx.fillStyle='#ffb300';ctx.shadowColor='#ffb300';ctx.shadowBlur=s*.1;
    for(let i=0;i<4;i++)ctx.fillRect(x+s*.22,y+s*.27+i*s*.13,s*.56,s*.05);
  }else if(t===2){ // escada neon
    ctx.fillStyle='#ff9d3c';ctx.shadowColor='#ff9d3c';ctx.shadowBlur=s*.12;
    for(let i=0;i<6;i++)ctx.fillRect(x+s*.2,y+s*.06+i*s*.15,s*.6,s*.07);
  }else{ // chip / arbusto
    ctx.shadowColor='#7cff4f';ctx.shadowBlur=s*.15;
    ctx.strokeStyle='#7cff4f';ctx.lineWidth=Math.max(1.5,s*.04);
    ctx.fillStyle='rgba(124,255,79,.15)';rr(x+s*.2,y+s*.2,s*.6,s*.6,s*.08);ctx.fill();ctx.stroke();
    ctx.shadowBlur=0;ctx.fillStyle='#7cff4f';ctx.fillRect(x+s*.42,y+s*.42,s*.16,s*.16);
    for(let i=0;i<3;i++){ctx.fillRect(x+s*(.3+i*.17),y+s*.1,s*.05,s*.1);ctx.fillRect(x+s*(.3+i*.17),y+s*.8,s*.05,s*.1)}
  }
  ctx.restore();
}

let lay=null,glow=null,bgC=null,baseC=null,frameC=null;
function mk(){const c=document.createElement('canvas');c.width=W*D;c.height=H*D;return c}
function layout(){
  const top=Math.max(72,H*.12)+(H<460?0:12),bot=Math.max(70,H*.11);
  const availH=H-top-bot;
  const cs=Math.max(18,Math.min(W*.9/L.cols,availH/(L.rows+.9),110));
  const hw=L.cols*cs,hh=L.rows*cs;
  const ox=(W-hw)/2,oy=top+(availH-hh-cs*.55)/2+cs*.55;
  return{cs,hw,hh,ox,oy,gy:oy+hh};
}
// Camadas estáticas: desenhadas UMA vez por fase/redimensionamento (sombras caras ficam aqui)
function buildLayers(){
  lay=layout();const {cs,ox,oy,gy}=lay;
  // fundo
  bgC=mk();let g=bgC.getContext('2d');g.setTransform(D,0,0,D,0,0);
  g.fillStyle='#060a18';g.fillRect(0,0,W,H);
  const bg=g.createRadialGradient(W/2,H*.45,10,W/2,H*.45,Math.max(W,H)*.7);
  bg.addColorStop(0,'rgba(40,60,140,.45)');bg.addColorStop(1,'rgba(6,10,24,0)');
  g.fillStyle=bg;g.fillRect(0,0,W,H);
  const gs=Math.max(28,Math.min(W,H)/14);
  g.strokeStyle='rgba(0,240,255,.06)';g.lineWidth=1;g.beginPath();
  for(let x=0;x<W;x+=gs){g.moveTo(x,0);g.lineTo(x,H)}
  for(let y=0;y<H;y+=gs){g.moveTo(0,y);g.lineTo(W,y)}
  g.stroke();
  // casa (base)
  baseC=mk();const c=baseC.getContext('2d');c.setTransform(D,0,0,D,0,0);
  const fl=c.createLinearGradient(0,gy,0,gy+cs*3);
  fl.addColorStop(0,color+'33');fl.addColorStop(1,'rgba(6,10,24,0)');
  c.fillStyle=fl;c.fillRect(0,gy,W,cs*3);
  c.save();c.strokeStyle=color;c.shadowColor=color;c.shadowBlur=14;c.lineWidth=2;
  c.beginPath();c.moveTo(0,gy+cs*.08);c.lineTo(W,gy+cs*.08);c.stroke();c.restore();
  const inH=(r,q)=>r>=0&&r<L.rows&&q>=0&&q<L.cols&&L.m[r][q];
  const runs=[];
  for(let q=0;q<L.cols;q++)for(let r=0;r<L.rows;r++){
    if(inH(r,q)&&!inH(r-1,q)){
      const lr=runs[runs.length-1];
      if(lr&&lr.r===r&&lr.c1===q-1)lr.c1=q;else runs.push({r,c0:q,c1:q});
    }
  }
  let hi=runs[0];runs.forEach(q=>{if(q.r<hi.r||(q.r===hi.r&&q.c1-q.c0>hi.c1-hi.c0))hi=q});
  runs.forEach(q=>{
    const x0=ox+q.c0*cs,x1=ox+(q.c1+1)*cs,y0=oy+q.r*cs,tk=cs*.5;
    if(q===hi){
      const cx=x0+(x1-x0)*.68;
      c.fillStyle='#1a2348';c.fillRect(cx,y0-tk-cs*.4,cs*.34,cs*.55);
      c.strokeStyle='#00f0ff';c.lineWidth=1.5;c.strokeRect(cx,y0-tk-cs*.4,cs*.34,cs*.55);
    }
    const rg=c.createLinearGradient(0,y0-tk,0,y0);rg.addColorStop(0,'#252f63');rg.addColorStop(1,'#101638');
    c.save();c.shadowColor='#00f0ff';c.shadowBlur=12;c.fillStyle=rg;
    c.beginPath();c.moveTo(x0-cs*.12,y0);c.lineTo(x0+cs*.06,y0-tk);c.lineTo(x1-cs*.06,y0-tk);c.lineTo(x1+cs*.12,y0);c.closePath();c.fill();
    c.restore();
    c.strokeStyle='#00f0ff';c.lineWidth=2;c.beginPath();c.moveTo(x0+cs*.06,y0-tk);c.lineTo(x1-cs*.06,y0-tk);c.stroke();
  });
  c.fillStyle='#0b1130';
  for(let r=0;r<L.rows;r++)for(let q=0;q<L.cols;q++)if(L.m[r][q])c.fillRect(ox+q*cs,oy+r*cs,cs+.5,cs+.5);
  const pad=cs*.03;
  for(let r=0;r<L.rows;r++)for(let q=0;q<L.cols;q++){
    if(!L.m[r][q])continue;
    const x=ox+q*cs,y=oy+r*cs;
    if(L.g[r][q]){
      c.fillStyle='#121a3c';c.fillRect(x,y,cs,cs);
      c.strokeStyle='rgba(0,240,255,.2)';c.lineWidth=1;c.strokeRect(x+.5,y+.5,cs-1,cs-1);
      ctx=c;drawItem(L.t[r][q],x,y,cs);ctx=mainCtx;
    }else{
      c.fillStyle='#17214a';c.fillRect(x+pad,y+pad,cs-pad*2,cs-pad*2);
      c.strokeStyle='rgba(0,240,255,.35)';c.lineWidth=1.2;
      c.strokeRect(x+cs*.08,y+cs*.08,cs*.84,cs*.84);
    }
  }
  // moldura (por cima das células pintadas)
  frameC=mk();const f=frameC.getContext('2d');f.setTransform(D,0,0,D,0,0);
  f.strokeStyle='#00f0ff';f.shadowColor='#00f0ff';f.shadowBlur=10;f.lineWidth=2;
  f.beginPath();
  for(let r=0;r<L.rows;r++)for(let q=0;q<L.cols;q++){
    if(!L.m[r][q])continue;
    const x=ox+q*cs,y=oy+r*cs;
    if(!inH(r-1,q)){f.moveTo(x,y);f.lineTo(x+cs,y)}
    if(!inH(r+1,q)){f.moveTo(x,y+cs);f.lineTo(x+cs,y+cs)}
    if(!inH(r,q-1)){f.moveTo(x,y);f.lineTo(x,y+cs)}
    if(!inH(r,q+1)){f.moveTo(x+cs,y);f.lineTo(x+cs,y+cs)}
  }
  f.stroke();
  // sprite de célula pintada (brilho pré-renderizado)
  const bl=cs*.25,sz=Math.ceil(cs+bl*2);
  glow=document.createElement('canvas');glow.width=glow.height=Math.ceil(sz*D);
  const gc=glow.getContext('2d');gc.setTransform(D,0,0,D,0,0);
  gc.shadowColor=color;gc.shadowBlur=bl;gc.fillStyle=color;
  gc.fillRect(bl+pad,bl+pad,cs-pad*2,cs-pad*2);
  gc.shadowBlur=0;gc.fillStyle='rgba(255,255,255,.22)';gc.fillRect(bl+pad,bl+pad,cs-pad*2,cs*.12);
  glow.bl=bl;glow.sz=sz;
  dirty=true;
}

function draw(){
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(bgC,0,0);
  ctx.drawImage(baseC,0,0);
  ctx.setTransform(D,0,0,D,0,0);
  const {cs,ox,oy}=lay,bl=glow.bl,sz=glow.sz;
  for(let r=0;r<L.rows;r++)for(let c=0;c<L.cols;c++){
    if(painted[r][c]&&!L.g[r][c])ctx.drawImage(glow,ox+c*cs-bl,oy+r*cs-bl,sz,sz);
  }
  ctx.setTransform(1,0,0,1,0,0);
  ctx.drawImage(frameC,0,0);
  ctx.setTransform(D,0,0,D,0,0);
  // pincel
  let bx=pos.c,by=pos.r;
  if(anim){const k=Math.min(anim.t,anim.p.length);bx=anim.from.c+DIRS[anim.d][0]*k;by=anim.from.r+DIRS[anim.d][1]*k}
  const x=ox+bx*cs,y=oy+by*cs;
  ctx.save();ctx.shadowColor=color;ctx.shadowBlur=cs*.4;
  ctx.fillStyle=color;rr(x+cs*.1,y+cs*.1,cs*.8,cs*.8,cs*.14);ctx.fill();ctx.restore();
  ctx.strokeStyle='#fff';ctx.lineWidth=2;rr(x+cs*.1,y+cs*.1,cs*.8,cs*.8,cs*.14);ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,.9)';rr(x+cs*.36,y+cs*.36,cs*.28,cs*.28,cs*.05);ctx.fill();
  // partículas
  ctx.fillStyle=color;
  parts.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.l);
    ctx.fillRect(ox+p.x*cs-2,oy+p.y*cs-2,4,4);
  });
  ctx.globalAlpha=1;
  // progresso (só quando muda)
  const pct=Math.round(count/total*100);
  if(pct!==lastPct){lastPct=pct;progbar.style.width=pct+'%'}
}

let last=performance.now();
function loop(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  tick(dt);
  parts.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.l-=dt*2.2});
  parts=parts.filter(p=>p.l>0);
  if(dirty||anim||parts.length){draw();dirty=!!(anim||parts.length)}
  requestAnimationFrame(loop);
}

// controles
let sx=0,sy=0,down=false;
cv.addEventListener('pointerdown',e=>{down=true;sx=e.clientX;sy=e.clientY});
addEventListener('pointercancel',()=>down=false);
addEventListener('pointerup',e=>{
  if(!down)return;down=false;
  const dx=e.clientX-sx,dy=e.clientY-sy;
  if(Math.max(Math.abs(dx),Math.abs(dy))<Math.max(16,Math.min(W,H)*.03))return;
  move(Math.abs(dx)>Math.abs(dy)?(dx>0?1:3):(dy>0?2:0));
});
addEventListener('keydown',e=>{
  const m={ArrowUp:0,w:0,ArrowRight:1,d:1,ArrowDown:2,s:2,ArrowLeft:3,a:3}[e.key];
  if(m!==undefined){e.preventDefault();move(m)}
  if(e.key==='z')undo();
});
document.getElementById('undo').onclick=undo;
document.getElementById('reset').onclick=resetLevel;
document.getElementById('next').onclick=()=>{level++;newLevel()};
resize();newLevel();window.__ready=true;requestAnimationFrame(loop);
