
// Blueprint Cleaner — Offline (images only).
// Pure-canvas heuristics (no external libs).

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

const logEl = document.getElementById('statusLog');
function log(m){ logEl.textContent = m; console.log('[BP]', m); }

// === Build tag ===

// ===== Dynamic pdf.js loader with fallbacks =====
async function loadScriptOnce(url){
  return new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = url + (url.includes('?') ? '&' : '?') + 'v=' + Date.now();
    tag.onload = () => resolve(true);
    tag.onerror = (e) => reject(new Error('Failed to load ' + url));
    document.head.appendChild(tag);
  });
}

async function ensurePDFJS(){
  log('ensurePDFJS: start');
  if (window.pdfjsLib && window.pdfjsLib.getDocument) {
    log('ensurePDFJS: already present');
    return window.pdfjsLib;
  }
  const cdns = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.js'
  ];
  const workers = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.7.76/pdf.worker.min.js',
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.js'
  ];
  let lastErr = null;
  for (let i=0;i<cdns.length;i++){
    try{
      log('Loading pdf.js from: ' + cdns[i]);
      await loadScriptOnce(cdns[i]);
      if (!window.pdfjsLib || !window.pdfjsLib.getDocument) throw new Error('pdf.js loaded but api missing');
      const worker = workers[i];
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker + '?v=' + Date.now();
      log('pdf.js ready via ' + cdns[i]);
      return window.pdfjsLib;
    }catch(e){
      lastErr = e;
      log('CDN load failed: ' + e.message);
    }
  }
  throw new Error('pdf.js not loaded (all CDNs failed): ' + (lastErr && lastErr.message ? lastErr.message : lastErr));
}
const BUILD_TAG = "build11 — 2025-09-08 01:10:52";
log('Loaded ' + BUILD_TAG);

// Clear Cache / SW button
const clearBtn = document.getElementById('clearCache');
if (clearBtn) {
  clearBtn.addEventListener('click', async () => {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) { await r.unregister(); }
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        for (const k of keys) { await caches.delete(k); }
      }
      log('Cache cleared. Hard reload this page.');
    } catch (e) {
      log('Cache clear error: ' + (e && e.message ? e.message : e));
    }
  });
}

// Compute SHA-256 of file for the log (helps confirm which file you picked)
async function sha256OfFile(file){
  try {
    const buf = await file.arrayBuffer();
    const hash = await crypto.subtle.digest('SHA-256', buf);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  } catch(e) { return '(hash failed)'; }
}




// === File-type sniffing (magic header) ===
async function isPDFFile(file){
  try {
    const head = await file.slice(0, 8).arrayBuffer();
    const bytes = new Uint8Array(head);
    // '%PDF-' in ASCII: 0x25 0x50 0x44 0x46 0x2D
    return bytes[0]===0x25 && bytes[1]===0x50 && bytes[2]===0x44 && bytes[3]===0x46 && bytes[4]===0x2D;
  } catch (e) {
    return false;
  }
}
// ===== PDF Support + Verbose Logging =====

const url = URL.createObjectURL(file);
  log('Loading image...'); try { await drawImageToCanvas(url); } catch(err){ log('Image load error: ' + (err && err.message ? err.message : err)); }
  URL.revokeObjectURL(url);
  log('Image ready.');
});

async function drawImageToCanvas(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const scale = Math.min(1600 / img.width, 1600 / img.height, 1);
  resizeCanvas(view, Math.floor(img.width*scale), Math.floor(img.height*scale));
  resizeCanvas(overlay, view.width, view.height);
  ctx.drawImage(img, 0, 0, view.width, view.height);
  originalImageData = ctx.getImageData(0,0,view.width,view.height);
  afterImageReady();
}

function resizeCanvas(c,w,h){ c.width=w; c.height=h; c.style.width='100%'; c.style.height='auto'; }

