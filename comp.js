// comp.js — Node port of comp_ac.py (compositor) using @napi-rs/canvas. No Python needed.
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const fs = require('fs'), path = require('path');

const HERE = __dirname;
const CARDS = path.join(HERE, 'cards');
GlobalFonts.registerFromPath(path.join(HERE, 'Cinzel.ttf'), 'Cinzel');
const FONT = 'Cinzel';

const SILVER=[200,200,200], GOLD=[208,168,48], RED=[154,31,43], WHITE=[248,248,248], BLUE=[28,58,138];
const SHOP_SCALE=0.62;
const rgb=c=>`rgb(${c[0]},${c[1]},${c[2]})`;

function hsv2rgb(h,s,v){ let r,g,b; let i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-f*s), t=v*(1-(1-f)*s);
  switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;default:r=v;g=p;b=q;}
  return [Math.round(r*255),Math.round(g*255),Math.round(b*255)]; }

function lum(hex){ hex=hex.replace('#',''); const r=parseInt(hex.slice(0,2),16),g=parseInt(hex.slice(2,4),16),b=parseInt(hex.slice(4,6),16); return (0.2126*r+0.7152*g+0.0722*b)/255; }
function isLight(hex){ return lum(hex)>0.55; }
function palette(hex){ if(isLight(hex)) return {title:BLUE,kw:RED,star:BLUE,shop:RED,gold:RED,light:true}; return {title:SILVER,kw:WHITE,star:SILVER,shop:GOLD,gold:GOLD,light:false}; }

const _cardCache={};
async function card(slug){ if(_cardCache[slug]) return _cardCache[slug]; const img=await loadImage(path.join(CARDS,slug+'.jpg')); _cardCache[slug]=img; return img; }

// crop an offscreen canvas to its non-transparent content
function cropToContent(cv){
  const ctx=cv.getContext('2d'); const {data,width,height}=ctx.getImageData(0,0,cv.width,cv.height);
  let minx=width,miny=height,maxx=0,maxy=0,found=false;
  for(let y=0;y<height;y++) for(let x=0;x<width;x++){ const a=data[(y*width+x)*4+3]; if(a>8){ found=true; if(x<minx)minx=x; if(x>maxx)maxx=x; if(y<miny)miny=y; if(y>maxy)maxy=y; } }
  if(!found) return cv;
  const w=maxx-minx+1,h=maxy-miny+1; const out=createCanvas(w,h); out.getContext('2d').drawImage(cv,minx,miny,w,h,0,0,w,h); return out;
}

// 4-point star (8-vertex) centred in a size×size canvas
function star4(size,col){
  const cv=createCanvas(size,size), d=cv.getContext('2d'); const c=size/2, R=size*0.5, r=size*0.16;
  d.beginPath();
  for(let i=0;i<8;i++){ const a=-Math.PI/2+i*(Math.PI/4); const rad=(i%2===0)?R:r; const x=c+rad*Math.cos(a), y=c+rad*Math.sin(a); i?d.lineTo(x,y):d.moveTo(x,y); }
  d.closePath(); d.fillStyle=rgb(col); d.fill(); return cv;
}

function measure(text,fontPx){ const cv=createCanvas(4,4),d=cv.getContext('2d'); d.font=`${fontPx}px ${FONT}`; return d.measureText(text).width; }

// per-letter EMF spectrum text, cropped
// EMF rainbow needs a genuinely contrasting (dark) garment to read well — on light garments the
// washed-out hues get lost, so every EMF text draw falls back to solid gold when light=true.
function emfText(text,h,light){
  if(light){
    const d0=createCanvas(4,4).getContext('2d'); d0.font=`${h}px ${FONT}`;
    const w=d0.measureText(text).width;
    const cv=createCanvas(Math.ceil(w)+8, Math.ceil(h*1.4)); const d=cv.getContext('2d');
    d.font=`${h}px ${FONT}`; d.textBaseline='top'; d.textAlign='left'; d.fillStyle=rgb(GOLD);
    d.fillText(text,4,0);
    return cropToContent(cv);
  }
  const d0=createCanvas(4,4).getContext('2d'); d0.font=`${h}px ${FONT}`;
  const ws=[...text].map(c=>d0.measureText(c).width);
  const cv=createCanvas(Math.ceil(ws.reduce((a,b)=>a+b,0))+8, Math.ceil(h*1.4)); const d=cv.getContext('2d');
  d.font=`${h}px ${FONT}`; d.textBaseline='top'; d.textAlign='left'; let x=4;
  const N=text.length;
  for(let i=0;i<N;i++){ const hue=(i/Math.max(1,N-1))*0.78; const v=light?0.72:1.0, s=light?1.0:0.9; d.fillStyle=rgb(hsv2rgb(hue,s,v)); d.fillText(text[i],x,0); x+=ws[i]; }
  return cropToContent(cv);
}

