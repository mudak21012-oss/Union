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

  const wheel = $('#wheel');
  const vbar  = $('#vbar');
  if (!wheel || !vbar) {
    console.warn('Markup del Color Finder incompleto dentro de #color-app');
    initialized = true;
    return;
  }
  wheelCtx = wheel.getContext('2d', { willReadFrequently:true });
  vbarCtx  = vbar.getContext('2d', { willReadFrequently:true });

  CX = wheel.width/2; CY = wheel.height/2; R = Math.min(wheel.width, wheel.height)/2 - 10;

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

  const $dot = $('#dot'), $selRgb = $('#sel-rgb'), $selHex = $('#sel-hex');
  const $mainSw = $('#main-sw'), $mainName = $('#main-name'), $mainBrand = $('#main-brand');
  const $mainType = $('#main-type'), $mainStyle = $('#main-style'), $mainTemp = $('#main-temp');
  const $mainStrength = $('#main-strength'), $mainHex = $('#main-hex'), $mainLink = $('#main-link');
  const $preview = $('#preview-img'), $ideasBtn = $('#ideas-btn'), $ideasBox = $('#ideas-box'), $ideasList = $('#ideas-list');
  const $sugs = $('#sugs'), $q = $('#q'), $typeFilter = $('#typeFilter');

  function reflectSelection(rgb){
    const hex = rgbToHex(rgb.r,rgb.g,rgb.b);
    if ($dot) $dot.style.background = hex;
    if ($selRgb) $selRgb.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}
