
// === Blueprint Cleaner (build17) ===
// Repo-ready, No SW. Verbose logs + PDF loader.

// ---- DOM refs ----
const fileInput = document.getElementById('fileInput');
const view = document.getElementById('view');
const overlay = document.getElementById('overlay');
const ctx = view.getContext('2d');
const octx = overlay.getContext('2d');
const dlPNG = document.getElementById('downloadPNG');
const runCleanBtn = document.getElementById('runClean');
const retraceBtn = document.getElementById('retraceLines');
const resetBtn = document.getElementById('resetImg');
const modeSel = document.getElementById('mode');
const lineThresh = document.getElementById('lineThresh');
const areaThresh = document.getElementById('areaThresh');
const brushErase = document.getElementById('brushErase');
const brushRestore = document.getElementById('brushRestore');
const brushSize = document.getElementById('brushSize');
const undoBtn = document.getElementById('undo');
const redoBtn = document.getElementById('redo');
const zoomFitBtn = document.getElementById('zoomFit');
const zoom100Btn = document.getElementById('zoom100');
const toggleLogBtn = document.getElementById('toggleLog');
const statusLog = document.getElementById('statusLog');

// ---- Logging ----
function log(m){ if(statusLog){ statusLog.textContent = String(m); } console.log('[BP17]', m); }
log('Loaded build17');

// ---- State ----
let originalImageData = null;
let history = [];
let redoStack = [];
let drawingMode = null;
let isDown = false;
let scaleCSS = 1;

// ---- Utils ----
function resizeCanvas(c,w,h){ c.width=w; c.height=h; c.style.width='100%'; c.style.height='auto'; }
function applyZoom(){
  view.style.transformOrigin = 'top left';
  view.style.transform = `scale(${scaleCSS})`;
  overlay.style.transformOrigin = 'top left';
  overlay.style.transform = `scale(${scaleCSS})`;
  overlay.style.pointerEvents = drawingMode ? 'auto' : 'none';
}
function zoomToFit(){
  const container = document.querySelector('.canvases');
  if (!container) return;
  const fit = (container.clientWidth - 16) / view.width;
  scaleCSS = Math.max(0.1, Math.min(2.0, fit));
  applyZoom();
}
function zoom100(){ scaleCSS = 1; applyZoom(); }

if (zoomFitBtn) zoomFitBtn.addEventListener('click', zoomToFit);
if (zoom100Btn) zoom100Btn.addEventListener('click', zoom100);
if (toggleLogBtn) toggleLogBtn.addEventListener('click', ()=>{
  const vis = statusLog.style.display !== 'none';
  statusLog.style.display = vis ? 'none' : 'block';
  toggleLogBtn.textContent = vis ? 'Show Log' : 'Hide Log';
});

function enableEditing(){
  log('Enabling tools...');
  resetBtn && (resetBtn.disabled = false);
  dlPNG && (dlPNG.disabled = false);
  runCleanBtn && (runCleanBtn.disabled = false);
  retraceBtn && (retraceBtn.disabled = false);
  brushErase && (brushErase.disabled = false);
  brushRestore && (brushRestore.disabled = false);
  undoBtn && (undoBtn.disabled = history.length === 0);
  redoBtn && (redoBtn.disabled = redoStack.length === 0);
  zoomFitBtn && (zoomFitBtn.disabled = false);
  zoom100Btn && (zoom100Btn.disabled = false);
}

function afterImageReady(){
  enableEditing();
  zoomToFit();
  document.querySelector('.canvases')?.scrollIntoView({ behavior:'smooth', block:'start' });
  log('Image ready.');
}

// ---- File helpers ----
async function sha256OfFile(file){
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  } catch(e){ return '(hash failed)'; }
}

async function isPDFFile(file){
  try {
    const head = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(head);
    return bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && bytes[4]===0x2D; // %PDF-
  } catch { return false; }
}