// title lockup -> cropped canvas
function titleLockup(h,pal,{allgold=false,stars=true,equal=false}={}){
  const bigPx=h, smallPx=equal?h:Math.round(h*SHOP_SCALE);
  const d0=createCanvas(4,4).getContext('2d');
  d0.font=`${bigPx}px ${FONT}`; const a='MajorManifestor', b='.Shop'; const wa=d0.measureText(a).width;
  d0.font=`${smallPx}px ${FONT}`; const wb=d0.measureText(b).width;
  const ssz=Math.round(h*0.85), gap=Math.round(h*0.35), sw=stars?(ssz+gap):0;
  const W=Math.ceil(sw+wa+wb+sw+8), H=Math.ceil(h*1.5); const cv=createCanvas(W,H); const d=cv.getContext('2d');
  d.textBaseline='top'; d.textAlign='left';
  const sc=allgold?pal.gold:pal.star; const base=Math.round(h*0.25); let x=4;
  if(stars){ d.drawImage(star4(ssz,sc),x,Math.round((H-ssz)/2)); x+=ssz+gap; }
  d.font=`${bigPx}px ${FONT}`; d.fillStyle=rgb(allgold?pal.gold:pal.title); d.fillText(a,x,base); x+=wa;
  const shopy=equal?base:base+Math.round(h*0.32);
  d.font=`${smallPx}px ${FONT}`; d.fillStyle=rgb(pal.shop); d.fillText(b,x,shopy); x+=wb;
  if(stars){ x+=gap; d.drawImage(star4(ssz,sc),Math.round(x),Math.round((H-ssz)/2)); }
  return cropToContent(cv);
}

function gridRows(n){ return {1:[1],2:[2],3:[3],4:[2,2],5:[3,2],6:[3,3],7:[4,3],8:[4,4]}[n]; }
function fitDims(w,h,bw,bh,up=true){ let s=Math.min(bw/w,bh/h); if(!up) s=Math.min(s,1); return {w:Math.max(1,Math.round(w*s)),h:Math.max(1,Math.round(h*s))}; }
function drawCentre(ctx,src,W,y,bw,bh,up=true){ const d=fitDims(src.width,src.height,bw,bh,up); ctx.drawImage(src,Math.round((W-d.w)/2),Math.round(y),d.w,d.h); return d; }

// "Est 2026" — small, gold as standard (auto-contrast to red where gold itself would vanish against
// the garment, same red/gold rule already used for the special-edition headline below). Not an EMF
// rainbow line — plain flat colour. Will become user-editable via the two-axis colour picker (Live
// Editor phase) but gold/red auto-contrast is the correct default until then. Returns updated by.
function _estLine(im,W,H,m,by,pal){
  // pal.gold already IS the auto-contrast value (RED on light, GOLD on dark — see palette()) —
  // use it directly rather than re-deriving the same rule a second way, matching the real site's
  // own mmFrontPrintFile exactly (colour:pal.gold).
  const sz=Math.round(W*0.032); im.font=`${sz}px ${FONT}`; im.textAlign='center'; im.textBaseline='top';
  im.fillStyle=rgb(pal.gold); im.fillText('Est 2026', Math.round(W/2), Math.round(by));
  im.textAlign='left';
  return by+sz+Math.round(H*0.012);
}

// draw the bottom two lines: standard (Dare to Dream + gold footer) OR special edition
function _footerLines(im,W,H,m,by,pal,opts){
  if(opts && opts.special){
    const head=opts.seHeadline||'HEAVEN ON EARTH';
    const headCol = pal.light ? RED : GOLD;
    const hpx=Math.round(W*0.033); im.font=`${hpx}px ${FONT}`; im.textAlign='center'; im.textBaseline='top'; im.fillStyle=rgb(headCol);
    im.fillText(head, Math.round(W/2), Math.round(by)); by+=hpx+Math.round(H*0.006);
    const fpx=Math.round(W*0.032); im.font=`${fpx}px ${FONT}`; im.fillStyle=rgb(GOLD);
    im.fillText('SPECIAL EDITION', Math.round(W/2), Math.round(by)); im.textAlign='left';
  } else {
    // Gold footer title lockup ("✦ MajorManifestor.Shop ✦") REMOVED 2026-09-25 — the main title
    // already appears at the top of this same print, a second brand stamp lower down was redundant.
    // "Dare to Dream" REPLACED 2026-09-25 with "Est 2026" (small, gold/red auto-contrast) to match
    // the real live site's own front print file, which already made this switch.
    by=_estLine(im,W,H,m,by,pal);
  }
  return by;
}

// ---------- FRONT ----------
async function front(W,H,cards,pal,opts={}){
  const cv=createCanvas(W,H), im=cv.getContext('2d'); const m=Math.round(W*0.05); let y=Math.round(H*0.03);
  const t=titleLockup(Math.round(W*0.072),pal); const td=drawCentre(im,t,W,y,W-2*m,H); y+=td.h+Math.round(H*0.012);
  const au=emfText('Authentically   Universal',Math.round(W*0.06),pal.light); const ad=drawCentre(im,au,W,y,td.w,H,false); y+=ad.h+Math.round(H*0.02);
  const rows=gridRows(cards.length), cols=Math.max(...rows); const gx=Math.round(W*0.03), gy=Math.round(H*0.02);
  const cw=Math.floor((W-2*m-(cols-1)*gx)/cols), chmax=Math.round((H*0.58)/rows.length);
  let idx=0; const ri=[];
  for(const rc of rows){ const cells=[]; for(let i=0;i<rc;i++){ const img=await card(cards[idx+i]); const d=fitDims(img.width,img.height,cw,chmax); cells.push({img,w:d.w,h:d.h}); } idx+=rc; ri.push({cells,rw:cells.reduce((a,c)=>a+c.w,0)+(rc-1)*gx,rh:Math.max(...cells.map(c=>c.h))}); }
  let yy=y;
  for(const {cells,rw,rh} of ri){ let xx=(W-rw)/2; for(const c of cells){ im.drawImage(c.img,Math.round(xx),Math.round(yy+(rh-c.h)/2),c.w,c.h); xx+=c.w+gx; } yy+=rh+gy; }
  let by=yy+Math.round(H*0.018);
  by=_footerLines(im,W,H,m,by,pal,opts);
  // Independent front customLine — separate from the back's, so the two sides can carry different
  // taglines. Anchored to the real cursor after "Dare to Dream" (or the special-edition footer).
  if(opts.customLine) _drawCustomLine(im, W, by + Math.round(H*0.02), opts.customLine);
  return cv;
}

