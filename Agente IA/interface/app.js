/* Vista genérica: los datos y las etiquetas provienen de PROJECT_CONFIGS. */
let config = PROJECT_CONFIGS.dental;
let period = 7;
let currentTab = 'resumen';
const labels = { resumen:'Resumen', actividad:'Actividad', reportes:'Reportes', configuracion:'Configuración' };
const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf = new Intl.NumberFormat('es-MX');
function records() {
  const result=[];
  config.counts.forEach((counts,day)=>{
    let seq=0;
    ['create','photo','check','error'].forEach((type,i)=>{
      for(let n=0;n<counts[i];n++) {
        seq++;
        result.push({id:`op-${day+21}-${String(seq).padStart(2,'0')}`,day:day+21,
          date:`2026-10-${day+21} ${String(9+Math.floor(seq/2)).padStart(2,'0')}:${seq%2?'15':'40'}`,
          kind:type==='error'?'photo':type, status:type==='error'?'error':'ok',
          reference:`${config.referencePrefix}-${day+21}${String(seq).padStart(3,'0')}`});
      }
    });
  });
  return result.filter(row=>row.day>=28-period).sort((a,b)=>b.date.localeCompare(a.date));
}
function filteredRecords() { const q=$('search').value.trim().toLocaleLowerCase('es'); const status=$('status').value;
  return records().filter(r=>(status==='all'||r.status===status)&&(`${config.actions[r.kind]} ${r.reference} ${r.id}`.toLocaleLowerCase('es').includes(q)));
}
function renderTable(id,rows) {
  $(id).innerHTML=rows.length?`<table><thead><tr><th>Operación</th><th>Referencia</th><th>Fecha y hora</th><th>Resultado</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="action"><span class="action-icon" aria-hidden="true">${esc(config.actionIcons[r.kind])}</span>${esc(config.actions[r.kind])}</td><td class="ref">${esc(r.reference)}</td><td>${r.date.slice(8,10)} oct, ${r.date.slice(11)}</td><td><span class="badge ${r.status==='error'?'error':''}">${r.status==='error'?'Fallida':'Completada'}</span></td></tr>`).join('')}</tbody></table>`:'<div class="empty">No hay operaciones para estos filtros.</div>';
}
function render() {
  const rows=records(), ok=rows.filter(r=>r.status==='ok'), fail=rows.length-ok.length;
  const rate=rows.length?100*ok.length/rows.length:0;
  const values={create:ok.filter(r=>r.kind==='create').length,photo:ok.filter(r=>r.kind==='photo').length,all:rows.length,rate:rate.toFixed(1)+' %'};
  $('metrics').innerHTML=config.metrics.map(m=>`<article class="metric"><div class="metric-top"><span>${esc(m.label)}</span><span class="metric-icon" aria-hidden="true">${esc(m.icon)}</span></div><div class="metric-value">${esc(values[m.key])}</div><div class="metric-note"><span>${m.key==='rate'?'Completadas / total':m.key==='all'?'Incluye fallidas':'Solo completadas'}</span> · ${period===1?'hoy':period+' días'}</div></article>`).join('');
  $('activity-count').textContent=nf.format(rows.length);
  $('date-label').textContent=period===1?'27 oct 2026':`${28-period} - 27 oct 2026`;
  const days=config.counts.slice(-period), totals=days.map(v=>v[0]+v[1]+v[2]);
  const max=Math.max(5,...totals), top=Math.ceil(max/5)*5;
  const W=600,H=205,L=38,R=18,T=20,B=33,pw=W-L-R,ph=H-T-B;
  const px=i=>L+(period===1?pw/2:i*pw/(period-1)),py=n=>T+ph-n/top*ph;
  let grid='', axis='';
  for(let i=0;i<=3;i++){let v=top*i/3,y=py(v);grid+=`<line x1="${L}" y1="${y}" x2="${W-R}" y2="${y}" stroke="#e8eff8" stroke-dasharray="3 4"/><text x="24" y="${y+3}" text-anchor="end" fill="#526b85" font-size="10">${Number(v.toFixed(1))}</text>`;}
  totals.forEach((v,i)=>{axis+=`<text x="${px(i)}" y="${H-8}" text-anchor="middle" fill="#526b85" font-size="10">${28-period+i} oct</text>`;});
  const points=totals.map((v,i)=>`${px(i)},${py(v)}`).join(' ');
  const area=`${px(0)},${T+ph} ${points} ${px(period-1)},${T+ph}`;
  $('trend').innerHTML=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Operaciones completadas: ${totals.map((v,i)=>`${28-period+i} de octubre, ${v}`).join('; ')}"><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${config.accent}" stop-opacity=".17"/><stop offset="1" stop-color="${config.accent}" stop-opacity=".01"/></linearGradient></defs>${grid}<polygon points="${area}" fill="url(#fill)"/><polyline points="${points}" fill="none" stroke="${config.accent}" stroke-width="2.5" stroke-linejoin="round"/>${totals.map((v,i)=>`<circle cx="${px(i)}" cy="${py(v)}" r="4" fill="white" stroke="${config.accent}" stroke-width="2"><title>${28-period+i} oct: ${v} completadas</title></circle>`).join('')}${axis}</svg>`;
  $('distribution').innerHTML=`<div class="donut-row"><div class="donut" role="img" aria-label="${ok.length} completadas y ${fail} fallidas" style="background:conic-gradient(${config.accent} 0 ${rate}%, #e2ae70 ${rate}% 100%)"><div class="donut-inner"><strong>${rate.toFixed(1)}<span style="font-size:14px">%</span></strong><span>de éxito</span></div></div><div class="result-legend"><div><i></i><span>Completadas<strong>${ok.length}</strong></span></div><div><i class="failed"></i><span>Fallidas<strong>${fail}</strong></span></div></div></div>`;
  renderTable('recent-table',rows.slice(0,4)); renderTable('activity-table',filteredRecords());
  $('report-summary').textContent=`En el periodo seleccionado se registraron ${rows.length} operaciones: ${ok.length} completadas y ${fail} fallidas. Tasa de éxito: ${rate.toFixed(1)} %.`;
  $('config-preview').textContent=JSON.stringify({name:config.name,agentName:config.agentName,accent:config.accent,sourceMode:config.sourceMode,metrics:config.metrics.map(({key,label})=>({key,label})),actions:config.actions},null,2);
}
function selectTab(tab) {
  currentTab=tab;
  document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!==tab);
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('breadcrumb').textContent=labels[tab];
  $('page-title').textContent=tab==='resumen'?'Cada acción, en perspectiva.':labels[tab];
  $('page-subtitle').textContent=tab==='resumen'?`Supervisa la actividad de ${config.agentName} desde un solo lugar.`:'Información clara para dar seguimiento al agente.';
}
function applyProject(key) {
  config=PROJECT_CONFIGS[key];
  document.documentElement.style.setProperty('--accent',config.accent);
  document.documentElement.style.setProperty('--soft',config.soft);
  $('brand').textContent=config.agentName.toLowerCase()+'.';
  $('project').textContent=config.name;$('breadcrumb-project').textContent=config.name;
  $('agent-name').textContent=`${config.agentName}, tu agente`;
  $('agent-description').textContent=config.description;
  document.querySelector('.model-chip').textContent=config.model;
  document.querySelector('.workspace-icon').textContent=config.name==='DentalRisk'?'DR':'AL';
  document.querySelector('.bottom-note>span:last-child').textContent=key==='dental'?'ESP-Claw → FastAPI → PostgreSQL / MinIO':'Agente → API → Inventario';
  document.querySelector('footer span').textContent=`${config.name} · Interfaz del agente · v01`;
  document.title=`${config.agentName} · Centro del agente`;
  $('search').value='';$('status').value='all';render();selectTab(currentTab);
}
function exportCSV() {
  // Evitar fórmulas al abrir texto no confiable en una hoja de cálculo.
  const cell=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'"+'$&').replace(/"/g,'""')+'"';
  const rows=filteredRecords();
  const csv='\ufeff'+[['Fecha','ID','Acción','Referencia','Resultado'],...rows.map(r=>[r.date,r.id,config.actions[r.kind],r.reference,r.status==='ok'?'Completada':'Fallida'])].map(r=>r.map(cell).join(',')).join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=`${config.agentName.toLowerCase()}-actividad-demo.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  $('toast').textContent=`Reporte descargado: ${rows.length} registros de ejemplo.`;$('toast').style.display='block';setTimeout(()=>$('toast').style.display='none',4000);
}
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{period=Number(b.dataset.period);document.querySelectorAll('[data-period]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});render();}));
$('search').addEventListener('input',()=>renderTable('activity-table',filteredRecords()));
$('status').addEventListener('change',()=>renderTable('activity-table',filteredRecords()));
$('project-select').addEventListener('change',e=>applyProject(e.target.value));
$('view-all').addEventListener('click',()=>selectTab('actividad'));
$('show-summary').addEventListener('click',()=>selectTab('resumen'));
$('export').addEventListener('click',exportCSV);$('report-export').addEventListener('click',exportCSV);
render();