// ---- Local pdf.js loader (no network) ----
async function loadLocalScript(path){
  return new Promise((resolve, reject)=>{
    const tag = document.createElement('script');
    tag.src = path + '?v=' + Date.now(); // bust any CDN/proxy cache
    tag.onload = ()=>resolve(true);
    tag.onerror = ()=>reject(new Error('Failed to load ' + path));
    document.head.appendChild(tag);
  });
}

async function ensurePDFJS(){
  log('ensurePDFJS: start (local)');
  if (window.pdfjsLib && window.pdfjsLib.getDocument){
    log('ensurePDFJS: already present (local)');
    return window.pdfjsLib;
  }
  const core = './lib/pdf.min.js';
  const worker = './lib/pdf.worker.min.js';
  try{
    await loadLocalScript(core);
    if (!window.pdfjsLib || !window.pdfjsLib.getDocument){
      throw new Error('pdf.js API missing after local load');
    }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker + '?v=' + Date.now();
    log('pdf.js ready (local)');
    return window.pdfjsLib;
  }catch(e){
    log('Local pdf.js load failed: ' + e.message + '. Make sure files exist at ./lib/pdf.min.js and ./lib/pdf.worker.min.js');
    throw e;
  }
}


// ---- Renderers ----
async function drawImageToCanvas(url){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    const to = setTimeout(()=>reject(new Error('Image decode timeout')), 12000);
    img.onload = ()=>{
      try{
        clearTimeout(to);
        const max = 2000;
        const scale = Math.min(max/img.width, max/img.height, 1);
        resizeCanvas(view, Math.floor(img.width*scale), Math.floor(img.height*scale));
        resizeCanvas(overlay, view.width, view.height);
        ctx.drawImage(img, 0, 0, view.width, view.height);
        originalImageData = ctx.getImageData(0,0,view.width,view.height);
        afterImageReady();
        URL.revokeObjectURL(url);
        resolve();
      }catch(e){ reject(e); }
    };
    img.onerror = ()=>{ clearTimeout(to); reject(new Error('Image decode failed')); };
    img.src = url;
  });
}

async function handlePDF(file){
  log('Reading PDF file...');
  const buf = await file.arrayBuffer();
  const pdfjsLib = await ensurePDFJS();
  let doc;
  try { doc = await pdfjsLib.getDocument({ data: buf }).promise; }
  catch(e){ log('getDocument failed: ' + e.message); throw e; }
  log('PDF loaded with ' + doc.numPages + ' pages');
  let page;
  try { page = await doc.getPage(1); }
  catch(e){ log('getPage(1) failed: ' + e.message); throw e; }
  const viewport = page.getViewport({ scale: 1.5 });
  resizeCanvas(view, Math.floor(viewport.width), Math.floor(viewport.height));
  resizeCanvas(overlay, view.width, view.height);
  log('Rendering with size ' + view.width + 'x' + view.height);
  const task = page.render({ canvasContext: ctx, viewport });
  await task.promise;
  originalImageData = ctx.getImageData(0,0,view.width,view.height);
  afterImageReady();
}

// ---- File input handler ----
if (fileInput){
  fileInput.addEventListener('change', async (e)=>{
    const file = e.target.files && e.target.files[0];
    if (!file){ log('No file selected'); return; }
    log('Picked: ' + file.name + ' | type=' + (file.type||'(none)') + ' | size=' + file.size + ' bytes');
    const h = await file.slice(0,16).arrayBuffer();
    const u = new Uint8Array(h);
    const hex = Array.from(u).map(b=>b.toString(16).padStart(2,'0')).join(' ');
    log('Header bytes: ' + hex);
    const sum = await sha256OfFile(file);
    log('SHA-256: ' + sum);
    const pdfHeader = await isPDFFile(file);
    const looksLikePDF = pdfHeader || (file.name||'').toLowerCase().endsWith('.pdf') || ((file.type||'').toLowerCase().includes('pdf'));
    log('Header sniff: ' + (pdfHeader ? 'PDF detected' : 'Not PDF'));
    log('Branch: ' + (looksLikePDF ? 'PDF path' : 'Image path'));
    try{
      if (looksLikePDF){ await handlePDF(file); }
      else {
        const url = URL.createObjectURL(file);
        log('Loading image...');
        await drawImageToCanvas(url);
      }
    }catch(err){
      log('Open/render error: ' + (err && err.message ? err.message : err));
    }
  });
}