// ---------- CUSTOM TAGLINE (e.g. "Today I'm Co-Creating With God! 😇") ----------
// customLine = {text, emoji, keyWord, font, colorHex}. Draws centred, as big as possible while still
// fitting the width, with one emphasised key word rendered bigger, and a dual outline (light+dark) so
// it reads against any garment colour regardless of the chosen fill colour. Returns the y position
// immediately after the line, so callers can stack further content below it correctly.
function _drawCustomLine(im, W, y, cl){
  const KEY_WORD_SCALE=1.55, EMOJI_SCALE=2.0, gap=0.28;
  const words=(cl.text||'').split(' ').filter(Boolean);
  const font=cl.font||FONT, emoji=cl.emoji||'', keyWord=cl.keyWord||'', colorHex=cl.colorHex||rgb(GOLD);
  const maxWidth=W*0.90;
  function scaleFor(w){ return w.replace(/[!.,]/g,'')===keyWord ? KEY_WORD_SCALE : 1; }
  function widthAt(size){
    let total=0;
    for(const w of words){ im.font=`${Math.round(size*scaleFor(w))}px "${font}"`; total+=im.measureText(w).width; }
    total+=(words.length-1)*size*gap;
    if(emoji){ im.font=`${Math.round(size*EMOJI_SCALE)}px "Segoe UI Emoji"`; total+=im.measureText(emoji).width+size*gap*1.5; }
    return total;
  }
  let size=Math.round(W*0.09);
  while(size>8 && widthAt(size)>maxWidth) size-=1;
  const totalW=widthAt(size);
  let x=(W-totalW)/2;
  im.textAlign='left'; im.textBaseline='alphabetic';
  for(const w of words){
    const wsz=Math.round(size*scaleFor(w));
    im.font=`${wsz}px "${font}"`;
    im.lineWidth=Math.max(2,Math.round(wsz*0.06)); im.strokeStyle='rgba(255,255,255,0.85)'; im.strokeText(w,x,y);
    im.lineWidth=Math.max(1,Math.round(wsz*0.025)); im.strokeStyle='rgba(10,10,16,0.55)'; im.strokeText(w,x,y);
    im.fillStyle=colorHex; im.fillText(w,x,y);
    x+=im.measureText(w).width+size*gap;
  }
  if(emoji){ im.font=`${Math.round(size*EMOJI_SCALE)}px "Segoe UI Emoji"`; im.fillText(emoji,x+size*gap*0.5,y); }
  im.textAlign='left'; im.textBaseline='top';
  return y+Math.round(size*1.3);
}

