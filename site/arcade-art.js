// PLAYPILE category cast. Full-body, hand-framed sprite animation, with small
// pixel props. Only visible characters tick; all artwork is served locally.
export const CHARACTER_KINDS = Object.freeze([
  'arcade', 'driving', 'sport', 'shooter', 'action', 'adventure',
  'puzzle', 'strategy', 'horror', 'new', 'popular', 'friends'
]);

const normalize = (kind) => CHARACTER_KINDS.includes(String(kind).toLowerCase())
  ? String(kind).toLowerCase() : 'arcade';

export function characterHTML(kind) {
  return '<pp-character kind="' + normalize(kind) + '" aria-hidden="true"></pp-character>';
}

const SOURCES = Object.fromEntries([...CHARACTER_KINDS.filter(k => k !== 'friends'), 'friend-left', 'friend-right']
  .map(kind => [kind, { path: '/site/arcade-assets/' + kind + '.webp', width: kind === 'driving' ? 192 : 128 }]));
const images = new Map();
function loadSprite(kind) {
  if (!images.has(kind)) {
    const img = new Image();
    const promise = new Promise((resolve, reject) => { img.onload = () => resolve(img); img.onerror = reject; });
    img.src = SOURCES[kind].path;
    images.set(kind, promise);
  }
  return images.get(kind);
}