// ---- Manual tools (erase/restore) ----
function setDrawingMode(mode){
  drawingMode = mode;
  [brushErase, brushRestore].forEach(b=>{ if(b) b.classList.remove('active'); });
  if (mode === 'erase' && brushErase) brushErase.classList.add('active');
  if (mode === 'restore' && brushRestore) brushRestore.classList.add('active');
  overlay.style.pointerEvents = drawingMode ? 'auto' : 'none';
}
if (brushErase) brushErase.addEventListener('click', ()=> setDrawingMode(drawingMode==='erase'? null : 'erase'));
if (brushRestore) brushRestore.addEventListener('click', ()=> setDrawingMode(drawingMode==='restore'? null : 'restore'));
overlay.addEventListener('pointerdown', (e)=>{ if (!drawingMode) return; isDown=true; pushHistory(); paintAtEvent(e); });
overlay.addEventListener('pointermove', (e)=>{ if (isDown) paintAtEvent(e); });
window.addEventListener('pointerup', ()=>{ isDown=false; });

function paintAtEvent(e){
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (overlay.width / rect.width);
  const y = (e.clientY - rect.top) * (overlay.height / rect.height);
  const r = parseInt(brushSize.value||'20',10);
  if (drawingMode === 'erase'){
    ctx.save(); ctx.globalCompositeOperation='destination-out';
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore();
  } else if (drawingMode === 'restore' && originalImageData){
    const ox = Math.max(0, Math.floor(x-r));
    const oy = Math.max(0, Math.floor(y-r));
    const w = Math.min(r*2, view.width-ox);
    const h = Math.min(r*2, view.height-oy);
    const tmp = ctx.createImageData(w,h);
    const src = originalImageData;
    for(let j=0;j<h;j++){
      const sy = oy+j;
      for(let i=0;i<w;i++){
        const sx = ox+i;
        const di = (j*w+i)*4;
        const si = (sy*view.width+sx)*4;
        tmp.data[di]   = src.data[si];
        tmp.data[di+1] = src.data[si+1];
        tmp.data[di+2] = src.data[si+2];
        tmp.data[di+3] = 255;
      }
    }
    ctx.putImageData(tmp, ox, oy);
  }
  undoBtn && (undoBtn.disabled = history.length === 0);
  redoBtn && (redoBtn.disabled = redoStack.length === 0);
}

function pushHistory(){
  history.push(ctx.getImageData(0,0,view.width,view.height));
  redoStack = [];
  if (undoBtn) undoBtn.disabled = false;
  if (redoBtn) redoBtn.disabled = true;
}

if (undoBtn) undoBtn.addEventListener('click', ()=>{
  if (!history.length) return;
  const last = history.pop();
  redoStack.push(ctx.getImageData(0,0,view.width,view.height));
  ctx.putImageData(last,0,0);
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = false;
});
if (redoBtn) redoBtn.addEventListener('click', ()=>{
  if (!redoStack.length) return;
  history.push(ctx.getImageData(0,0,view.width,view.height));
  const next = redoStack.pop();
  ctx.putImageData(next,0,0);
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = redoStack.length === 0;
});

// ---- Download PNG ----
if (dlPNG){
  dlPNG.addEventListener('click', ()=>{
    const url = view.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'cleaned-blueprint.png'; a.click();
  });
}