// ---------- BACK (shared cards row + keyword block via colourFn) ----------
async function backBase(W,H,cards,kw,pal,opts={}){
  const cv=createCanvas(W,H), im=cv.getContext('2d'); const m=Math.round(W*0.05); let y=Math.round(H*0.03);
  const t=titleLockup(Math.round(W*0.072),pal); const td=drawCentre(im,t,W,y,W-2*m,H); y+=td.h+Math.round(H*0.012);
  const au=emfText('Authentically   Universal',Math.round(W*0.06),pal.light); const ad=drawCentre(im,au,W,y,td.w,H,false); y+=ad.h+Math.round(H*0.02);
  const n=cards.length, gx=Math.round(W*0.025), cw=Math.floor((W-2*m-(n-1)*gx)/n), chmax=Math.round(H*0.30);
  const cells=[]; for(const c of cards){ const img=await card(c); const d=fitDims(img.width,img.height,cw,chmax); cells.push({img,w:d.w,h:d.h}); }
  const rh=Math.max(...cells.map(c=>c.h)), rw=cells.reduce((a,c)=>a+c.w,0)+(n-1)*gx; let xx=(W-rw)/2;
  for(const c of cells){ im.drawImage(c.img,Math.round(xx),Math.round(y+(rh-c.h)/2),c.w,c.h); xx+=c.w+gx; }
  y+=rh+Math.round(H*0.022);
  // Keyword block \u2014 OFF by default (agreed 2026-09-25: no keywords under the cards as std), only an
  // explicit opt-in (opts.keywords===true), and even then only drawn if there's genuinely enough room
  // left for it PLUS Est 2026 and at least a minimal trailing line \u2014 matches the same rule already
  // built into the live site's mmFrontPrintFile. comp.js/fire-item.js was NOT updated when that site
  // fix landed, which is exactly how this bug shipped in a real fired mockup \u2014 fixed here too now so
  // there's one rule, not two.
  let yy=y;
  if(opts.keywords){
    const ksz=Math.round(W*0.046); im.font=`${ksz}px ${FONT}`; im.textBaseline='top'; const sep=' \u00B7 ';
    const sepw=im.measureText(sep).width;
    const lines=[]; let cur=[];
    const lineW=ws=>ws.length?ws.reduce((a,w)=>a+im.measureText(w).width,0)+(ws.length-1)*sepw:0;
    for(const w of kw){ if(lineW(cur.concat([w]))<=W-2*m) cur.push(w); else { lines.push(cur); cur=[w]; } }
    if(cur.length) lines.push(cur);
    const lh=ksz*1.32;
    const kwH=Math.round(lh*lines.length+ksz*0.6);
    const neededAfter=Math.round(H*0.032*1.2*2)+Math.round(H*0.035);   // Est 2026 + one minimal trailing line
    const roomForKw=H-y-Math.round(H*0.012)-neededAfter;
    if(roomForKw>=kwH*0.5){
      if(opts.emfBand){ const band=emfBand(W-2*m,kwH,false); im.drawImage(band,m,Math.round(y-ksz*0.3)); }
      for(const ln of lines){ const tw=lineW(ln); let x=(W-tw)/2;
        for(let i=0;i<ln.length;i++){ if(i){ im.fillStyle='rgb(150,150,160)'; im.fillText(sep,x,yy); x+=sepw; }
          const w=ln[i]; let col=opts.colourFn?opts.colourFn(w,pal):rgb(pal.kw);
          if(opts.outline){ im.fillStyle='rgba(10,10,16,0.7)'; for(const dx of [-3,0,3]) for(const dy of [-3,0,3]) im.fillText(w,x+dx,yy+dy); }
          im.fillStyle=col; im.fillText(w,x,yy); x+=im.measureText(w).width; }
        yy+=lh; }
      yy+=Math.round(H*0.012);
    }
  }
  yy=_estLine(im,W,H,m,yy,pal);
  // Custom user tagline (e.g. "Today I'm Co-Creating With God! 😇") — anchored to yy, the REAL
  // cursor position right after however many keyword lines actually got drawn, so it always sits
  // just underneath the manifestation regardless of card count or keyword line count. Never a fixed
  // offset from the canvas bottom — that breaks the moment content height changes.
  if(opts.customLine) yy = _drawCustomLine(im, W, yy + Math.round(H*0.02), opts.customLine);
  if(opts.special){
    let by=yy+Math.round(H*0.02);
    const head=opts.seHeadline||'HEAVEN ON EARTH';
    const headCol = pal.light ? RED : GOLD;
    const hpx=Math.round(W*0.036); im.font=`${hpx}px ${FONT}`; im.textAlign='center'; im.textBaseline='top'; im.fillStyle=rgb(headCol);
    im.fillText(head, Math.round(W/2), Math.round(by)); by+=hpx+Math.round(H*0.008);
    const fpx=Math.round(W*0.034); im.font=`${fpx}px ${FONT}`; im.fillStyle=rgb(GOLD);
    im.fillText('SPECIAL EDITION', Math.round(W/2), Math.round(by)); im.textAlign='left';
  }
  return cv;
}
const back      =(W,H,cards,kw,pal,o={})=>backBase(W,H,cards,kw,pal,{...o});
const backEmf   =(W,H,cards,kw,pal,o={})=>backBase(W,H,cards,kw,pal,{emfBand:true,outline:true,colourFn:()=>'rgb(255,255,255)',...o});
const backMeaning=(W,H,cards,kw,pal,o={})=>backBase(W,H,cards,kw,pal,{colourFn:(w,pal)=>rgb(meaningCol(w,pal.kw)),...o});

// ---------- EMF band ----------
function emfBand(W,H,vertical=true){ const cv=createCanvas(W,H), d=cv.getContext('2d');
  if(vertical){ for(let i=0;i<H;i++){ const hue=0.78*(1-i/Math.max(1,H-1)); d.fillStyle=rgb(hsv2rgb(hue,0.95,0.92)); d.fillRect(0,i,W,1); } }
  else { for(let i=0;i<W;i++){ const hue=0.78*(i/Math.max(1,W-1)); d.fillStyle=rgb(hsv2rgb(hue,0.95,0.92)); d.fillRect(i,0,1,H); } }
  return cv; }

// ---------- meaning colours ----------
const MEANING=[
 [/(money|wealth|prosper|abundance|riches|legacy|fortune)/i,[47,170,78]],
 [/(joy|happ|delight|cheer|bliss|radian|sun)/i,[232,194,30]],
 [/(love|romance|passion|heart|union|marriage)/i,[209,43,43]],
 [/(peace|calm|serenity|healing|spirit|intuition)/i,[70,176,200]],
 [/(power|strength|will|mastery|victory|triumph|breakthrough)/i,[192,57,43]],
 [/(vision|wisdom|insight|clarity|truth|knowledge)/i,[63,111,209]],
 [/(growth|fertility|nature|nurture|creativ|new)/i,[95,174,63]],
 [/(success|achieve|ambition|career|recognition)/i,[212,136,42]],
 [/(rebirth|transform|renewal|change|hope|dream)/i,[138,90,200]],
];
function meaningCol(word,fb){ for(const [rx,col] of MEANING){ if(rx.test(word)) return col; } return fb; }

// ---------- rotate a canvas -90 (expand) ----------
function rotateM90(src){ const out=createCanvas(src.height,src.width); const d=out.getContext('2d'); d.translate(src.height,0); d.rotate(Math.PI/2); d.drawImage(src,0,0); return out; }