// Manual tools
function setDrawingMode(mode){
  drawingMode = mode;
  [brushErase, brushRestore].forEach(b => b.classList.remove('active'));
  if (mode === 'erase') brushErase.classList.add('active');
  if (mode === 'restore') brushRestore.classList.add('active');
  overlay.style.pointerEvents = drawingMode ? 'auto' : 'none';
}
brushErase.addEventListener('click', () => setDrawingMode(drawingMode === 'erase' ? null : 'erase'));
brushRestore.addEventListener('click', () => setDrawingMode(drawingMode === 'restore' ? null : 'restore'));

overlay.addEventListener('pointerdown', (e) => {
  if (!drawingMode) return;
  isDown = true; pushHistory(); paintAtEvent(e);
});
overlay.addEventListener('pointermove', (e) => { if (isDown) paintAtEvent(e); });
window.addEventListener('pointerup', () => { isDown = false; });

function paintAtEvent(e){
  const rect = overlay.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (overlay.width / rect.width);
  const y = (e.clientY - rect.top) * (overlay.height / rect.height);
  const r = parseInt(brushSize.value,10);

  if (drawingMode === 'erase') {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  } else if (drawingMode === 'restore' && originalImageData) {
    const ox = Math.max(0, Math.floor(x-r));
    const oy = Math.max(0, Math.floor(y-r));
    const w = Math.min(r*2, view.width - ox);
    const h = Math.min(r*2, view.height - oy);
    const tmp = ctx.createImageData(w, h);
    const src = originalImageData;
    for (let j=0; j<h; j++){
      const sy = oy + j;
      for (let i=0; i<w; i++){
        const sx = ox + i;
        const di = (j*w + i)*4;
        const si = (sy*view.width + sx)*4;
        tmp.data[di]   = src.data[si];
        tmp.data[di+1] = src.data[si+1];
        tmp.data[di+2] = src.data[si+2];
        tmp.data[di+3] = 255;
      }
    }
    ctx.putImageData(tmp, ox, oy);
  }
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = redoStack.length === 0;
}
undoBtn.addEventListener('click', () => {
  if (!history.length) return;
  const last = history.pop();
  redoStack.push(ctx.getImageData(0,0,view.width,view.height));
  ctx.putImageData(last, 0, 0);
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = false;
});
redoBtn.addEventListener('click', () => {
  if (!redoStack.length) return;
  history.push(ctx.getImageData(0,0,view.width,view.height));
  const next = redoStack.pop();
  ctx.putImageData(next, 0, 0);
  undoBtn.disabled = history.length === 0;
  redoBtn.disabled = redoStack.length === 0;
});
function pushHistory(){
  history.push(ctx.getImageData(0,0,view.width,view.height));
  redoStack = [];
  undoBtn.disabled = false; redoBtn.disabled = true;
}

// Download
dlPNG.addEventListener('click', () => {
  const url = view.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url; a.download = 'cleaned-blueprint.png'; a.click();
});

resetBtn.addEventListener('click', () => {
  if (originalImageData) ctx.putImageData(originalImageData, 0, 0);
  history = []; redoStack = [];
});

// === Pure-canvas "CV" helpers ===

// Convert current canvas to grayscale array
function getGray(){
  const img = ctx.getImageData(0,0,view.width,view.height);
  const g = new Uint8ClampedArray(img.width*img.height);
  const d = img.data;
  for (let i=0, j=0; i<d.length; i+=4, j++){
    g[j] = (d[i]*0.2126 + d[i+1]*0.7152 + d[i+2]*0.0722)|0;
  }
  return { g, w: img.width, h: img.height, img };
}

function putGrayToCanvas(gray, w, h){
  const img = ctx.createImageData(w,h);
  for (let i=0; i<gray.length; i++){
    const v = gray[i]; const j = i*4;
    img.data[j]=v; img.data[j+1]=v; img.data[j+2]=v; img.data[j+3]=255;
  }
  ctx.putImageData(img, 0, 0);
}

