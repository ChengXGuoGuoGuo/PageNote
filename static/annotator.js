(()=>{
  if(window.PageNote?.destroy)window.PageNote.destroy();
  const script=document.currentScript;
  const projectId=script?.dataset.projectId||'';
  const remote=Boolean(projectId);
  const pageKey=script?.dataset.pageKey||location.href.split('#')[0];
  const storageKey=`pagenote:v1:${pageKey}`;
  const state={notes:[],project:null,author:'',composing:false,editing:null,selection:null,drag:null,suppressClick:false};
  if(!remote){try{state.notes=JSON.parse(localStorage.getItem(storageKey)||'[]')}catch{state.notes=[]}}

  const host=document.createElement('div');
  host.id='pagenote-root';host.setAttribute('data-pagenote-ui','');
  const shadow=host.attachShadow({mode:'open'});
  shadow.innerHTML=`
    <style>
      :host{all:initial;--ink:#17211f;--muted:#68726f;--paper:#fbfaf6;--line:#d9ddd7;--accent:#f0643b;--accent2:#d94d27;font:14px/1.45 Inter,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);letter-spacing:0}*{box-sizing:border-box}button,textarea,input{font:inherit}
      .layer{position:fixed;inset:0;z-index:2147483646;pointer-events:none}.fab{position:absolute;right:20px;bottom:20px;display:flex;width:52px;height:52px;align-items:center;justify-content:center;border:0;border-radius:14px;background:var(--ink);color:#fff;box-shadow:0 12px 34px rgba(23,33,31,.26);cursor:pointer;pointer-events:auto;font-size:23px;transition:transform .18s,background .18s}.fab:hover{transform:translateY(-2px)}.fab.active{background:var(--accent);transform:rotate(45deg)}
      .count{position:absolute;right:-5px;top:-5px;display:grid;min-width:21px;height:21px;place-items:center;border:2px solid #fff;border-radius:999px;background:var(--accent);padding:0 5px;color:#fff;font-size:10px;font-weight:800}.fab.active .count{display:none}.hint{position:absolute;left:50%;top:18px;transform:translateX(-50%);border-radius:999px;background:rgba(23,33,31,.94);padding:8px 14px;color:#fff;box-shadow:0 8px 24px rgba(23,33,31,.18);opacity:0;transition:opacity .15s,transform .15s}.hint.show{opacity:1;transform:translate(-50%,4px)}
      .outline{position:absolute;display:none;border:2px solid var(--accent);border-radius:4px;background:rgba(240,100,59,.06);box-shadow:0 0 0 2px rgba(255,255,255,.8)}.outline.show{display:block}.marker{position:absolute;display:grid;width:28px;height:28px;place-items:center;transform:translate(-50%,-50%);border:2px solid #fff;border-radius:50%;background:var(--accent);color:#fff;box-shadow:0 3px 12px rgba(23,33,31,.28);cursor:pointer;pointer-events:auto;font-size:12px;font-weight:800}.marker.resolved{background:#75817d}.marker:hover,.marker:focus-visible{transform:translate(-50%,-50%) scale(1.12);outline:none}.marker.offscreen{display:none}.region{position:absolute;border:2px solid var(--accent);border-radius:4px;background:rgba(240,100,59,.08);pointer-events:auto;cursor:pointer}.region.resolved{border-color:#75817d;background:rgba(117,129,125,.08)}.region.offscreen{display:none}.region .marker{left:0;top:0}.region:hover{background:rgba(240,100,59,.14)}
      .panel{position:absolute;top:14px;right:14px;bottom:14px;display:flex;width:min(390px,calc(100vw - 28px));flex-direction:column;border:1px solid rgba(23,33,31,.14);border-radius:14px;background:var(--paper);box-shadow:0 18px 56px rgba(23,33,31,.22);opacity:0;transform:translateX(calc(100% + 30px));transition:opacity .22s,transform .22s;pointer-events:none;overflow:hidden}.panel.open{opacity:1;transform:none;pointer-events:auto}.panel-head{display:flex;align-items:center;justify-content:space-between;padding:16px;border-bottom:1px solid var(--line)}.eyebrow{color:var(--accent2);font:700 10px/1 ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase}.title{margin:5px 0 0;font-size:18px;letter-spacing:0}.icon-btn{display:grid;width:36px;height:36px;place-items:center;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);cursor:pointer}.toolbar{display:flex;align-items:center;gap:7px;padding:10px 12px;border-bottom:1px solid var(--line)}.tool{height:32px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:0 10px;color:var(--ink);cursor:pointer;font-size:12px;font-weight:700}.tool.primary{margin-left:auto;border-color:var(--accent);background:var(--accent);color:#fff}.sync{color:var(--muted);font-size:10px}
      .list{min-height:0;flex:1;overflow:auto;padding:10px}.empty{padding:50px 24px;text-align:center;color:var(--muted)}.empty strong{display:block;margin-bottom:5px;color:var(--ink);font-size:16px}.card{margin-bottom:8px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:12px;cursor:pointer}.card:hover{border-color:#aeb7b3}.card.resolved{opacity:.72}.card-top{display:flex;align-items:center;gap:8px;margin-bottom:8px}.num{display:grid;width:24px;height:24px;place-items:center;border-radius:50%;background:var(--accent);color:#fff;font:800 11px/1 ui-monospace,monospace}.card.resolved .num{background:#75817d}.where{min-width:0;flex:1;overflow:hidden;color:var(--muted);font-size:11px;text-overflow:ellipsis;white-space:nowrap}.badge{border-radius:999px;background:#fff0eb;padding:3px 7px;color:var(--accent2);font-size:9px;font-weight:800}.card.resolved .badge{background:#edf0ef;color:#66736f}.text{margin:0;white-space:pre-wrap;word-break:break-word}.byline{margin-top:9px;color:#8a9390;font-size:10px}.actions{display:flex;justify-content:flex-end;gap:3px;margin-top:5px}.link{border:0;background:transparent;padding:4px 6px;color:var(--muted);cursor:pointer;font-size:11px}.link:hover{color:var(--accent2)}
      .replies{margin-top:9px;border-left:2px solid var(--line);padding-left:9px}.reply{padding:6px 0;border-bottom:1px solid #edf0ed}.reply:last-child{border-bottom:0}.reply p{margin:0;color:#37413e;font-size:12px;white-space:pre-wrap;word-break:break-word}.reply small{display:block;margin-top:2px;color:#8a9390;font-size:9px}.reply-form{display:flex;gap:6px;margin-top:9px}.reply-form input{min-width:0;flex:1;height:32px;border:1px solid var(--line);border-radius:7px;padding:0 8px;outline:none}.reply-form input:focus{border-color:var(--accent)}.reply-form button{height:32px;border:1px solid var(--line);border-radius:7px;background:#fff;padding:0 9px;cursor:pointer;font-size:11px;font-weight:700}
      .editor{position:absolute;z-index:2;width:min(340px,calc(100vw - 24px));border:1px solid rgba(23,33,31,.16);border-radius:10px;background:#fff;padding:12px;box-shadow:0 16px 48px rgba(23,33,31,.25);pointer-events:auto}.editor label{display:block;margin-bottom:8px;font-weight:800}.editor textarea{display:block;width:100%;min-height:92px;resize:vertical;border:1px solid var(--line);border-radius:8px;padding:9px;color:var(--ink);outline:none}.editor textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(240,100,59,.13)}.editor-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:9px}.editor button{height:34px;border:1px solid var(--line);border-radius:8px;background:#fff;padding:0 12px;cursor:pointer;font-weight:700}.editor .save{border-color:var(--accent);background:var(--accent);color:#fff}
      @media(max-width:600px){.panel{top:8px;right:8px;bottom:8px;width:calc(100vw - 16px)}.fab{right:14px;bottom:14px}}
      @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    </style>
    <div class="layer">
      <div class="outline"></div><div class="hint" role="status">单击选择元素，或拖动框选区域 · Esc 退出</div><div class="markers"></div><div class="editor-slot"></div>
      <aside class="panel" aria-label="网页批注列表">
        <div class="panel-head"><div><div class="eyebrow">PageNote / Shared review</div><h2 class="title">页面批注</h2></div><button class="icon-btn close" aria-label="关闭批注面板">×</button></div>
        <div class="toolbar"><span class="sync">${remote?'云端自动同步':'仅本机保存'}</span><button class="tool export">导出 JSON</button><button class="tool primary add">＋ 新批注</button></div>
        <div class="list"></div>
      </aside>
      <button class="fab" aria-label="打开页面批注"><span class="symbol">✎</span><span class="count">0</span></button>
    </div>`;
  document.documentElement.appendChild(host);
  const $=selector=>shadow.querySelector(selector);
  const els={fab:$('.fab'),count:$('.count'),hint:$('.hint'),outline:$('.outline'),markers:$('.markers'),panel:$('.panel'),list:$('.list'),slot:$('.editor-slot'),title:$('.title')};
  const isUi=node=>node===host||host.contains(node);
  const esc=value=>window.CSS?.escape?CSS.escape(String(value)):String(value).replace(/[^a-zA-Z0-9_-]/g,'\\$&');
  const selectorFor=element=>{
    if(element.id)return `#${esc(element.id)}`;
    const testId=element.getAttribute('data-testid');if(testId)return `[data-testid="${esc(testId)}"]`;
    const parts=[];let node=element;
    while(node&&node.nodeType===1&&node!==document.body){
      let part=node.tagName.toLowerCase();
      const stable=[...node.classList].find(name=>!/^(active|selected|open|show|hover|focus|is-)/i.test(name));
      if(stable)part+=`.${esc(stable)}`;
      const siblings=node.parentElement?[...node.parentElement.children].filter(item=>item.tagName===node.tagName):[];
      if(siblings.length>1)part+=`:nth-of-type(${siblings.indexOf(node)+1})`;
      parts.unshift(part);node=node.parentElement;if(parts.length>=6)break;
    }
    return parts.join(' > ');
  };
  const find=note=>{try{return document.querySelector(note.selector)}catch{return null}};
  const labelFor=element=>element.getAttribute('aria-label')||element.getAttribute('title')||element.innerText?.trim().replace(/\s+/g,' ').slice(0,42)||element.tagName.toLowerCase();
  const post=message=>parent!==window&&parent.postMessage({source:'pagenote',projectId,...message},'*');
  const mutate=(kind,noteId,payload={})=>post({type:'mutation',kind,noteId,payload});
  const saveLocal=()=>{try{localStorage.setItem(storageKey,JSON.stringify(state.notes))}catch{}render()};
  const noteTime=value=>{try{return new Intl.DateTimeFormat('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value))}catch{return ''}};
  const pageSize=()=>({width:Math.max(document.documentElement.scrollWidth,document.body?.scrollWidth||0,innerWidth),height:Math.max(document.documentElement.scrollHeight,document.body?.scrollHeight||0,innerHeight)});
  const isRegion=note=>Number.isFinite(Number(note.rw))&&Number.isFinite(Number(note.rh))&&Number(note.rw)>0&&Number(note.rh)>0;
  const regionPosition=note=>{const size=pageSize();const left=size.width*note.rx-scrollX;const top=size.height*note.ry-scrollY;const width=size.width*note.rw;const height=size.height*note.rh;return{left,top,width,height,visible:top+height>=0&&top<=innerHeight&&left+width>=0&&left<=innerWidth}};
  const markerPosition=note=>{const element=find(note);if(!element)return null;const rect=element.getBoundingClientRect();return{x:rect.left+rect.width*note.rx,y:rect.top+rect.height*note.ry,visible:rect.bottom>=0&&rect.top<=innerHeight&&rect.right>=0&&rect.left<=innerWidth}};
  const renderSelection=()=>{
    if(!state.selection)return;
    const selection=state.selection;let rect=null;
    if(selection.region)rect=regionPosition(selection.region);
    else{const target=selection.note?find(selection.note):selection.target;if(target)rect=target.getBoundingClientRect()}
    if(!rect)return;
    Object.assign(els.outline.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});els.outline.classList.add('show');
  };
  const renderMarkers=()=>{
    els.markers.innerHTML='';
    state.notes.forEach((note,index)=>{
      if(isRegion(note)){const pos=regionPosition(note);const region=document.createElement('button');region.className=`region${note.resolved?' resolved':''}${pos.visible?'':' offscreen'}`;region.style.left=`${pos.left}px`;region.style.top=`${pos.top}px`;region.style.width=`${pos.width}px`;region.style.height=`${pos.height}px`;region.title=note.text;region.setAttribute('aria-label',`框选批注 ${index+1}：${note.text}`);const badge=document.createElement('span');badge.className=`marker${note.resolved?' resolved':''}`;badge.textContent=index+1;region.appendChild(badge);region.addEventListener('click',()=>{openPanel();scrollToNote(note.id)});els.markers.appendChild(region);return}
      const pos=markerPosition(note);if(!pos)return;const marker=document.createElement('button');marker.className=`marker${note.resolved?' resolved':''}${pos.visible?'':' offscreen'}`;marker.textContent=index+1;marker.style.left=`${pos.x}px`;marker.style.top=`${pos.y}px`;marker.title=note.text;marker.setAttribute('aria-label',`批注 ${index+1}：${note.text}`);marker.addEventListener('click',()=>{openPanel();scrollToNote(note.id)});els.markers.appendChild(marker)
    });
  };
  const focusTarget=note=>{if(isRegion(note)){const size=pageSize();scrollTo({left:Math.max(0,size.width*(note.rx+note.rw/2)-innerWidth/2),top:Math.max(0,size.height*(note.ry+note.rh/2)-innerHeight/2),behavior:'smooth'});setTimeout(()=>{const rect=regionPosition(note);Object.assign(els.outline.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});els.outline.classList.add('show');setTimeout(()=>els.outline.classList.remove('show'),1400)},350);return}const element=find(note);if(!element)return;element.scrollIntoView({behavior:'smooth',block:'center',inline:'center'});setTimeout(()=>{const rect=element.getBoundingClientRect();Object.assign(els.outline.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});els.outline.classList.add('show');setTimeout(()=>els.outline.classList.remove('show'),1400)},350)};
  const renderList=()=>{
    els.count.textContent=state.notes.length;
    if(!state.notes.length){els.list.innerHTML='<div class="empty"><strong>还没有批注</strong>点击“新批注”，再选择页面中的位置。</div>';return}
    els.list.innerHTML='';
    state.notes.forEach((note,index)=>{
      const card=document.createElement('article');card.className=`card${note.resolved?' resolved':''}`;card.dataset.id=note.id;
      card.innerHTML=`<div class="card-top"><span class="num">${index+1}</span><span class="where"></span><span class="badge">${note.resolved?'已解决':'待处理'}</span></div><p class="text"></p><div class="byline"></div><div class="replies"></div><div class="reply-form"><input maxlength="600" aria-label="回复批注" placeholder="回复这条批注…"><button type="button">回复</button></div><div class="actions"><button class="link resolve">${note.resolved?'重新打开':'标记解决'}</button><button class="link edit">编辑</button><button class="link remove">删除</button></div>`;
      card.querySelector('.where').textContent=note.label;card.querySelector('.text').textContent=note.text;card.querySelector('.byline').textContent=`${note.author||'匿名'} · ${noteTime(note.createdAt)}`;
      const replies=card.querySelector('.replies');(note.replies||[]).forEach(reply=>{const row=document.createElement('div');row.className='reply';row.innerHTML='<p></p><small></small>';row.querySelector('p').textContent=reply.text;row.querySelector('small').textContent=`${reply.author} · ${noteTime(reply.createdAt)}`;replies.appendChild(row)});if(!note.replies?.length)replies.remove();
      card.addEventListener('click',event=>{if(event.target.closest('button,input'))return;focusTarget(note)});
      card.querySelector('.resolve').addEventListener('click',()=>{if(remote)mutate('update',note.id,{status:note.resolved?'open':'resolved'});else{note.resolved=!note.resolved;note.updatedAt=Date.now();saveLocal()}});
      card.querySelector('.edit').addEventListener('click',()=>editNote(note));
      card.querySelector('.remove').addEventListener('click',()=>{if(confirm('删除这条批注？')){if(remote)mutate('delete',note.id);else{state.notes=state.notes.filter(item=>item.id!==note.id);saveLocal()}}});
      const submitReply=()=>{const input=card.querySelector('.reply-form input');const text=input.value.trim();if(!text)return;if(!state.author&&remote){alert('请先在页面顶部填写你的名字。');return}if(remote){mutate('reply',note.id,{text});input.value=''}else{note.replies=note.replies||[];note.replies.push({id:Date.now(),text,author:'本机用户',createdAt:Date.now()});saveLocal()}};
      card.querySelector('.reply-form button').addEventListener('click',submitReply);card.querySelector('.reply-form input').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();submitReply()}});
      els.list.appendChild(card);
    });
  };
  const render=()=>{renderMarkers();renderList()};
  const setCompose=active=>{state.composing=active;state.drag=null;els.fab.classList.toggle('active',active);els.hint.classList.toggle('show',active);els.outline.classList.remove('show');document.documentElement.style.cursor=active?'crosshair':'';post({type:'mode',active})};
  const openPanel=()=>els.panel.classList.add('open');const closePanel=()=>els.panel.classList.remove('open');const scrollToNote=id=>els.list.querySelector(`[data-id="${esc(id)}"]`)?.scrollIntoView({behavior:'smooth',block:'center'});
  const showEditor=(target,x,y,note=null,region=null)=>{
    els.slot.innerHTML='';state.editing=note?.id||'new';state.selection=region?{region}:note?(isRegion(note)?{region:note}:{note}):{target};renderSelection();const editor=document.createElement('div');editor.className='editor';const left=Math.min(Math.max(12,x+10),innerWidth-352);const top=Math.min(Math.max(12,y+10),innerHeight-190);editor.style.left=`${left}px`;editor.style.top=`${top}px`;editor.innerHTML=`<label>${note?'编辑批注':'添加批注'}</label><textarea maxlength="1000" placeholder="描述问题、建议或验收意见…"></textarea><div class="editor-actions"><button class="cancel" type="button">取消</button><button class="save" type="button">保存</button></div>`;
    const textarea=editor.querySelector('textarea');textarea.value=note?.text||'';const close=()=>{els.slot.innerHTML='';state.editing=null;state.selection=null;els.outline.classList.remove('show')};editor.querySelector('.cancel').addEventListener('click',close);
    editor.querySelector('.save').addEventListener('click',()=>{const text=textarea.value.trim();if(!text){textarea.focus();return}if(remote&&!state.author){alert('请先在页面顶部填写你的名字。');return}if(note){if(remote)mutate('update',note.id,{text});else{note.text=text;note.updatedAt=Date.now();saveLocal()}}else{const rect=target.getBoundingClientRect();const fresh={id:crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`,selector:region?'html':selectorFor(target),label:region?'框选区域':labelFor(target),text,rx:region?region.rx:Math.min(1,Math.max(0,(x-rect.left)/Math.max(rect.width,1))),ry:region?region.ry:Math.min(1,Math.max(0,(y-rect.top)/Math.max(rect.height,1))),...(region?{rw:region.rw,rh:region.rh}:{}),createdAt:Date.now(),updatedAt:Date.now(),resolved:false,replies:[]};if(remote)mutate('create',null,fresh);else{state.notes.push(fresh);saveLocal()}}close();setCompose(false);openPanel()});
    editor.addEventListener('keydown',event=>{if(event.key==='Escape')close();if((event.ctrlKey||event.metaKey)&&event.key==='Enter')editor.querySelector('.save').click()});els.slot.appendChild(editor);setTimeout(()=>textarea.focus(),0);
  };
  const editNote=note=>{openPanel();showEditor(find(note)||document.body,Math.max(12,innerWidth-740),80,note)};
  const onPointerDown=event=>{if(!state.composing||isUi(event.target)||event.button!==0)return;event.preventDefault();event.stopPropagation();state.drag={pointerId:event.pointerId,target:event.target,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,moved:false}};
  const onMove=event=>{if(!state.composing||isUi(event.target))return;if(state.drag&&state.drag.pointerId===event.pointerId){event.preventDefault();state.drag.x=event.clientX;state.drag.y=event.clientY;state.drag.moved=state.drag.moved||Math.hypot(event.clientX-state.drag.startX,event.clientY-state.drag.startY)>=8;if(state.drag.moved){const left=Math.min(state.drag.startX,event.clientX);const top=Math.min(state.drag.startY,event.clientY);Object.assign(els.outline.style,{left:`${left}px`,top:`${top}px`,width:`${Math.abs(event.clientX-state.drag.startX)}px`,height:`${Math.abs(event.clientY-state.drag.startY)}px`});els.outline.classList.add('show')}return}const rect=event.target.getBoundingClientRect();Object.assign(els.outline.style,{left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`});els.outline.classList.add('show')};
  const onPointerUp=event=>{const drag=state.drag;if(!state.composing||!drag||drag.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();state.drag=null;state.suppressClick=true;els.outline.classList.remove('show');if(drag.moved){const size=pageSize();const left=Math.min(drag.startX,event.clientX)+scrollX;const top=Math.min(drag.startY,event.clientY)+scrollY;const width=Math.abs(event.clientX-drag.startX);const height=Math.abs(event.clientY-drag.startY);const region={rx:left/size.width,ry:top/size.height,rw:width/size.width,rh:height/size.height};setCompose(false);showEditor(document.documentElement,event.clientX,event.clientY,null,region)}else{setCompose(false);showEditor(drag.target,event.clientX,event.clientY)}setTimeout(()=>{state.suppressClick=false},0)};
  const onClick=event=>{if(!state.suppressClick)return;event.preventDefault();event.stopPropagation()};
  const exportJson=()=>{const blob=new Blob([JSON.stringify({version:2,project:state.project,exportedAt:new Date().toISOString(),notes:state.notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`pagenote-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
  $('.fab').addEventListener('click',()=>state.composing?setCompose(false):openPanel());$('.close').addEventListener('click',closePanel);$('.add').addEventListener('click',()=>{if(remote&&!state.author){alert('请先在页面顶部填写你的名字。');return}closePanel();setCompose(true)});$('.export').addEventListener('click',exportJson);
  const renderPositions=()=>{renderMarkers();renderSelection()};
  document.addEventListener('pointerdown',onPointerDown,true);document.addEventListener('pointermove',onMove,true);document.addEventListener('pointerup',onPointerUp,true);document.addEventListener('pointercancel',onPointerUp,true);document.addEventListener('click',onClick,true);document.addEventListener('keydown',event=>{if(event.key==='Escape'){setCompose(false);els.slot.innerHTML='';state.editing=null;state.selection=null;els.outline.classList.remove('show')}});addEventListener('scroll',renderPositions,true);addEventListener('resize',renderPositions);
  const observer=new MutationObserver(()=>requestAnimationFrame(renderPositions));observer.observe(document.body||document.documentElement,{subtree:true,childList:true,attributes:true});
  addEventListener('message',event=>{if(event.source!==parent||event.data?.source!=='pagenote-host')return;const message=event.data;if(message.type==='sync'){state.notes=Array.isArray(message.notes)?message.notes:[];state.project=message.project||null;state.author=message.author||state.author;els.title.textContent=state.project?.title||'页面批注';render()}if(message.type==='author')state.author=message.author||'';if(message.type==='command'&&message.command==='toggleCompose'){state.author=message.author||state.author;closePanel();setCompose(!state.composing)}});
  window.PageNote={toggleCompose:()=>{closePanel();setCompose(!state.composing)},open:openPanel,destroy:()=>{observer.disconnect();document.removeEventListener('pointerdown',onPointerDown,true);document.removeEventListener('pointermove',onMove,true);document.removeEventListener('pointerup',onPointerUp,true);document.removeEventListener('pointercancel',onPointerUp,true);document.removeEventListener('click',onClick,true);host.remove()},getNotes:()=>structuredClone(state.notes)};
  render();if(remote)post({type:'ready'});
})();