// ---------- keyword sleeves (3 vertical columns) ----------
function _sleeveStrips(kw, drawLineFn, ncol){
  const W=450,H=1800; ncol=ncol||3; const n=kw.length, per=Math.ceil(n/ncol);
  let lines=[]; for(let i=0;i<ncol;i++){ const l=kw.slice(i*per,(i+1)*per); if(l.length) lines.push(l); }
  const strips=lines.map(drawLineFn);
  return {W,H,strips};
}
function kwSleeveEmf(kw){ const W=450,H=1800; const cv=createCanvas(W,H), im=cv.getContext('2d'); im.drawImage(emfBand(W,H,true),0,0);
  const fsz=150; const {strips}=_sleeveStrips(kw,(ln)=>{
    const d0=createCanvas(4,4).getContext('2d'); d0.font=`${fsz}px ${FONT}`; const txt=ln.join(' \u00B7 ');
    const tw=Math.ceil(d0.measureText(txt).width);
    const st=createCanvas(tw+30,fsz+30), sd=st.getContext('2d'); sd.font=`${fsz}px ${FONT}`; sd.textBaseline='top';
    sd.fillStyle='rgba(20,20,20,1)'; for(const dx of [-3,0,3]) for(const dy of [-3,0,3]) sd.fillText(txt,15+dx,8+dy);
    sd.fillStyle='rgb(255,255,255)'; sd.fillText(txt,15,8);
    let s=cropToContent(st); if(s.width>H-80){ const r=(H-80)/s.width; const ns=createCanvas(H-80,Math.round(s.height*r)); ns.getContext('2d').drawImage(s,0,0,ns.width,ns.height); s=ns; } return rotateM90(s);
  });
  const gap=Math.floor((W-strips.reduce((a,s)=>a+s.width,0))/(strips.length+1)); let x=gap;
  for(const s of strips){ im.drawImage(s,x,Math.round((H-s.height)/2)); x+=s.width+gap; } return cv;
}
function kwSleeveMeaning(kw,darkBg=true){
  const W=450,H=1800; const cv=createCanvas(W,H), im=cv.getContext('2d');
  const fb=darkBg?[248,248,248]:[20,20,20];
  const gap=14;
  const probe=createCanvas(4,4).getContext('2d');
  // word text-length at a reference 100px font
  const len100 = w => { probe.font=`100px ${FONT}`; return probe.measureText(w).width; };

  // Try font sizes from large down; for each, find the minimum #columns that fits all words,
  // requiring: column width (W/ncols) >= fsz*1.15  AND  each column's stacked length <= H-30.
  let best=null;
  for(let fsz=260; fsz>=70; fsz-=4){
    // max columns allowed by width at this font
    const maxCols = Math.max(1, Math.floor(W/(fsz*1.15)));
    // length each word occupies along the sleeve at this font
    const wlen = kw.map(w => len100(w)*fsz/100 + gap);
    // greedily pack words into columns each capped at H-30
    const cap = H-30;
    let cols=[[]], colLen=[0];
    let ok=true;
    for(let i=0;i<kw.length;i++){
      let placed=false;
      for(let c=0;c<cols.length;c++){
        if(colLen[c]+wlen[i] <= cap){ cols[c].push(kw[i]); colLen[c]+=wlen[i]; placed=true; break; }
      }
      if(!placed){
        if(cols.length<maxCols){ cols.push([kw[i]]); colLen.push(wlen[i]); }
        else { ok=false; break; }
      }
    }
    if(ok){ best={fsz,cols}; break; }   // first (largest) font that fits wins
  }
  if(!best){ best={fsz:70, cols:[kw]}; }

  const {fsz,cols}=best;
  const colW=Math.floor(W/cols.length);
  cols.forEach((col,ci)=>{
    let yCursor=15;
    for(const w of col){
      const wpx=createCanvas(4,4).getContext('2d'); wpx.font=`${fsz}px ${FONT}`;
      const ww=Math.ceil(wpx.measureText(w).width);
      const st=createCanvas(ww+22,Math.ceil(fsz*1.3)), sd=st.getContext('2d');
      sd.font=`${fsz}px ${FONT}`; sd.textBaseline='top';
      const col2=meaningCol(w,fb);
      sd.fillStyle='rgba(10,10,16,0.7)'; for(const dx of[-2,0,2])for(const dy of[-2,0,2]) sd.fillText(w,11+dx,9+dy);
      sd.fillStyle=rgb(col2); sd.fillText(w,11,9);
      const rot=rotateM90(cropToContent(st));
      const cx=Math.round(ci*colW+(colW-rot.width)/2);
      im.drawImage(rot,cx,yCursor);
      yCursor+=rot.height+gap;
    }
  });
  return cv;
}

function kwSleeveStd(kw,pal){ const W=450,H=1800; const cv=createCanvas(W,H), im=cv.getContext('2d'); const fsz=150;
  const {strips}=_sleeveStrips(kw,(ln)=>{ const txt=ln.join(' \u00B7 '); const d0=createCanvas(4,4).getContext('2d'); d0.font=`${fsz}px ${FONT}`; const tw=Math.ceil(d0.measureText(txt).width);
    const st=createCanvas(tw+20,fsz+20), sd=st.getContext('2d'); sd.font=`${fsz}px ${FONT}`; sd.textBaseline='top'; sd.fillStyle=rgb(pal.kw); sd.fillText(txt,10,6);
    let s=cropToContent(st); if(s.width>H-80){ const r=(H-80)/s.width; const ns=createCanvas(H-80,Math.round(s.height*r)); ns.getContext('2d').drawImage(s,0,0,ns.width,ns.height); s=ns; } return rotateM90(s); });
  const gap=Math.floor((W-strips.reduce((a,s)=>a+s.width,0))/(strips.length+1)); let x=gap;
  for(const s of strips){ im.drawImage(s,x,Math.round((H-s.height)/2)); x+=s.width+gap; } return cv;
}