// Box blur (fast-ish)
function boxBlur(src, w, h, r){
  const tmp = new Uint16Array(w*h);
  const dst = new Uint8ClampedArray(w*h);
  // horizontal
  const div = r*2+1;
  for(let y=0;y<h;y++){
    let sum=0;
    for(let x=-r;x<=r;x++){ const xi=Math.min(w-1, Math.max(0,x)); sum+=src[y*w+xi]; }
    for(let x=0;x<w;x++){
      tmp[y*w+x]=sum;
      const x0 = Math.max(0,x-r), x1 = Math.min(w-1,x+r);
      const prev = Math.max(0,x-1-r), next = Math.min(w-1,x+1+r);
      sum += src[y*w+next]-src[y*w+prev];
    }
  }
  // vertical
  for(let x=0;x<w;x++){
    let sum=0;
    for(let y=-r;y<=r;y++){ const yi=Math.min(h-1, Math.max(0,y)); sum+=tmp[yi*w+x]; }
    for(let y=0;y<h;y++){
      const val = Math.round(sum/div);
      dst[y*w+x]=val;
      const y0 = Math.max(0,y-r), y1 = Math.min(h-1,y+r);
      const prev = Math.max(0,y-1-r), next = Math.min(h-1,y+1+r);
      sum += tmp[next*w+x]-tmp[prev*w+x];
    }
  }
  return dst;
}

// Threshold into binary mask (1=ink, 0=bg). Adaptive via blurred backdrop.
function adaptiveThreshold(gray, w, h, bias=8, radius=7){
  const blur = boxBlur(gray, w, h, radius);
  const bin = new Uint8Array(w*h);
  for(let i=0;i<gray.length;i++){
    bin[i] = gray[i] < Math.max(0, blur[i]-bias) ? 1 : 0;
  }
  return bin;
}

// Morphology
function erode(bin,w,h, k=1){
  const out = new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let keep=1;
      for(let j=-k;j<=k;j++){
        for(let i=-k;i<=k;i++){
          const xx=Math.min(w-1,Math.max(0,x+i));
          const yy=Math.min(h-1,Math.max(0,y+j));
          if(bin[yy*w+xx]===0){ keep=0; break; }
        }
        if(!keep) break;
      }
      out[y*w+x]=keep;
    }
  }
  return out;
}
function dilate(bin,w,h, k=1){
  const out = new Uint8Array(w*h);
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      let any=0;
      for(let j=-k;j<=k;j++){
        for(let i=-k;i<=k;i++){
          const xx=Math.min(w-1,Math.max(0,x+i));
          const yy=Math.min(h-1,Math.max(0,y+j));
          if(bin[yy*w+xx]===1){ any=1; break; }
        }
        if(any) break;
      }
      out[y*w+x]=any;
    }
  }
  return out;
}

// Connected components (4-neighborhood). Returns mask of comps >= minArea.
function filterByArea(bin,w,h,minArea, keepLarge=true){
  const visited = new Uint8Array(w*h);
  const out = new Uint8Array(w*h);
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      const idx = y*w+x;
      if(visited[idx] || bin[idx]===0) continue;
      // flood fill
      let stack=[idx], pts=[idx]; visited[idx]=1;
      while(stack.length){
        const p = stack.pop();
        const px = p%w, py = (p/ w)|0;
        for(const [dx,dy] of dirs){
          const nx=px+dx, ny=py+dy;
          if(nx<0||ny<0||nx>=w||ny>=h) continue;
          const ni = ny*w+nx;
          if(!visited[ni] && bin[ni]===1){
            visited[ni]=1; stack.push(ni); pts.push(ni);
          }
        }
      }
      const area = pts.length;
      const condition = keepLarge ? (area>=minArea) : (area<minArea);
      if(condition){ for(const p of pts) out[p]=1; }
    }
  }
  return out;
}

// Apply mask to original: erase where mask==0, keep where mask==1
function applyMaskEraseToCanvas(mask,w,h){
  const img = ctx.getImageData(0,0,w,h);
  const d = img.data;
  for(let i=0;i<mask.length;i++){
    if(mask[i]===0){ const j=i*4; d[j]=255; d[j+1]=255; d[j+2]=255; d[j+3]=255; }
  }
  ctx.putImageData(img,0,0);
}

