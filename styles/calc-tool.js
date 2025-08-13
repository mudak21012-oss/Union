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

  // --- Referencias clave (IDs originales dentro de #calc-app) ---
  // Tabs internas
  const tabs = $$('.tab');
  const tabContents = $$('.tab-content');
  const progressBar = $('#progressBar');

  // Botones de navegación
  const nextButtons = $$('.next-tab');
  const prevButtons = $$('.prev-tab');

  // Exportación
  const exportBtn = $('#exportPDFBtn');

  // Utilidades
  function switchTab(key){
    tabs.forEach(t=>{
      const is = t.dataset.tab === key;
      t.classList.toggle('active', is);
    });
    tabContents.forEach(c=>{
      const id = c.id.replace('-tab','');
      c.classList.toggle('active', id === key);
    });
    updateProgress(key);
  }

  function getCurrentTab(){
    const t = tabs.find(t=> t.classList.contains('active'));
    return t?.dataset.tab || 'basic';
  }

  function updateProgress(key){
    const order = ['basic','printing','shipping','results'];
    const idx = Math.max(0, order.indexOf(key));
    const pct = ((idx+1)/order.length)*100;
    if (progressBar) progressBar.style.width = pct+'%';
  }

  // Validación mínima por pestaña (reemplaza/expande con tu lógica original)
  function validateTab(key){
    // Ejemplo: en "basic" que algunos campos requeridos no estén vacíos
    if (key==='basic'){
      const req = ['#tipoFilamento','#costoFilamento','#nombreImpresora','#costoImpresora']
        .map(id=> $(id)).filter(Boolean);
      let ok = true;
      req.forEach(inp=>{
        const good = !!inp.value;
        inp.classList.toggle('error', !good);
        if (!good) ok = false;
      });
      return ok;
    }
    return true;
  }

  // Debounce helper
  const debounce = (fn, ms=160)=> (...args)=>{ clearTimeout(debTimer); debTimer=setTimeout(()=>fn(...args), ms); };

  // --- Cálculo (simplificado; pega tu lógica original aquí) ---
  function parseNum(id, def=0){ const el=$(id); return el? Number(el.value||def) : def; }

  function recalc(){
    // Variables base de tus campos:
    const costoFilamentoKg = parseNum('#costoFilamento', 0);
    const gramos = parseNum('#gramosFilamento', 0);
    const horasImp = parseNum('#horasImpresion', 0);
    const sueldoHora = parseNum('#sueldoHora', 0);
    const gananciaHora = parseNum('#gananciaHora', 0);
    const ivaPct = parseNum('#iva', 21)/100;
    const ml = root.querySelector('#mercadoLibre')?.checked ? 0.10 : 0;

    // Ejemplo de cálculo base (ajusta/pega aquí tu fórmula original):
    const filamento = (costoFilamentoKg/1000)*gramos;
    const manoObra = horasImp*sueldoHora;
    const ganancia  = horasImp*gananciaHora;

    // Suma otros módulos opcionales según toggles (pega tu lógica)
    const envio = parseNum('#envioNacional', 0);
    // ...

    const subtotal = filamento + manoObra + ganancia + envio;
    const recargoML = subtotal * ml;
    const iva = (subtotal + recargoML) * ivaPct;
    const total = Math.round(subtotal + recargoML + iva);

    // Actualiza UI
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

  // Enlaza inputs que afectan cálculo (puedes ampliar a todos tus campos)
  root.addEventListener('input', (e)=>{
    const t = e.target;
    if (t.matches('input, select')) recalcDebounced();
  });

  // Navegación interna
  tabs.forEach(tab=>{
    tab.addEventListener('click', ()=> switchTab(tab.dataset.tab));
  });
  nextButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const from = getCurrentTab();
      if (!validateTab(from)) return;
      const next = btn.dataset.next;
      switchTab(next);
    });
  });
  prevButtons.forEach(btn=>{
    btn.addEventListener('click', ()=> switchTab(btn.dataset.prev));
  });

  // Exportación PDF (carga bajo demanda)
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
      // jsPDF UMD expone window.jspdf
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const cliente = $('#nombreCliente')?.value || '';
      const total = $('#totalFinalCell')?.textContent || '—';

      doc.text('Presupuesto Hoho3D', 14, 18);
      if (cliente) doc.text(`Cliente: ${cliente}`, 14, 26);
      doc.text(`Total recomendado: ${total}`, 14, 34);

      // Tabla (autotable)
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

  // Estado inicial
  switchTab('basic');
  recalc(); // primer cálculo para poblar placeholders
  inited = true;
}

export function onShow(){ /* no-op */ }
export function onHide(){ /* no-op */ }