// ---------- title sleeve (red bg, silver title, gold stars) ----------
function titleSleeve(){ const W=450,H=1800; const cv=createCanvas(W,H), d=cv.getContext('2d'); d.fillStyle=rgb(RED); d.fillRect(0,0,W,H);
  const strip=_titleStripVertical(SILVER,GOLD); const ss=150,ty=50,by=H-50-ss; let avail=by-(ty+ss)-60; let s=strip;
  if(s.height>avail){ const r=avail/s.height; const ns=createCanvas(Math.round(s.width*r),avail); ns.getContext('2d').drawImage(s,0,0,ns.width,ns.height); s=ns; }
  d.drawImage(s,Math.round((W-s.width)/2),ty+ss+30+Math.round((avail-s.height)/2));
  d.drawImage(star4(ss,SILVER),Math.round((W-ss)/2),ty); d.drawImage(star4(ss,SILVER),Math.round((W-ss)/2),by); return cv;
}
function _titleStripVertical(titleCol,shopCol){ const big=150, small=Math.round(150*SHOP_SCALE); const d0=createCanvas(4,4).getContext('2d');
  d0.font=`${big}px ${FONT}`; const a='MajorManifestor',b='.Shop'; const wa=d0.measureText(a).width; d0.font=`${small}px ${FONT}`; const wb=d0.measureText(b).width;
  const strip=createCanvas(Math.ceil(wa+wb+60),340); const sd=strip.getContext('2d'); sd.textBaseline='top';
  sd.font=`${big}px ${FONT}`; sd.fillStyle=rgb(titleCol); sd.fillText(a,20,70);
  sd.font=`${small}px ${FONT}`; sd.fillStyle=rgb(shopCol); sd.fillText(b,20+wa,70+Math.round(150*0.30));
  return rotateM90(cropToContent(strip));
}

