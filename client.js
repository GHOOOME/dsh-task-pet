/** dsh-task-pet settings section; the existing package identifier is retained for installed-user compatibility. */
const __taskPetFactory = (require) => {
  const React = require('react');
  const h = React.createElement;
  const NS = 'taskPetSettings';
  const dictionaries = {
   zh: {
    nav:'桌面宠物', title:'DSH Task Pet', intro:'用你喜欢的像素角色，实时看见任务在做什么。',
    loading:'正在读取宠物设置…', failed:'设置暂时无法读取', retry:'重试', running:'宠物运行中', stopped:'宠物未运行',
    characters:'我的角色', characterHint:'选择已安装角色。未配置的动作沿用该角色的待机素材。', builtin:'内置角色', personal:'本机角色', selected:'已选择',
    appearance:'显示与提醒', size:'角色大小', sizeHint:'1–6 倍像素倍率；气泡保持可读字号。位置仍可直接拖动调整。',
    sound:'完成提示音', soundHint:'只有角色包包含音效时才会播放；不用系统通知权限。',
    duration:'完成气泡停留', durationHint:'单位：秒，0 为不显示，最长 120 秒。',
    save:'保存并应用', saving:'正在应用…', saved:'已保存。宠物已重新载入，DSH 会话没有重启。',
    saveHint:'保存会短暂重启宠物。这里是启动偏好；右键和滚轮的临时调整在下次应用时以本页设置为准。',
    refresh:'刷新角色列表', restart:'重新召唤宠物', restarted:'已重新召唤宠物。',
    materials:'添加自己的角色', materialsHint:'两条路：① 让 AI 本地生成角色（不依赖外网）；② 打开素材站下载 CC0/CC-BY 素材。把文件夹放进下面的目录后刷新列表。境外站点网络可能不稳定。',
    folder:'本机角色目录', copy:'复制给 AI 的安装指令', copied:'安装指令已复制。', website:'OpenGameArt（境外）↗', copyGenerate:'复制 AI 生成指令', copiedGenerate:'AI 生成指令已复制。', websiteCn:'国内可访问素材索引 ↗', websiteCnHint:'（第三方索引站，下载前核对 CC0/商用授权）', openFolder:'在 Finder 中打开角色目录', opened:'已在 Finder 中打开。',
    privacy:'仅保存本机偏好，不上传对话正文。第三方角色与音效请自行确认使用许可。',
    unknown:'未知错误', missing:'缺少 API 授权，请刷新页面。若仍失败，请重启 DSH。',
    promptGenerate:'请用你能用的生图模型或 Python/Pillow，在 {folder}/ai-pet/ 里生成一套 DSH Task Pet 角色：透明背景 PNG 像素图（32–64px，整数倍放大显示），至少包含 idle.png、working.png、success.png；创建 skin.json，写明 name、author、license（注明 AI 生成）和 states，可给 thinking/error/sleep 等状态配图。只生成原创形象，不要复刻受版权保护的角色。完成后提示我在 设置 → 桌面宠物 刷新并选择。',
    prompt:'请帮我安装 DSH Task Pet 的自定义像素角色。只使用 CC0/CC-BY 或我有权使用的透明 PNG 与音效，不执行素材包里的代码；在 skin.json 记录 author 与 license。把角色放在 {folder}/my-pet/，创建 skin.json（name、author、license、states.idle.sprite；可给 thinking、working、streaming、success、error、aborted、sleep、disconnected 指定 sprite，或 frames 数组和 fps）。所有文件路径必须在角色文件夹内。完成后让我在 设置 → 桌面宠物 点击“刷新角色列表”、选择角色并保存。不要自动修改其他 DSH 设置。',
   },
   en: {
    nav:'Desktop Pet', title:'DSH Task Pet', intro:'Your pixel companion, showing what the task is doing in real time.',
    loading:'Loading pet preferences…', failed:'Could not load settings', retry:'Retry', running:'Pet running', stopped:'Pet not running',
    characters:'My characters', characterHint:'Choose an installed character. Missing actions fall back to its idle artwork.', builtin:'Built in', personal:'Local character', selected:'Selected',
    appearance:'Display and alerts', size:'Character size', sizeHint:'1–6× pixel scale. The speech bubble keeps a readable font size. Drag the pet to move it.',
    sound:'Completion sound', soundHint:'Requires audio in the character pack; no OS notification permission needed.',
    duration:'Completion bubble', durationHint:'Seconds; 0 hides it, maximum 120.', save:'Save and apply', saving:'Applying…',
    saved:'Saved. Only the pet was reloaded; your DSH session kept running.',
    saveHint:'Saving briefly restarts the pet. These are startup preferences; temporary menu and scroll changes are replaced when you apply again.',
    refresh:'Refresh characters', restart:'Summon pet again', restarted:'Pet summoned again.',
    materials:'Add your own character', materialsHint:'Two paths: (1) ask your AI to generate a character locally (no foreign site needed); (2) download CC0/CC-BY art from the site below. Put the folder here, then refresh. Foreign sites may be slow or unreachable in some networks.',
    folder:'Local character folder', copy:'Copy AI installation instructions', copied:'Instructions copied.', website:'OpenGameArt (foreign) ↗', copyGenerate:'Copy AI generation prompt', copiedGenerate:'AI generation prompt copied.', websiteCn:'Asset index accessible in China ↗', websiteCnHint:'(third-party index; verify CC0/commercial license before use)', openFolder:'Reveal character folder in Finder', opened:'Revealed in Finder.',
    privacy:'Preferences stay on this machine. Conversation text is not uploaded. Check the licenses of third-party art and sounds.',
    unknown:'Unknown error', missing:'API authorization is missing. Reload this page or restart DSH.',
    promptGenerate:'Use an image model you can access, or Python/Pillow, to generate a DSH Task Pet character in {folder}/ai-pet/: transparent PNG pixel art (32–64px, integer-scaled), at least idle.png, working.png, success.png; create skin.json with name, author, license (AI-generated) and states, optionally per-state images. Only original characters, never copyrighted ones. Then ask me to refresh Settings → Desktop Pet and select it.',
    prompt:'Help me install a DSH Task Pet pixel character. Use only permitted transparent PNG images and sounds; never execute code from an asset pack. Put it in {folder}/my-pet/ and create skin.json (name, author, license, states.idle.sprite; optional thinking/working/streaming/success/error/aborted/sleep/disconnected sprite or frames and fps). All paths must stay inside that character folder. Then ask me to refresh Settings → Desktop Pet, select it and save. Do not alter other DSH preferences.',
   },
  };
  const css = `
  .dtp-page{max-width:760px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;padding-bottom:24px}
  .dtp-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}.dtp-page h2{margin:0;font-size:20px;font-weight:600}.dtp-page h3{margin:0 0 6px;font-size:14px;font-weight:600}
  .dtp-muted{color:var(--dsw-alias-label-secondary);font-size:12px;margin:6px 0 12px}.dtp-status{font-size:12px;white-space:nowrap;padding:5px 9px;background:var(--dsw-alias-bg-layer-2);border-radius:8px}.dtp-status[data-running=true]{color:var(--dsw-alias-state-success-primary)}
  .dtp-block{padding:20px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}.dtp-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}.dtp-card{cursor:pointer;text-align:left;color:inherit;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;min-width:0}.dtp-card[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-interactive-bg-active)}
  .dtp-preview{height:78px;display:flex;align-items:center;justify-content:center;margin-bottom:10px;background:var(--dsw-alias-bg-layer-2);border-radius:8px}.dtp-preview img{max-width:100%;max-height:70px;image-rendering:pixelated}.dtp-cardname{display:block;overflow-wrap:anywhere;font-size:13px}.dtp-cardmeta{display:block;font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:5px}
  .dtp-row{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:12px 0}.dtp-row>div{min-width:0}.dtp-row .dtp-muted{margin:3px 0}.dtp-page select,.dtp-page input[type=number]{color:inherit;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;padding:7px 10px;min-width:80px;font:inherit}.dtp-switch{width:36px;height:20px;flex-shrink:0;border:0;border-radius:999px;padding:2px;background:var(--dsw-alias-border-l3);cursor:pointer}.dtp-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}.dtp-switch span{display:block;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform .12s}.dtp-switch[aria-checked=true] span{transform:translateX(16px)}
  .dtp-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:14px}.dtp-button{font:inherit;font-size:12px;padding:7px 12px;border:.5px solid var(--dsw-alias-border-l3);border-radius:8px;background:transparent;color:inherit;text-decoration:none;cursor:pointer}.dtp-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.dtp-button[data-primary=true]{background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-foreground,#fff);border-color:transparent}.dtp-button:disabled,.dtp-card:disabled{opacity:.5;cursor:default}
  .dtp-page :is(button,input,select,a):focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.dtp-path{display:block;overflow-wrap:anywhere;background:var(--dsw-alias-bg-layer-2);padding:10px;border-radius:8px;font-size:12px;user-select:text}.dtp-error{color:var(--dsw-alias-state-error-primary);font-size:12px;overflow-wrap:anywhere}.dtp-notice{font-size:12px;margin-top:12px;color:var(--dsw-alias-state-success-primary)}
  @media(max-width:640px){.dtp-top{flex-wrap:wrap}.dtp-row{gap:12px}.dtp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}}`;

  async function api(action, body, signal) {
   const response = await fetch(`api/dsh-task-pet/${action}`, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: body === undefined ? {} : { 'content-type':'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
   });
   const data = await response.json();
   if (!response.ok || !data.ok) throw new Error(data.message ?? `HTTP ${response.status}`);
   return data;
  }
  function Preview({ id }) {
   const [src,setSrc] = React.useState(null);
   React.useEffect(() => {
    const controller = new AbortController(); let url;
    fetch(`api/dsh-task-pet/preview?id=${encodeURIComponent(id)}`, { signal:controller.signal })
     .then(r => { if (!r.ok) throw new Error('Preview unavailable'); return r.blob(); })
     .then(blob => { if (!controller.signal.aborted) { url=URL.createObjectURL(blob); setSrc(url); } }).catch(() => {});
    return () => { controller.abort(); if(url) URL.revokeObjectURL(url); };
   },[id]);
   return h('div',{className:'dtp-preview'},src ? h('img',{src,alt:''}) : h('span',{'aria-hidden':true},'◇'));
  }
  function SettingsPage({ t }) {
   const [data,setData]=React.useState(null), [draft,setDraft]=React.useState(null);
   const [busy,setBusy]=React.useState(false), [error,setError]=React.useState(''), [notice,setNotice]=React.useState('');
   const lifetime=React.useRef(null);
   async function load(signal) { const next=await api('info',undefined,signal); setData(next);setDraft(next.settings); }
   React.useEffect(() => { const c=new AbortController(); lifetime.current=c; load(c.signal).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort(); },[]);
   const dirty=!!data && JSON.stringify(draft)!==JSON.stringify(data.settings);
   const update=patch=>{setDraft(v=>({...v,...patch}));setNotice('');};
   async function act(kind) {
    setBusy(true);setError('');setNotice('');
    try {
     if(kind==='save') { const {version,...patch}=draft; await api('settings',patch,lifetime.current.signal); await load(lifetime.current.signal);setNotice(t('saved')); }
     else if(kind==='restart') { await api('restart',{},lifetime.current.signal);await load(lifetime.current.signal);setNotice(t('restarted')); }
     else if(kind==='open-folder') { await api('open-folder',{},lifetime.current.signal);setNotice(t('opened')); }
     else await load(lifetime.current.signal);
    } catch(e) { if(!lifetime.current?.signal.aborted)setError(e.message); }
    finally { if(!lifetime.current?.signal.aborted)setBusy(false); }
   }
   async function copyPrompt(kind='install') { try { await navigator.clipboard.writeText(t(kind==='generate'?'promptGenerate':'prompt',{folder:data.folder}));setNotice(t(kind==='generate'?'copiedGenerate':'copied')); } catch(e) { setError(e.message); } }
   const button=(label,fn,disabled=false,primary=false)=>h('button',{type:'button',className:'dtp-button',onClick:fn,disabled:disabled||busy,'data-primary':primary},label);
   if(!data) return h('section',{className:'dtp-page','aria-label':t('nav')},h('style',null,css),h('h2',null,t('title')),h('p',null,error?t('failed'):t('loading')),error&&h('p',{role:'alert',className:'dtp-error'},error),button(t('retry'),()=>act('refresh')));
   return h('section',{className:'dtp-page','data-task-pet-settings':true,'aria-busy':busy},
    h('style',null,css),
    h('div',{className:'dtp-top'},h('div',null,h('h2',null,t('title')),h('p',{className:'dtp-muted'},t('intro'))),h('span',{className:'dtp-status','data-running':data.status.running},t(data.status.running?'running':'stopped'))),
    data.status.error&&h('p',{className:'dtp-error',role:'alert'},data.status.error),
    h('div',{className:'dtp-block'},h('h3',null,t('characters')),h('p',{className:'dtp-muted'},t('characterHint')),
     h('div',{className:'dtp-cards'},data.characters.map(c=>h('button',{key:c.id,type:'button',className:'dtp-card','aria-pressed':draft.character===c.id,disabled:busy,onClick:()=>update({character:c.id})},h(Preview,{id:c.id}),h('span',{className:'dtp-cardname'},c.name),h('span',{className:'dtp-cardmeta'},draft.character===c.id?t('selected'):t(c.builtin?'builtin':'personal'))))),
     h('div',{className:'dtp-actions'},button(t('refresh'),()=>act('refresh'),dirty),button(t('restart'),()=>act('restart'),dirty))),
    h('div',{className:'dtp-block'},h('h3',null,t('appearance')),
     h('div',{className:'dtp-row'},h('div',null,h('label',{htmlFor:'dtp-scale'},t('size')),h('p',{className:'dtp-muted'},t('sizeHint'))),h('select',{id:'dtp-scale',value:draft.scale,disabled:busy,onChange:e=>update({scale:Number(e.target.value)})},[1,2,3,4,5,6].map(n=>h('option',{key:n,value:n},`${n}×`)))),
     h('div',{className:'dtp-row'},h('div',null,h('span',null,t('sound')),h('p',{className:'dtp-muted'},t('soundHint'))),h('button',{type:'button',role:'switch','aria-label':t('sound'),'aria-checked':!draft.muted,className:'dtp-switch',disabled:busy,onClick:()=>update({muted:!draft.muted})},h('span'))),
     h('div',{className:'dtp-row'},h('div',null,h('label',{htmlFor:'dtp-duration'},t('duration')),h('p',{className:'dtp-muted'},t('durationHint'))),h('input',{id:'dtp-duration',type:'number',min:0,max:120,step:1,value:draft.completionBubbleMs/1000,disabled:busy,onChange:e=>update({completionBubbleMs:Number(e.target.value)*1000})})),
     h('div',{className:'dtp-actions'},button(t(busy?'saving':'save'),()=>act('save'),!dirty,true)),h('p',{className:'dtp-muted'},t('saveHint'))),
    h('div',{className:'dtp-block'},h('h3',null,t('materials')),h('p',{className:'dtp-muted'},t('materialsHint')),h('p',{className:'dtp-muted'},t('folder')),h('code',{className:'dtp-path'},data.folder),h('div',{className:'dtp-actions'},button(t('openFolder'),()=>act('open-folder')),button(t('copy'),()=>copyPrompt('install')),button(t('copyGenerate'),()=>copyPrompt('generate')),h('a',{className:'dtp-button',href:'https://opengameart.org/',target:'_blank',rel:'noopener noreferrer'},t('website')),h('a',{className:'dtp-button',href:'https://godotlab.org/assets',target:'_blank',rel:'noopener noreferrer'},t('websiteCn')),h('span',{className:'dtp-muted'},t('websiteCnHint')))),
    error&&h('p',{role:'alert',className:'dtp-error'},error),notice&&h('p',{role:'status',className:'dtp-notice'},notice),h('p',{className:'dtp-muted'},t('privacy')));
  }
  function WindowDragStrip() {
   if(document.documentElement.dataset.platform!=='darwin')return null;
   return h('div',{'data-dsh-drag-strip':'greninja-pet','aria-hidden':true,style:{position:'fixed',top:0,left:0,right:0,height:10,zIndex:2147483000,WebkitAppRegion:'drag'}});
  }
  return { inject:['slots','locale'], apply(ctx) {
   // Two boot aliases can load this factory in one page; only the first applies.
   if (globalThis.__DSH_TASK_PET_APPLIED__ === true) return;
   globalThis.__DSH_TASK_PET_APPLIED__ = true;
   ctx.effect(() => () => { if (globalThis.__DSH_TASK_PET_APPLIED__ === true) delete globalThis.__DSH_TASK_PET_APPLIED__; }, 'task-pet: applied flag');
   ctx.effect(()=>ctx.locale.register(NS,dictionaries),'task-pet: locales');
   const t=ctx.locale.bind(NS);
   ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'dsh-task-pet',order:12,label:()=>t('nav'),locale:NS},SettingsPage));
   ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'greninja-window-drag',order:1000},WindowDragStrip));
  }};
};
// A long-running Host may still serve a cached boot batch that names the old
// package id after a rename; registering that alias too lets the batch
// activate. Clean installs only ever load the current id.
const __taskPetIds = ['dsh-task-pet'];
try {
 if (JSON.stringify(globalThis.__DSH_BOOT__ ?? {}).includes('@local/dsh-greninja-pet')) __taskPetIds.push('@local/dsh-greninja-pet');
} catch (error) { /* boot inspection is best effort */ }
if (globalThis.__DSH_TASK_PET_REGISTERED__ !== true) {
 globalThis.__DSH_TASK_PET_REGISTERED__ = true;
 for (const __taskPetId of __taskPetIds) window.__ModuleLoader__.load({ id: __taskPetId, factory: __taskPetFactory });
}
