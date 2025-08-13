// color-tool.js
let initialized = false;
let root, cleanup = () => {};
let cache = { items: null, pool: null };
let wheelCtx, vbarCtx;
let draggingWheel = false, draggingV = false;
let H = 0, S = 1, V = 1, CX = 0, CY = 0, R = 0;
let lastRGB = null;

const SHEET_URL_DEFAULT = "https://docs.google.com/spreadsheets/d/e/2PACX-1vTZ-GFIahnmzB09C1GWCvAs1PaNXmpN2_Ed5taWtseTRlqx0P8-ZKJ28TOsvziFOw/pub?output=tsv";

export function initColorTool(container){
  if (initialized) return;
  root = container || document.getElementById('color-app');
  if (!root) throw new Error('color-app root no encontrado');

  const $  = (sel) => root.querySelector(sel);

  // Canvases (scoped)
  const wheel = $('#wheel');
  const vbar  = $('#vbar');
  if (!wheel || !vbar) {
    console.warn('Markup del Color Finder incompleto dentro de #color-app');
    initialized = true; // evita reintentos
    return;
  }
  wheelCtx = wheel.getContext('2d', { willReadFrequently:true });
  vbarCtx  = vbar.getContext('2d', { willReadFrequently:true });

  CX = wheel.width/2; CY = wheel.height/2; R = Math.min(wheel.width, wheel.height)/2 - 10;

  // IO refs (scoped)
  const $dot = $('#dot'), $selRgb = $('#sel-rgb'), $selHex = $('#sel-hex');
  const $mainSw = $('#main-sw'), $mainName = $('#main-name'), $mainBrand = $('#main-brand');
  const $mainType = $('#main-type'), $mainStyle = $('#main-style'), $mainTemp = $('#main-temp');
  const $mainStrength = $('#main-strength'), $mainHex = $('#main-hex'), $mainLink = $('#main-link');
  const $preview = $('#preview-img'), $ideasBtn = $('#ideas-btn'), $ideasBox = $('#ideas-box'), $ideasList = $('#ideas-list');
  const $sugs = $('#sugs'), $q = $('#q'), $typeFilter = $('#typeFilter');

  // Utils
  const clamp = (n,a,b)=>Math.min(b,Math.max(a,n));
  const normalizeHex = (h)=>{ if (typeof h !== 'string') return null;
    const s=h.trim(), r3=/^#?[0-9a-fA-F]{3}$/, r6=/^#?[0-9a-fA-F]{6}$/;
    if (r3.test(s)){ const p=s.replace('#',''); return '#'+p.split('').map(c=>c+c).join('').toLowerCase(); }
    if (r6.test(s)){ return '#'+s.replace('#','').toLowerCase(); } return null; };
  const hexToRgb = (hex) => { const h=hex.replace('#',''); return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)} };
  const rgbToHex = (r,g,b)=> '#'+[r,g,b].map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('');
  const rgbFromHsv = (h,s,v)=>{
    if (s===0){ const vv=Math.round(v*255); return {r:vv,g:vv,b:vv}; }
    let i=Math.floor(h*6), f=h*6-i, p=v*(1-s), q=v*(1-s*f), t=v*(1-s*(1-f)); i%=6;
    let r,g,b;
    if (i===0){ r=v; g=t; b=p; }
    else if(i===1){ r=q; g=v; b=p; }
    else if(i===2){ r=p; g=v; b=t; }
    else if(i===3){ r=p; g=q; b=v; }
    else if(i===4){ r=t; g=p; b=v; }
    else { r=v; g=p; b=q; }
    return { r:Math.round(r*255), g:Math.round(g*255), b:Math.round(b*255) };
  };
  const colorDistance = (a,b)=> Math.hypot(a.r-b.r, a.g-b.g, a.b-b.b);

  // Dibujo
  function drawWheel(){
    const img = wheelCtx.createImageData(wheel.width, wheel.height);
    for(let y=0;y<wheel.height;y++){
      for(let x=0;x<wheel.width;x++){
        const dx=x-CX, dy=y-CY, dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<=R){
          let ang=Math.atan2(dy,dx); if(ang<0) ang+=Math.PI*2;
          const hue=ang/(Math.PI*2), sat=dist/R;
          const {r,g,b} = rgbFromHsv(hue, sat, V);
          const i=(y*wheel.width + x)*4; img.data[i]=r; img.data[i+1]=g; img.data[i+2]=b; img.data[i+3]=255;
        }
      }
    }
    wheelCtx.putImageData(img,0,0);
  }
  function drawVBar(){
    const cTop = rgbFromHsv(H,S,1);
    const grd = vbarCtx.createLinearGradient(0,0,0,vbar.height);
    grd.addColorStop(0, `rgb(${cTop.r},${cTop.g},${cTop.b})`);
    grd.addColorStop(1, `rgb(0,0,0)`);
    vbarCtx.fillStyle=grd; vbarCtx.fillRect(0,0,vbar.width,vbar.height);
    const y=(1-V)*vbar.height; vbarCtx.fillStyle="#ffffff"; vbarCtx.fillRect(0,y-1,vbar.width,2);
  }

  // UI: pintar selección
  function reflectSelection(rgb){
    const hex = rgbToHex(rgb.r,rgb.g,rgb.b);
    if ($dot) $dot.style.background = hex;
    if ($selRgb) $selRgb.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    if ($selHex) $selHex.value = hex;
  }

  function renderMainCard(a){
    if(!a) return;
    $mainSw && ($mainSw.style.background = a.hex);
    $mainName && ($mainName.textContent = a.name || 'Sin nombre');
    $mainBrand && ($mainBrand.textContent = a.brand || '-');
    $mainType && ($mainType.textContent = a.type || '-');
    $mainStyle && ($mainStyle.textContent = a.style || '-');
    $mainTemp && ($mainTemp.textContent = a.temp || '-');
    $mainStrength && ($mainStrength.textContent = a.strength || '-');
    $mainHex && ($mainHex.textContent = a.hex);
    $mainLink && ($mainLink.href = a.link || '#');

    if (a.img && $preview){
      $preview.src = a.img; $preview.alt=`Vista previa ${a.name}`;
      $preview.onerror = ()=>{ $preview.removeAttribute('src'); };
      $preview.onclick = ()=> openLightbox(a.img);
    } else if ($preview) { $preview.removeAttribute('src'); $preview.onclick=null; }

    if ($ideasBox && $ideasBtn && $ideasList){
      $ideasBox.style.display = 'none'; $ideasList.innerHTML='';
      $ideasBtn.onclick = ()=>{
        $ideasList.innerHTML='';
        const ideas = (a.ideas||'').split(';').map(s=>s.trim()).filter(Boolean);
        if (!ideas.length){ $ideasList.innerHTML='<li style="color:var(--muted)">Sin ideas cargadas</li>'; }
        else ideas.forEach(t=>{ const li=document.createElement('li'); li.textContent=t; $ideasList.appendChild(li); });
        $ideasBox.style.display='block';
      };
    }
  }

  function rankAndRenderBy(rgb){
    if (!cache.pool || !cache.pool.length) return;
    const ranked = cache.pool
      .map(it=> ({it, d: colorDistance(rgb, it.rgb)}))
      .sort((a,b)=> a.d - b.d)
      .slice(0,3)
      .map(x=>x.it);
    const [a,b,c] = ranked;
    renderMainCard(a);
    const setSub = (pref, it) => {
      const sw = root.querySelector(`#${pref}-sw`);
      const nm = root.querySelector(`#${pref}-name`);
      const ds = root.querySelector(`#${pref}-desc`);
      const btn= root.querySelector(`#${pref}-btn`);
      if (!sw||!nm||!ds||!btn) return;
      if (!it){ sw.style.background='transparent'; nm.textContent='—'; ds.textContent='—'; btn.onclick=null; return; }
      sw.style.background = it.hex;
      nm.textContent = it.name || 'Sin nombre';
      ds.textContent = `${it.brand||'-'} · ${it.type||'-'} · ${it.style||'-'}`;
      btn.onclick = ()=> { renderMainCard(it); if (it.img) openLightbox(it.img); };
    };
    setSub('sub1', b); setSub('sub2', c);
  }

  // Gestos
  function updateFromWheel(clientX, clientY){
    const r = wheel.getBoundingClientRect();
    const sx = wheel.width / r.width, sy = wheel.height / r.height;
    const x = (clientX - r.left)*sx, y=(clientY - r.top)*sy;
    const dx=x-CX, dy=y-CY; const dist=Math.sqrt(dx*dx + dy*dy);
    if (dist>R) return;
    let ang=Math.atan2(dy,dx); if(ang<0) ang+=Math.PI*2;
    H = ang/(Math.PI*2); S = dist/R;
    const rgb = rgbFromHsv(H,S,V);
    lastRGB = rgb;
    reflectSelection(rgb);
    drawWheel(); drawVBar();
    rankAndRenderBy(rgb);
  }
  function updateFromVBar(clientY){
    const r = vbar.getBoundingClientRect();
    const sy = vbar.height / r.height;
    const y  = (clientY - r.top)*sy;
    V = Math.min(1, Math.max(0, 1 - (y/vbar.height)));
    const rgb = rgbFromHsv(H,S,V);
    lastRGB = rgb;
    reflectSelection(rgb);
    drawWheel(); drawVBar();
    rankAndRenderBy(rgb);
  }

  // Catálogo (carga única)
  async function loadCatalog(){
    if (cache.items) return cache.items;
    const sheetUrl = root.getAttribute('data-sheet-url') || SHEET_URL_DEFAULT;
    const res = await fetch(sheetUrl, {cache:'no-store', mode:'cors'});
    if (!res.ok) throw new Error('Error catálogo: '+res.status);
    let text = (await res.text()).replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
    if(/<\s*html/i.test(text)) throw new Error('La URL devolvió HTML. Publica como TSV/CSV');
    const head = text.split('\n')[0]; const delim = head.includes('\t')? '\t' : ',';
    const rows = text.trim().split('\n').map(l=>l.split(delim));
    const headers = rows.shift().map(h=>h.replace(/^"(.*)"$/,'$1').toLowerCase().trim());
    const ix = k => headers.indexOf(k);
    const idx={
      id: ix('id'),
      name: headers.includes('name')? ix('name') : ix('nombre'),
      hex: ix('hex'),
      brand: headers.includes('brand')? ix('brand') : ix('marca'),
      type: headers.includes('type')? ix('type') : ix('tipo'),
      style: headers.includes('style')? ix('style') : ix('estilo'),
      temp: headers.includes('temp')? ix('temp') : ix('temperatura'),
      strength: headers.includes('strength')? ix('strength') : ix('resistencia'),
      link: headers.includes('link')? ix('link') : ix('url'),
      img: headers.includes('img')? ix('img') : (headers.includes('image')? ix('image'): -1),
      ideas: headers.includes('ideas')? ix('ideas'): -1
    };
    if (idx.hex === -1) throw new Error('Falta columna HEX');
    const items = [];
    rows.forEach(r=>{
      const hex = normalizeHex(r[idx.hex]||''); if(!hex) return;
      const it = {
        id: idx.id!==-1? (r[idx.id]||'').trim() : '',
        name: idx.name!==-1? (r[idx.name]||'').trim() : '',
        hex, rgb: hexToRgb(hex),
        brand: idx.brand!==-1? (r[idx.brand]||'').trim() : '',
        type: idx.type!==-1? (r[idx.type]||'').trim() : '',
        style: idx.style!==-1? (r[idx.style]||'').trim() : '',
        temp: idx.temp!==-1? (r[idx.temp]||'').trim() : '',
        strength: idx.strength!==-1? (r[idx.strength]||'').trim() : '',
        link: idx.link!==-1? (r[idx.link]||'').trim() : '#',
        img: idx.img!==-1? (r[idx.img]||'').trim() : '',
        ideas: idx.ideas!==-1? (r[idx.ideas]||'').trim() : ''
      };
      items.push(it);
    });
    cache.items = items;
    cache.pool = items.slice();
    const firstImg = items[0]?.img;
    if (firstImg && $preview) {
      $preview.src = firstImg; $preview.alt = `Vista previa ${items[0].name||''}`;
    }
    return items;
  }

  // Buscador (debounce)
  let debounceT;
  function debounce(fn, ms=120){ return (...a)=>{ clearTimeout(debounceT); debounceT=setTimeout(()=>fn(...a), ms);} }
  const applySearch = debounce(()=>{
    const t = ($q?.value||'').toLowerCase();
    const ty = $typeFilter?.value || '*';
    const hits = (cache.items||[]).filter(it=>{
      const okType = (ty==='*') || (it.type||'').toLowerCase()===ty.toLowerCase();
      const hay = [it.name, it.brand, it.type, it.style, it.hex].join(' ').toLowerCase();
      return okType && (t==='' || hay.includes(t));
    });
    cache.pool = hits.length ? hits : (cache.items||[]);
    if (lastRGB) rankAndRenderBy(lastRGB);

    if ($sugs){
      $sugs.innerHTML = '';
      if (t && cache.pool.length){
        $sugs.style.display='bock';
        cache.pool.slice(0,10).forEach(it=>{
          const div = document.createElement('div');
          div.className='sug-item'; div.innerHTML = `
            <span class="sug-dot" style="background:${it.hex}"></span>
            <div><strong>${it.name||'Sin nombre'}</strong><div class="sug-meta">${it.brand||'-'} · ${it.type||'-'}</div></div>
            <small>${it.hex}</small>`;
          div.addEventListener('click', ()=>{ renderMainCard(it); $sugs.style.display='none'; });
          $sugs.appendChild(div);
        });
      } else {
        $sugs.style.display='none';
      }
    }
  }, 120);

  // Lightbox
  const $lightbox = root.querySelector('#lightbox');
  const $lbImg = root.querySelector('#lb-img');
  const $lbClose = root.querySelector('#lb-close');
  function openLightbox(src){
    if(!$lightbox) return;
    $lbImg.src = src;
    $lightbox.classList.add('show');
    $lbClose?.focus();
    const esc = e=>{ if(e.key==='Escape') closeLightbox(); };
    document.addEventListener('keydown', esc, {once:true});
  }
  function closeLightbox(){
    $lightbox?.classList.remove('show');
    $mainLink?.focus();
  }
  $lbClose?.addEventListener('click', closeLightbox);

  // Eyedropper modal (si lo usas)
  const $eyeModal = root.querySelector('#eyeModal');
  const $eyeClose = root.querySelector('#eye-close');
  $eyeClose?.addEventListener('click', ()=> $eyeModal?.classList.remove('show'));

  // Listeners intensivos
  function attachDragListeners(){
    const onMove = (e)=> { if(draggingWheel) updateFromWheel(e.clientX,e.clientY); if(draggingV) updateFromVBar(e.clientY); };
    const onUp   = ()=> { draggingWheel=false; draggingV=false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    cleanup = ()=>{ window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); cleanup=()=>{}; };
  }

  function activate(){
    drawWheel(); drawVBar();
    wheel.addEventListener('mousedown', e=>{ draggingWheel=true; updateFromWheel(e.clientX,e.clientY); }, {passive:true});
    vbar.addEventListener('mousedown',  e=>{ draggingV=true;  updateFromVBar(e.clientY); }, {passive:true});
    attachDragListeners();

    $q?.addEventListener('input', applySearch);
    $typeFilter?.addEventListener('change', applySearch);
  }

  initialized = true;
  loadCatalog().catch(console.error);
  activate();
}

export function onShow(){ /* reanudar si hace falta */ }
export function onHide(){ if (typeof cleanup === 'function') cleanup(); }