function _rng(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }
// ---------- Heaven on Earth: AUSPICIOUS MANIFESTATION SKY title sleeve ----------
// Black sky read TOP(shoulder)->BOTTOM(wrist) = manifestation descending. A single luminous thread runs
// the length, from the held intention down to the realised star.
function _glowStar(d,x,y,r,core='rgba(255,255,255,0.98)',halo='rgba(190,205,255,0.5)'){
  const g=d.createRadialGradient(x,y,0,x,y,r*4); g.addColorStop(0,core); g.addColorStop(0.35,halo); g.addColorStop(1,'rgba(150,170,255,0)');
  d.fillStyle=g; d.beginPath(); d.arc(x,y,r*4,0,7); d.fill(); d.fillStyle='rgba(255,255,255,0.98)'; d.beginPath(); d.arc(x,y,r*0.75,0,7); d.fill();
}
function _starburst(d,x,y,R,col){ // 4-point sparkle
  d.save(); d.translate(x,y); d.fillStyle=col; d.beginPath();
  for(let i=0;i<8;i++){ const a=-Math.PI/2+i*(Math.PI/4); const rad=(i%2===0)?R:R*0.18; const px=rad*Math.cos(a),py=rad*Math.sin(a); i?d.lineTo(px,py):d.moveTo(px,py); }
  d.closePath(); d.fill(); d.restore();
}
function titleSleeveHeaven(){
  const W=450,H=1800; const cv=createCanvas(W,H), d=cv.getContext('2d');
  d.fillStyle='rgb(5,6,18)'; d.fillRect(0,0,W,H);
  // faint deep-sky dust
  const rnd=_rng(20259);
  for(let i=0;i<320;i++){ const x=Math.floor(rnd()*W),y=Math.floor(rnd()*H),r=[1,1,1,2,2,3][Math.floor(rnd()*6)]; d.fillStyle=`rgba(255,255,255,${0.16+rnd()*0.5})`; d.beginPath(); d.arc(x,y,r,0,7); d.fill(); }
  const CX=W/2;
  // === named auspicious points, placed shoulder(top)->wrist(bottom) ===
  // y positions as fractions of H
  const P={
    north:   [CX-30,  H*0.085],  // North Star (held intention)
    moon:    [CX+95,  H*0.140],  // waxing crescent Moon
    jupiter: [CX-70,  H*0.330],  // Jupiter  (Great Benefic)
    venus:   [CX+40,  H*0.360],  // Venus    (Great Benefic) — conjunct Jupiter
    trineA:  [CX-95,  H*0.470],  // Grand Trine vertices
    trineB:  [CX+100, H*0.500],
    trineC:  [CX-10,  H*0.620],
    pleiad:  [CX+85,  H*0.560],  // Pleiades cluster (near)
    regulus: [CX-40,  H*0.820],  // Regulus (royal star of success)
    sun:     [CX+30,  H*0.900],  // exalted Sun (intention realised)
  };
  // --- the single luminous THREAD of manifestation (north -> benefics -> trine -> realised) ---
  const thread=[P.north,P.jupiter,P.venus,P.trineA,P.trineC,P.regulus,P.sun];
  const grad=d.createLinearGradient(0,H*0.05,0,H*0.95);
  grad.addColorStop(0,'rgba(220,225,255,0.85)'); grad.addColorStop(0.5,'rgba(190,160,255,0.55)'); grad.addColorStop(1,'rgba(255,220,150,0.85)');
  d.strokeStyle=grad; d.lineWidth=3; d.beginPath(); d.moveTo(thread[0][0],thread[0][1]);
  for(let i=1;i<thread.length;i++) d.lineTo(thread[i][0],thread[i][1]); d.stroke();
  // soft glow under the thread
  d.strokeStyle='rgba(200,180,255,0.18)'; d.lineWidth=10; d.beginPath(); d.moveTo(thread[0][0],thread[0][1]);
  for(let i=1;i<thread.length;i++) d.lineTo(thread[i][0],thread[i][1]); d.stroke();
  // --- Grand Trine (equilateral triangle of luck) ---
  d.strokeStyle='rgba(150,210,255,0.45)'; d.lineWidth=2; d.beginPath();
  d.moveTo(P.trineA[0],P.trineA[1]); d.lineTo(P.trineB[0],P.trineB[1]); d.lineTo(P.trineC[0],P.trineC[1]); d.closePath(); d.stroke();
  // --- Jupiter–Venus conjunction link ---
  d.strokeStyle='rgba(255,225,170,0.5)'; d.lineWidth=2; d.beginPath(); d.moveTo(P.jupiter[0],P.jupiter[1]); d.lineTo(P.venus[0],P.venus[1]); d.stroke();
  // --- Pleiades: tiny seven-star cluster ---
  const px=P.pleiad[0],py=P.pleiad[1]; const pl=[[0,0],[14,-8],[26,4],[8,16],[-12,10],[20,20],[2,-16]];
  for(const [ox,oy] of pl){ _glowStar(d,px+ox,py+oy,2.2,'rgba(225,235,255,0.95)','rgba(150,180,255,0.4)'); }
  // --- the benefics & key stars (bright) ---
  _starburst(d,P.jupiter[0],P.jupiter[1],26,'rgba(255,235,180,0.95)'); _glowStar(d,P.jupiter[0],P.jupiter[1],5);   // Jupiter
  _starburst(d,P.venus[0],P.venus[1],22,'rgba(255,240,210,0.95)');   _glowStar(d,P.venus[0],P.venus[1],4.5);       // Venus
  _glowStar(d,P.trineA[0],P.trineA[1],3.5); _glowStar(d,P.trineB[0],P.trineB[1],3.5); _glowStar(d,P.trineC[0],P.trineC[1],3.5);
  // North Star — brightest, gold sparkle, at the crown
  _starburst(d,P.north[0],P.north[1],30,'rgba(255,236,170,0.98)'); _glowStar(d,P.north[0],P.north[1],6,'rgba(255,255,255,1)','rgba(255,230,160,0.6)');
  // waxing crescent Moon
  (function(mx,my,R){ d.save(); d.fillStyle='rgba(235,238,255,0.95)'; d.beginPath(); d.arc(mx,my,R,0,7); d.fill();
    d.globalCompositeOperation='destination-out'; d.beginPath(); d.arc(mx+R*0.55,my-R*0.15,R*0.95,0,7); d.fill(); d.restore(); })(P.moon[0],P.moon[1],16);
  // Regulus (royal) and exalted Sun (realised) at the wrist
  _starburst(d,P.regulus[0],P.regulus[1],20,'rgba(255,250,235,0.95)'); _glowStar(d,P.regulus[0],P.regulus[1],4.5);
  (function(sx,sy){ const g=d.createRadialGradient(sx,sy,0,sx,sy,46); g.addColorStop(0,'rgba(255,240,180,0.95)'); g.addColorStop(0.5,'rgba(255,210,120,0.4)'); g.addColorStop(1,'rgba(255,190,90,0)'); d.fillStyle=g; d.beginPath(); d.arc(sx,sy,46,0,7); d.fill();
    _starburst(d,sx,sy,30,'rgba(255,235,170,0.95)'); d.fillStyle='rgba(255,250,235,1)'; d.beginPath(); d.arc(sx,sy,7,0,7); d.fill(); })(P.sun[0],P.sun[1]);

  // === vertical title: MajorManifestor EMF, .Shop silver (smaller), gold stars top/bottom ===
  const big=150, small=Math.round(150*SHOP_SCALE); const d0=createCanvas(4,4).getContext('2d'); d0.font=`${big}px ${FONT}`;
  const a='MajorManifestor',b='.Shop'; const wa=d0.measureText(a).width; d0.font=`${small}px ${FONT}`; const wb=d0.measureText(b).width;
  const strip=createCanvas(Math.ceil(wa+wb+60),360); const sd=strip.getContext('2d'); sd.textBaseline='top';
  // dark halo so the lettering reads over the sky
  sd.fillStyle='rgba(5,6,18,0.9)'; sd.font=`${big}px ${FONT}`; for(const dx of [-4,0,4]) for(const dy of [-4,0,4]) sd.fillText(a,20+dx,70+dy);
  sd.font=`${small}px ${FONT}`; for(const dx of [-4,0,4]) for(const dy of [-4,0,4]) sd.fillText(b,20+wa+dx,70+Math.round(150*0.30)+dy);
  sd.font=`${big}px ${FONT}`; sd.fillStyle=rgb(SILVER); sd.fillText(a,20,70);
  sd.font=`${small}px ${FONT}`; sd.fillStyle=rgb(GOLD); sd.fillText(b,20+wa,70+Math.round(150*0.30));
  let s=rotateM90(cropToContent(strip)); const ss=150,ty=50,by2=H-50-ss; let avail=by2-(ty+ss)-60;
  if(s.height>avail){ const r=avail/s.height; const ns=createCanvas(Math.round(s.width*r),avail); ns.getContext('2d').drawImage(s,0,0,ns.width,ns.height); s=ns; }
  d.drawImage(s,Math.round((W-s.width)/2),ty+ss+30+Math.round((avail-s.height)/2));
  d.drawImage(star4(ss,GOLD),Math.round((W-ss)/2),ty); d.drawImage(star4(ss,GOLD),Math.round((W-ss)/2),by2); return cv;
}