// Draw edges (Canny-lite via Sobel + threshold) and dilate a bit to retrace
function retrace(){
  const { g,w,h,img } = getGray();
  const gx = sobel(g,w,h,'x'), gy = sobel(g,w,h,'y');
  const mag = new Uint16Array(w*h);
  for(let i=0;i<mag.length;i++){ const v = Math.hypot(gx[i], gy[i]); mag[i]=v; }
  const thresh = otsuFromArray(mag);
  const edges = new Uint8Array(w*h);
  for(let i=0;i<mag.length;i++){ edges[i] = mag[i] > thresh ? 1 : 0; }
  const thick = dilate(edges,w,h,1);
  const out = ctx.getImageData(0,0,w,h);
  for(let i=0;i<thick.length;i++){
    if(thick[i]){ const j=i*4; out.data[j]=0; out.data[j+1]=0; out.data[j+2]=0; out.data[j+3]=255; }
  }
  ctx.putImageData(out,0,0);
}

function sobel(g,w,h,dir){
  const out = new Int16Array(w*h);
  const kx = dir==='x' ? [-1,0,1,-2,0,2,-1,0,1] : [-1,-2,-1,0,0,0,1,2,1];
  for(let y=1;y<h-1;y++){
    for(let x=1;x<w-1;x++){
      let sum=0, t=0;
      for(let j=-1;j<=1;j++){
        for(let i=-1;i<=1;i++){
          const idx = (y+j)*w + (x+i);
          sum += g[idx] * kx[++t-1];
        }
      }
      out[y*w+x]=sum;
    }
  }
  return out;
}
function otsuFromArray(arr){
  // lightweight Otsu on 0..max range
  let max=0; for(const v of arr) if(v>max) max=v;
  const bins=256; const hist=new Uint32Array(bins);
  for(const v of arr){ const b = Math.min(bins-1, (v*255/max)|0); hist[b]++; }
  let sum=0, sumB=0, wB=0, wF=0, mB, mF, between=0, thresh=0; const total=arr.length;
  for(let i=0;i<bins;i++) sum += i*hist[i];
  for(let i=0;i<bins;i++){
    wB += hist[i]; if(!wB) continue;
    wF = total - wB; if(!wF) break;
    sumB += i*hist[i];
    mB = sumB / wB; mF = (sum - sumB) / wF;
    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > between){ between = varBetween; thresh=i; }
  }
  // Map back to magnitude domain is implicit in compare path
  // We return a level in 0..max mapped by bins.
  return (thresh/255)*max;
}

// Auto-clean click
runCleanBtn.addEventListener('click', () => {
  if (!originalImageData) return;
  log('Running clean...');
  pushHistory();

  const { g,w,h } = getGray();
  const bin = adaptiveThreshold(g,w,h, 8, 7); // ink=1
  const kSize = parseInt(lineThresh.value,10);
  const minArea = parseInt(areaThresh.value,10);

  if (modeSel.value === 'clean_dims') {
    // break thin lines by erosion, then keep larger bits
    const er = erode(bin,w,h, Math.max(1, Math.floor(kSize/3)));
    const keep = filterByArea(er,w,h, minArea*2, true);
    applyMaskEraseToCanvas(keep,w,h);
  } else if (modeSel.value === 'clean_text') {
    // remove small blobs (likely text)
    const keep = filterByArea(bin,w,h, minArea, true);
    applyMaskEraseToCanvas(keep,w,h);
  } else if (modeSel.value === 'walls_only') {
    // keep only large structures
    const keep = filterByArea(bin,w,h, minArea*3, true);
    // Paint white then draw original where keep==1
    const src = ctx.getImageData(0,0,w,h);
    const out = ctx.createImageData(w,h);
    for(let i=0;i<keep.length;i++){
      const j=i*4;
      if(keep[i]){
        out.data[j]=src.data[j]; out.data[j+1]=src.data[j+1]; out.data[j+2]=src.data[j+2]; out.data[j+3]=255;
      } else {
        out.data[j]=255; out.data[j+1]=255; out.data[j+2]=255; out.data[j+3]=255;
      }
    }
    ctx.putImageData(out,0,0);
  }

  log('Clean finished.');
});

retraceBtn.addEventListener('click', () => {
  if (!originalImageData) return;
  log('Retracing walls...'); pushHistory(); retrace(); log('Retrace done.');
});