// ---- Auto-clean (lightweight, image-only) ----
// (Same basic heuristics as earlier builds; kept lightweight here.)
function getGray(){
  const img = ctx.getImageData(0,0,view.width,view.height);
  const g = new Uint8ClampedArray(img.width*img.height);
  const d = img.data;
  for (let i=0,j=0;i<d.length;i+=4,j++){ g[j]=(d[i]*0.2126+d[i+1]*0.7152+d[i+2]*0.0722)|0; }
  return { g, w: img.width, h: img.height };
}
function boxBlur(src,w,h,r){
  const tmp=new Uint16Array(w*h), dst=new Uint8ClampedArray(w*h), div=r*2+1;
  for(let y=0;y<h;y++){
    let sum=0; for(let x=-r;x<=r;x++){ const xi=Math.min(w-1,Math.max(0,x)); sum+=src[y*w+xi]; }
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum;
      const prev=Math.max(0,x-1-r), next=Math.min(w-1,x+1+r);
      sum += src[y*w+next]-src[y*w+prev];
    }
  }
  for(let x=0;x<w;x++){
    let sum=0; for(let y=-r;y<=r;y++){ const yi=Math.min(h-1,Math.max(0,y)); sum+=tmp[yi*w+x]; }
    for(let y=0;y<h;y++){
      dst[y*w+x]=Math.round(sum/div);
      const prev=Math.max(0,y-1-r), next=Math.min(h-1,y+1+r);
      sum += tmp[next*w+x]-tmp[prev*w+x];
    }
  }
  return dst;
}
function adaptiveThreshold(gray,w,h,bias=8,radius=7){
  const blur=boxBlur(gray,w,h,radius); const bin=new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++){ bin[i]= gray[i] < Math.max(0, blur[i]-bias) ? 1:0; }
  return bin;
}
function erode(bin,w,h,k=1){
  const out=new Uint8Array(w*h);
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){
    let keep=1;
    for(let j=-k;j<=k;j++){ for(let i=-k;i<=k;i++){
      const xx=Math.min(w-1,Math.max(0,x+i)), yy=Math.min(h-1,Math.max(0,y+j));
      if(bin[yy*w+xx]===0){ keep=0; break; }
    } if(!keep) break; }
    out[y*w+x]=keep;
  }} return out;
}
function filterByArea(bin,w,h,minArea, keepLarge=true){
  const visited=new Uint8Array(w*h), out=new Uint8Array(w*h);
  const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++){ for(let x=0;x<w;x++){
    const idx=y*w+x; if(visited[idx]||bin[idx]===0) continue;
    let stack=[idx], pts=[idx]; visited[idx]=1;
    while(stack.length){
      const p=stack.pop(), px=p%w, py=(p/w)|0;
      for(const [dx,dy] of dirs){
        const nx=px+dx, ny=py+dy; if(nx<0||ny<0||nx>=w||ny>=h) continue;
        const ni=ny*w+nx; if(!visited[ni] && bin[ni]===1){ visited[ni]=1; stack.push(ni); pts.push(ni); }
      }
    }
    const area=pts.length, cond= keepLarge? (area>=minArea):(area<minArea);
    if(cond){ for(const p of pts) out[p]=1; }
  }} return out;
}
function applyMaskEraseToCanvas(mask,w,h){
  const img=ctx.getImageData(0,0,w,h), d=img.data;
  for(let i=0;i<mask.length;i++){ if(mask[i]===0){ const j=i*4; d[j]=255; d[j+1]=255; d[j+2]=255; d[j+3]=255; } }
  ctx.putImageData(img,0,0);
}
function retrace(){
  const { g,w,h } = getGray();
  const gx = sobel(g,w,h,'x'), gy = sobel(g,w,h,'y');
  const mag = new Uint16Array(w*h);
  for(let i=0;i<mag.length;i++){ mag[i]=Math.hypot(gx[i],gy[i]); }
  const th = otsuFromArray(mag);
  const edges=new Uint8Array(w*h);
  for(let i=0;i<mag.length;i++){ edges[i]= mag[i]>th ? 1:0; }
  const thick = erode(edges,w,h, -1) || edges; // placeholder (no dilate impl); edges enough
  const out=ctx.getImageData(0,0,w,h);
  for(let i=0;i<thick.length;i++){ if(thick[i]){ const j=i*4; out.data[j]=0; out.data[j+1]=0; out.data[j+2]=0; out.data[j+3]=255; } }
  ctx.putImageData(out,0,0);
}
function sobel(g,w,h,dir){
  const out=new Int16Array(w*h);
  const k = (dir==='x')? [-1,0,1,-2,0,2,-1,0,1] : [-1,-2,-1,0,0,0,1,2,1];
  for(let y=1;y<h-1;y++){ for(let x=1;x<w-1;x++){
    let sum=0, t=0; for(let j=-1;j<=1;j++){ for(let i=-1;i<=1;i++){ sum += g[(y+j)*w+(x+i)] * k[t++]; } }
    out[y*w+x]=sum;
  }} return out;
}
function otsuFromArray(arr){
  let max=0; for(const v of arr) if(v>max) max=v;
  const bins=256, hist=new Uint32Array(bins);
  for(const v of arr){ const b=Math.min(bins-1, (v*255/max)|0); hist[b]++; }
  let sum=0,sumB=0,wB=0,wF=0,between=0,th=0,total=arr.length;
  for(let i=0;i<bins;i++) sum += i*hist[i];
  for(let i=0;i<bins;i++){
    wB+=hist[i]; if(!wB) continue;
    wF=total-wB; if(!wF) break;
    sumB += i*hist[i];
    const mB=sumB/wB, mF=(sum-sumB)/wF;
    const vb=wB*wF*(mB-mF)*(mB-mF);
    if(vb>between){ between=vb; th=i; }
  }
  return (th/255)*max;
}