// ---------- zip front print file ----------
async function zipFrontPf(cards,pal,W=2250,H=1500){ const cv=createCanvas(W,H), im=cv.getContext('2d');
  let vt=rotateM90(titleLockup(150,pal,{stars:true})); { const s=Math.min((W*0.16)/vt.width,(H*0.80)/vt.height); const n=createCanvas(Math.max(1,Math.round(vt.width*s)),Math.max(1,Math.round(vt.height*s))); n.getContext('2d').drawImage(vt,0,0,n.width,n.height); vt=n; }
  let au=rotateM90(emfText('Authentically   Universal',60,pal.light)); { const target=Math.round(vt.height*2/3); const s=Math.min((W*0.10)/au.width,target/au.height); const n=createCanvas(Math.max(1,Math.round(au.width*s)),Math.max(1,Math.round(au.height*s))); n.getContext('2d').drawImage(au,0,0,n.width,n.height); au=n; }
  const gx=Math.round(W*0.10); im.drawImage(vt,gx,Math.round((H-vt.height)/2)); im.drawImage(au,gx+vt.width+Math.round(W*0.012),Math.round((H-au.height)/2));
  const rows=gridRows(cards.length), cols=Math.max(...rows); const RX=Math.round(W*0.50),RW=Math.round(W*0.44),RY=Math.round(H*0.10),RH=Math.round(H*0.80);
  const gxx=Math.round(W*0.012), gyy=Math.round(H*0.02), cw=Math.floor((RW-(cols-1)*gxx)/cols), chmax=Math.floor((RH-(rows.length-1)*gyy)/rows.length); let idx=0; const ri=[];
  for(const rc of rows){ const cells=[]; for(let i=0;i<rc;i++){ const img=await card(cards[idx+i]); const d=fitDims(img.width,img.height,cw,chmax); cells.push({img,w:d.w,h:d.h}); } idx+=rc; ri.push({cells,rw:cells.reduce((a,c)=>a+c.w,0)+(rc-1)*gxx,rh:Math.max(...cells.map(c=>c.h))}); }
  const gh=ri.reduce((a,r)=>a+r.rh,0)+(rows.length-1)*gyy; let yy=RY+(RH-gh)/2;
  for(const {cells,rw,rh} of ri){ let xx=RX+(RW-rw)/2; for(const c of cells){ im.drawImage(c.img,Math.round(xx),Math.round(yy+(rh-c.h)/2),c.w,c.h); xx+=c.w+gxx; } yy+=rh+gyy; }
  return cv;
}

module.exports={ palette, isLight, front, back, backEmf, backMeaning, kwSleeveEmf, kwSleeveMeaning, kwSleeveStd, titleSleeve, titleSleeveHeaven, zipFrontPf, GOLD, SILVER, WHITE };

// ---------- title sleeve variant: RED bg, MajorManifestor in EMF spectrum, .Shop small GOLD ----------
function titleSleeveEmf(){
  const W=450,H=1800; const cv=createCanvas(W,H), d=cv.getContext('2d'); d.fillStyle=rgb(RED); d.fillRect(0,0,W,H);
  const big=150, small=Math.round(150*SHOP_SCALE); const d0=createCanvas(4,4).getContext('2d'); d0.font=`${big}px ${FONT}`;
  const a='MajorManifestor',b='.Shop'; const wa=d0.measureText(a).width; d0.font=`${small}px ${FONT}`; const wb=d0.measureText(b).width;
  const strip=createCanvas(Math.ceil(wa+wb+60),360); const sd=strip.getContext('2d'); sd.textBaseline='top';
  // tiny dark edge so the spectrum holds on red
  sd.font=`${big}px ${FONT}`; sd.fillStyle='rgba(60,10,16,0.9)'; for(const dx of [-2,0,2]) for(const dy of [-2,0,2]) sd.fillText(a,20+dx,70+dy);
  // MajorManifestor per-letter EMF spectrum
  let x=20; const N=a.length;
  for(let i=0;i<N;i++){ const hue=0.78*(i/Math.max(1,N-1)); sd.fillStyle=rgb(hsv2rgb(hue,0.95,1.0)); sd.fillText(a[i],x,70); x+=sd.measureText(a[i]).width; }
  // .Shop small gold
  sd.font=`${small}px ${FONT}`; sd.fillStyle=rgb(GOLD); sd.fillText(b,20+wa,70+Math.round(150*0.30));
  let s=rotateM90(cropToContent(strip)); const ss=150,ty=50,by=H-50-ss; let avail=by-(ty+ss)-60;
  if(s.height>avail){ const r=avail/s.height; const ns=createCanvas(Math.round(s.width*r),avail); ns.getContext('2d').drawImage(s,0,0,ns.width,ns.height); s=ns; }
  d.drawImage(s,Math.round((W-s.width)/2),ty+ss+30+Math.round((avail-s.height)/2));
  d.drawImage(star4(ss,SILVER),Math.round((W-ss)/2),ty); d.drawImage(star4(ss,SILVER),Math.round((W-ss)/2),by); return cv;
}
module.exports.titleSleeveEmf = titleSleeveEmf;