function rect(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
function star(c, x, y, color, scale = 1) {
  [[2,0,1,5],[0,2,5,1],[1,1,3,3]].forEach(([dx,dy,w,h]) => rect(c,x+dx*scale,y+dy*scale,w*scale,h*scale,color));
}
function coin(c, x, y, n, color = '#f2c36d') {
  const width = [7,5,2,5][n%4];
  rect(c,x+(7-width)/2,y+1,width,7,'#80532c');
  rect(c,x+(7-width)/2,y,width,7,color);
  if(width>3) rect(c,x+3,y+2,1,3,'#fff0bc');
}

function arcadeCabinet(c, t) {
  rect(c,151,49,43,96,'#182832');
  rect(c,154,52,36,10,'#e3b65d');
  rect(c,154,64,36,37,'#416779');
  rect(c,158,68,28,26,'#081d24');
  rect(c,161,72,3,3,'#f6d284');
  rect(c,168,72,3,3,'#f6d284');
  rect(c,175,72,3,3,'#f6d284');
  rect(c,160+(Math.floor(t*8)%18),87,8,2,'#8fd5b0');
  rect(c,155,101,36,8,'#bd7155');
  rect(c,160,96,2,8,'#e8d6ad');
  rect(c,158,95,6,4,'#e69765');
  rect(c,178,102,4,3,'#e8d6ad');
  rect(c,157,112,30,28,'#223d49');
  rect(c,169,116,9,5,'#131c23');
  rect(c,170,117,7,1,'#b2c1ae');
}

function puzzleBlocks(c,t) {
  const lift=Math.floor(Math.sin(t*2)*3);
  const block=(x,y,color)=>{rect(c,x,y,12,12,'#15242b');rect(c,x+1,y+1,10,10,color);rect(c,x+2,y+2,7,2,'#ffffff55');};
  block(170,57+lift,'#e1b65c');block(182,57+lift,'#e1b65c');block(182,69+lift,'#e1b65c');
  block(38,109,'#71bdb2');block(50,109,'#71bdb2');block(38,121,'#71bdb2');
}

function mapTable(c) {
  rect(c,153,102,48,6,'#72533e');rect(c,157,108,4,37,'#503f35');rect(c,193,108,4,37,'#503f35');
  rect(c,151,98,51,5,'#d8bd80');rect(c,154,94,46,7,'#efd8a1');
  rect(c,162,94,3,5,'#7d9b70');rect(c,165,97,15,2,'#7d9b70');rect(c,180,93,2,6,'#a75c4d');
  rect(c,188,88,2,11,'#6b4d3e');rect(c,190,88,7,4,'#c97959');
}

function lantern(c,x,y,t) {
  rect(c,x+5,y,2,7,'#c9a76c');rect(c,x+2,y+6,9,2,'#866e50');
  rect(c,x+1,y+8,11,14,'#34434a');rect(c,x+3,y+9,7,11,'#e9bb6b');
  rect(c,x+5,y+11,3,6,Math.floor(t*6)%3?'#ffdf8b':'#fff0bd');rect(c,x+1,y+22,11,2,'#866e50');
}

function makeRuntime() {
  if (typeof window === 'undefined' || typeof customElements === 'undefined' || customElements.get('pp-character')) return;
  const active = new Set();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const still=()=>motion.matches || document.documentElement.classList.contains('arcade-still');
  let raf=0, lastFrame=0;
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
  function tick(now){
    raf=0;
    if(document.hidden || still() || !active.size)return;
    if(now-lastFrame>=70){for(const el of active)el.paint(now/1000);lastFrame=now;}
    raf=requestAnimationFrame(tick);
  }
  function start(){if(!raf && active.size && !document.hidden && !still())raf=requestAnimationFrame(tick);}
  const observer = new IntersectionObserver(entries => {
    for(const entry of entries){
      const el=entry.target;
      if(entry.isIntersecting){active.add(el);el.load();}else active.delete(el);
    }
    if(active.size)start();else stop();
  }, {rootMargin:'20px'});
  document.addEventListener('visibilitychange',()=>document.hidden?stop():start());
  motion.addEventListener('change',()=>{stop();for(const el of active)el.paint(0);start();});
  window.addEventListener('pp-motion',()=>{stop();for(const el of active)el.paint(0);start();});

  class PixelCharacter extends HTMLElement {
    static get observedAttributes(){return ['kind'];}
    constructor(){
      super();
      this.canvas=document.createElement('canvas');
      this.canvas.width=240;this.canvas.height=160;
      this.canvas.setAttribute('aria-hidden','true');
      this.canvas.style.cssText='display:block;width:100%;height:100%;object-fit:contain;image-rendering:pixelated;pointer-events:none';
      this.ctx=this.canvas.getContext('2d');this.assets={};this.loading=null;this.failed=false;
    }
    connectedCallback(){
      if(!this.canvas.isConnected)this.append(this.canvas);
      this.setAttribute('aria-hidden','true');
      if(!this.style.display)this.style.display='block';
      this.style.aspectRatio='3 / 2';
      observer.observe(this);
    }
    disconnectedCallback(){observer.unobserve(this);active.delete(this);if(!active.size)stop();}
    attributeChangedCallback(){this.loading=null;this.assets={};this.failed=false;if(this.isConnected)this.load();}
    async load(){
      if(this.loading)return this.loading;
      const kind=normalize(this.getAttribute('kind'));this.kind=kind;
      const keys=kind==='friends'?['friend-left','friend-right']:[kind];
      this.loading=Promise.all(keys.map(async key=>{this.assets[key]=await loadSprite(key);})).then(()=>{
        if(this.isConnected)this.paint(still()?0:performance.now()/1000);
      }).catch(()=>{this.failed=true;this.dataset.artState='unavailable';});
      return this.loading;
    }
    sprite(key,frame,x=120,floor=147,scale=1,flip=false){
      const img=this.assets[key];if(!img)return;
      const width=SOURCES[key].width,c=this.ctx;
      c.save();c.translate(Math.round(x),Math.round(floor-120*scale));
      if(flip)c.scale(-1,1);
      c.drawImage(img,frame*width,0,width,128,Math.round(-width*scale/2),0,Math.round(width*scale),Math.round(128*scale));
      c.restore();
    }
    paint(time){
      const c=this.ctx;if(!c || !this.kind)return;
      const k=this.kind,t=still()?0:time;
      if(k==='friends' ? (!this.assets['friend-left'] || !this.assets['friend-right']) : !this.assets[k])return;
      const idle=Math.floor(t*5)%6;
      c.clearRect(0,0,240,160);c.imageSmoothingEnabled=false;
      // A small contact shadow anchors the cast without adding another panel.
      rect(c,k==='driving'?27:63,148,k==='driving'?187:114,3,'#101c2840');
      rect(c,k==='driving'?37:73,151,k==='driving'?167:94,2,'#101c2820');
      if(k==='driving'){
        const frame=[0,0,0,1,0,2,3,3,4,5,0,0][Math.floor(t*4)%12];
        this.sprite(k,frame,120,147,1);
      }else if(k==='sport'){
        const frame=[0,0,0,1,2,3,4,4,5,5][Math.floor(t*5)%10];
        this.sprite(k,frame,118,147,1);
      }else if(k==='shooter'){
        this.sprite(k,Math.floor(t*8)%6,120+Math.floor(Math.sin(t*1.6)*10),147,1);
      }else if(k==='arcade'){
        arcadeCabinet(c,t);this.sprite(k,idle,100,147,1);
        coin(c,50,70+Math.floor(Math.sin(t*2)*4),Math.floor(t*7));
      }else if(k==='action'){
        const frame=[0,0,0,0,1,2,3,3,4,5,0,0][Math.floor(t*7)%12];
        this.sprite(k,frame,110,147,1);
        if(frame===3){star(c,182,57,'#f2c36d',2);star(c,197,47,'#d98766',1);}
      }else if(k==='adventure'){
        lantern(c,177,95,t);this.sprite(k,idle,108,147,1);
        rect(c,44,135,17,12,'#5a7e68');rect(c,49,123,3,16,'#7f9d71');rect(c,43,126,8,3,'#91ac76');
      }else if(k==='puzzle'){
        puzzleBlocks(c,t);this.sprite(k,idle,119,147,1);
      }else if(k==='strategy'){
        mapTable(c);this.sprite(k,idle,103,147,1);
      }else if(k==='horror'){
        this.sprite(k,idle,119,147,1);
        for(let i=0;i<3;i++){const rise=(t*13+i*18)%55;rect(c,171+i%2*8,132-rise,3,3,'#8dcab379');}
        rect(c,50,139,23,7,'#58706a');rect(c,55,134,12,5,'#71847c');
      }else if(k==='new'){
        this.sprite(k,idle,120,147,1);
        star(c,49,58+Math.floor(Math.sin(t*2)*3),'#e7ba68',2);star(c,178,83,'#81c3b6',1);
      }else if(k==='popular'){
        this.sprite(k,idle,119,147,1);
        coin(c,48,87+Math.floor(Math.sin(t*3)*3),Math.floor(t*7));
        star(c,180,51+Math.floor(Math.cos(t*2)*3),'#f2c36d',2);
        rect(c,172,118,3,9,'#91bbd0');rect(c,175,118,5,2,'#91bbd0');rect(c,168,126,5,3,'#91bbd0');
      }else if(k==='friends'){
        this.sprite('friend-left',idle,79,147,.95);
        this.sprite('friend-right',(idle+2)%6,160,147,.95,true);
        star(c,115,43+Math.floor(Math.sin(t*3)*3),'#e7ba68',1);
      }
      this.dataset.artState='ready';
    }
  }
  customElements.define('pp-character',PixelCharacter);
}

makeRuntime();
