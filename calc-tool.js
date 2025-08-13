// calc-tool.js
let inited = false;
let root;
let debTimer;

export function initCalcTool(container){
  if (inited) return;
  root = container || document.getElementById('calc-app');
  if (!root) throw new Error('calc-app root no encontrado');

  const $ = (sel)=> root.querySelector(sel);
  const $$= (sel)=> Array.from(root.querySelectorAll(sel));

  // Tabs internas
  const tabs = $$('.tab');
  const tabContents = $$('.tab-content');
  const progressBar = $('#progressBar');

  const nextButtons = $$('.next-tab');
  const prevButtons = $$('.prev-tab');
  const exportBtn = $('#exportPDFBtn');

  function switchTab(key){
    tabs.forEach(t=> t.classList.toggle('active', t.dataset.tab === key));
    tabContents.forEach(c=> c.classList.toggle('active', c.id.replace('-tab','') === key));
    updateProgress(key);
  }
  function getCurrentTab(){
    const t = tabs.find(t=> t.classList.contains('active'));
    return t?.dataset.tab || (tabs[0]?.dataset.tab || 'basic');
  }
  function updateProgress(key){
    const order = tabs.map(t=>t.dataset.tab);
    const idx = Math.max(0, order.indexOf(key));
    const pct = order.length ? ((idx+1)/order.length)*100 : 0;
    if (progressBar) progressBar.style.width = pct+'%';
  }

  const debounce = (fn, ms=160)=> (...args)=>{ clearTimeout(debTimer); debTimer=setTimeout(()=>fn(...args), ms); };
  function parseNum(sel, def=0){ const el=$(sel); return el? Number(el.value||def) : def; }

  function recalc(){
    const costoFilamentoKg = parseNum('#costoFilamento', 0);
    const gramos = parseNum('#gramosFilamento', 0);
    const horasImp = parseNum('#horasImpresion', 0);
    const sueldoHora = parseNum('#sueldoHora', 0);
    const gananciaHora = parseNum('#gananciaHora', 0);
    const ivaPct = parseNum('#iva', 21)/100;
    const ml = root.querySelector('#mercadoLibre')?.checked ? 0.10 : 0;
    const envio = parseNum('#envioNacional', 0);

    const filamento = (costoFilamentoKg/1000)*gramos;
    const manoObra = horasImp*sueldoHora;
    const ganancia  = horasImp*gananciaHora;
    const subtotal = filamento + manoObra + ganancia + envio;
    const recargoML = subtotal * ml;
    const iva = (subtotal + recargoML) * ivaPct;
    const total = Math.round(subtotal + recargoML + iva);

    const set = (sel, v)=>{ const el=$(sel); if (el) el.textContent = Number.isFinite(v) ? Intl.NumberFormat('es-AR').format(v) : '—'; };
    set('#filamentoCell', filamento);
    set('#manoObraCell', manoObra);
    set('#mlCell', recargoML);
    set('#ivaCell', iva);
    set('#totalFinalCell', total);
    const totalValue = $('#totalFinalValue'); if (totalValue) totalValue.textContent = Number.isFinite(total) ? 'ARS ' + Intl.NumberFormat('es-AR').format(total) : '—';
    const gPrev = $('#gananciaTotalPreview'); if (gPrev) gPrev.textContent = Number.isFinite(ganancia)? 'ARS '+Intl.NumberFormat('es-AR').format(ganancia) : '—';
    const sPrev = $('#sueldoTotalPreview'); if (sPrev) sPrev.textContent = Number.isFinite(manoObra)? 'ARS '+Intl.NumberFormat('es-AR').format(manoObra) : '—';
  }

  const recalcDebounced = debounce(recalc, 120);
  root.addEventListener('input', (e)=>{
    const t = e.target;
    if (t.matches('input, select')) recalcDebounced();
  });

  tabs.forEach(tab=> tab.addEventListener('click', ()=> switchTab(tab.dataset.tab)));
  nextButtons.forEach(btn=> btn.addEventListener('click', ()=>{
    const next = btn.dataset.next;
    if (!next) return; switchTab(next);
  }));
  prevButtons.forEach(btn=> btn.addEventListener('click', ()=>{
    const prev = btn.dataset.prev;
    if (!prev) return; switchTab(prev);
  }));

  let pdfLoaded = false;
  async function ensurePdfLibs(){
    if (pdfLoaded) return;
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
    pdfLoaded = true;
  }
  function loadScript(src){
    return new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = src; s.async = true; s.onload = ()=> res(); s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  exportBtn?.addEventListener('click', async ()=>{
    try{
      await ensurePdfLibs();
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const cliente = $('#nombreCliente')?.value || '';
      const total = $('#totalFinalCell')?.textContent || '—';

      doc.text('Presupuesto Hoho3D', 14, 18);
      if (cliente) doc.text(`Cliente: ${cliente}`, 14, 26);
      doc.text(`Total recomendado: ${total}`, 14, 34);

      const rows = [];
      [['Depreciación impresora', '#depImpresoraCell'],
       ['Depreciación PC', '#depPCCell'],
       ['Filamento utilizado', '#filamentoCell'],
       ['Electricidad impresora', '#electricidadCell'],
       ['Electricidad PC', '#electricidadPCCell'],
       ['Renta', '#rentaCell'],
       ['Consumibles', '#consumiblesCell'],
       ['Mano de obra', '#manoObraCell'],
       ['Postprocesado', '#postprocCell'],
       ['Pintura', '#pinturaCell'],
       ['Envío y empaque', '#envioCell'],
       ['Recargo ML', '#mlCell'],
       ['IVA', '#ivaCell'],
       ['TOTAL', '#totalFinalCell']]
       .forEach(([label, sel])=>{
         const val = root.querySelector(sel)?.textContent || '—';
         rows.push([label, val]);
       });

      doc.autoTable({ head:[['Concepto','Monto (ARS)']], body: rows, startY: 42 });
      doc.save('Presupuesto-Hoho3D.pdf');
    }catch(e){
      console.error(e);
      alert('No se pudo generar el PDF. Revisa la consola.');
    }
  });

  if (tabs[0]) switchTab(tabs[0].dataset.tab);
  recalc();
  inited = true;
}

export function onShow(){ /* no-op */ }
export function onHide(){ /* no-op */ }