if (runCleanBtn){
  runCleanBtn.addEventListener('click', ()=>{
    if (!originalImageData) return;
    log('Running clean...'); pushHistory();
    const { g,w,h } = getGray();
    const bin = adaptiveThreshold(g,w,h,8,7);
    const kSize = parseInt(lineThresh.value||'5',10);
    const minArea = parseInt(areaThresh.value||'120',10);
    if (modeSel.value==='clean_dims'){
      const er = erode(bin,w,h, Math.max(1,Math.floor(kSize/3)));
      const keep = filterByArea(er,w,h, minArea*2, true);
      applyMaskEraseToCanvas(keep,w,h);
    } else if (modeSel.value==='clean_text'){
      const keep = filterByArea(bin,w,h, minArea, true);
      applyMaskEraseToCanvas(keep,w,h);
    } else if (modeSel.value==='walls_only'){
      const keep = filterByArea(bin,w,h, minArea*3, true);
      const src=ctx.getImageData(0,0,w,h), out=ctx.createImageData(w,h);
      for(let i=0;i<keep.length;i++){ const j=i*4;
        if(keep[i]){ out.data[j]=src.data[j]; out.data[j+1]=src.data[j+1]; out.data[j+2]=src.data[j+2]; out.data[j+3]=255; }
        else { out.data[j]=255; out.data[j+1]=255; out.data[j+2]=255; out.data[j+3]=255; }
      }
      ctx.putImageData(out,0,0);
    }
    log('Clean finished.');
  });
}

if (retraceBtn){
  retraceBtn.addEventListener('click', ()=>{ if(!originalImageData) return; log('Retracing...'); pushHistory(); retrace(); log('Retrace done.'); });
}

if (resetBtn){
  resetBtn.addEventListener('click', ()=>{ if (originalImageData) ctx.putImageData(originalImageData,0,0); history=[]; redoStack=[]; });
}
