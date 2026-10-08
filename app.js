const API='https://openlibrary.org', COV='https://covers.openlibrary.org/b/id/';
const $=s=>document.querySelector(s);
let COLORS=[],GENRES=[],TRIES=[],STOP=new Set();
let state={q:'',subject:'',page:1,total:0,items:[]};
let shelf=JSON.parse(safeGet('shelf')||'[]');

function safeGet(k){try{return localStorage.getItem(k)}catch(e){return null}}
function safeSet(k,v){try{localStorage.setItem(k,v)}catch(e){}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hue=t=>COLORS[[...t].reduce((a,c)=>a+c.charCodeAt(0),0)%COLORS.length];

function coverHTML(b,size='M'){
  return b.cover_i?`<div class="cover"><img loading="lazy" src="${COV}${b.cover_i}-${size}.jpg" alt="Cover of ${esc(b.title)}"></div>`
   :`<div class="cover ph" style="background:${hue(b.title)}">${esc(b.title)}</div>`;
}
function renderGenres(){
  $('#genres').innerHTML=GENRES.map(({name:g,color:c})=>`<button style="background:${c}" aria-pressed="${state.subject===g}" data-g="${g}">${g}</button>`).join('');
}
function skeleton(){$('#grid').innerHTML=Array(12).fill('<div class="sk"></div>').join('')}

async function load(append=false){
  if(!append){state.page=1;state.items=[];skeleton()}
  const fields='key,title,author_name,first_publish_year,cover_i,subject,edition_count';
  let p=new URLSearchParams({limit:24,page:state.page,fields,sort:state.q||state.subject?'':'rating'});
  if(state.subject&&!state.q)p.set('q','subject:"'+state.subject.toLowerCase()+'" has_fulltext:true');
  else if(state.q)p.set('q',state.q);
  else p.set('q','subject:fiction ratings_count:[50 TO *]');
  if(!p.get('sort'))p.delete('sort');
  try{
    const r=await fetch(API+'/search.json?'+p);
    if(!r.ok)throw 0;
    const d=await r.json();
    state.total=d.numFound;
    state.items=state.items.concat(d.docs);
    draw();
  }catch(e){
    $('#grid').innerHTML='<div class="msg">Could not reach Open Library. Check your internet connection and try again.</div>';
    $('#more').hidden=true;
  }
}
function draw(){
  const g=$('#grid');
  if(!state.items.length){g.innerHTML='<div class="msg">No books found. Try different words, like a topic or an author.</div>';$('#more').hidden=true;$('#meta').textContent='';return}
  g.innerHTML=state.items.map((b,i)=>`<button class="card" data-i="${i}">${coverHTML(b)}<h3>${esc(b.title)}</h3><small>${esc((b.author_name||['Unknown author'])[0])}${b.first_publish_year?' · '+b.first_publish_year:''}</small></button>`).join('');
  $('#meta').textContent=state.total.toLocaleString()+' books found';
  $('#more').hidden=state.items.length>=state.total;
}

function smartQuery(text){
  const t=text.trim();
  const m=t.match(/^books like (.+)$/i);
  const words=(m?m[1]:t).toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu,' ').split(/\s+/).filter(w=>w&&!STOP.has(w));
  return words.length?words.join(' '):t;
}
function search(text){
  if(!text.trim())return;
  state.subject='';state.q=smartQuery(text);renderGenres();
  $('#title').textContent='Results for “'+text.trim()+'”';
  load();
  document.getElementById('title').scrollIntoView({behavior:'smooth',block:'start'});
}

async function openBook(b){
  const dlg=$('#dlg'),saved=shelf.some(s=>s.key===b.key);
  const subs=(b.subject||[]).slice(0,5).map(s=>`<span>${esc(s)}</span>`).join('');
  $('#det').innerHTML=`<div class="det"><button class="x" aria-label="Close" onclick="dlg.close()">✕</button>${coverHTML(b,'L')}
   <div><h2>${esc(b.title)}</h2><p class="by">by ${esc((b.author_name||['Unknown author']).join(', '))}${b.first_publish_year?' · first published '+b.first_publish_year:''}</p>
   <div class="tags">${subs}</div><div class="desc" id="desc">Loading summary…</div>
   <div class="acts"><button class="pri" id="save" style="background:${saved?'var(--mint)':'var(--blue)'}">${saved?'On your shelf ✓':'Add to my shelf'}</button>
   <a href="${API}${b.key}" target="_blank" rel="noopener">Read on Open Library</a></div></div></div>`;
  dlg.showModal();
  $('#save').onclick=()=>{toggleShelf(b);openBook(b)};
  try{
    const w=await (await fetch(API+b.key+'.json')).json();
    const d=typeof w.description==='string'?w.description:w.description?.value;
    $('#desc').textContent=d?d.split('\n')[0].slice(0,700):'No summary is available for this book yet.';
  }catch(e){$('#desc').textContent='The summary could not be loaded.'}
}
function toggleShelf(b){
  shelf=shelf.some(s=>s.key===b.key)?shelf.filter(s=>s.key!==b.key):[...shelf,{key:b.key,title:b.title,author_name:b.author_name,first_publish_year:b.first_publish_year,cover_i:b.cover_i,subject:b.subject}];
  safeSet('shelf',JSON.stringify(shelf));$('#cnt').textContent=shelf.length;
}
function showShelf(){
  state.items=shelf.slice();state.total=shelf.length;state.q='';state.subject='';renderGenres();
  $('#title').textContent='My shelf';
  if(!shelf.length){$('#grid').innerHTML='<div class="msg">Your shelf is empty. Open any book and choose “Add to my shelf”.</div>';$('#meta').textContent='';$('#more').hidden=true}
  else draw();
  $('#title').scrollIntoView({behavior:'smooth'});
}

async function init(){
  let cfg;
  try{ cfg=await (await fetch('data/config.json')).json(); }
  catch(e){ cfg=window.LUMEN_CONFIG; }   // fallback when opened without a web server
  if(!cfg){
    $('#grid').innerHTML='<div class="msg">Could not load the site data (data/config.json or data/config.js).</div>';
    return;
  }
  COLORS=cfg.colors;GENRES=cfg.genres;TRIES=cfg.tries;STOP=new Set(cfg.stopWords);
  // events
  $('#f').onsubmit=e=>{e.preventDefault();search($('#q').value)};
  $('#tries').innerHTML=TRIES.map(t=>`<button type="button">${t}</button>`).join('');
  $('#tries').onclick=e=>{if(e.target.tagName==='BUTTON'){$('#q').value=e.target.textContent;search(e.target.textContent)}};
  $('#genres').onclick=e=>{const g=e.target.dataset.g;if(!g)return;state.subject=g;state.q='';renderGenres();$('#title').textContent=g;load()};
  $('#grid').onclick=e=>{const c=e.target.closest('.card');if(c)openBook(state.items[+c.dataset.i])};
  $('#more').onclick=()=>{state.page++;load(true)};
  $('#shelfBtn').onclick=showShelf;
  $('#dlg').addEventListener('click',e=>{if(e.target.id==='dlg')e.target.close()});
  $('#cnt').textContent=shelf.length;

  renderGenres();load();
  fetch(API+'/trending/daily.json?limit=8').then(r=>r.json()).then(d=>{
    $('#stack').innerHTML=d.works.filter(w=>w.cover_i).slice(0,4).map(w=>`<img src="${COV}${w.cover_i}-M.jpg" alt="">`).join('');
  }).catch(()=>{});
}
init();
