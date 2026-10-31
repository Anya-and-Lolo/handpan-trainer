/* Ethereal r28: material finishes and independent accessories. Shared source. */
(function () {
  'use strict';
  const base = typeof document !== 'undefined' && document.currentScript?.src
    ? new URL('cosmetics/', document.currentScript.src).href : 'app-files/cosmetics/';
  const asset = name => `${base}${name}`;
  const gate = { any: [{ skin: 'obsidian' }, { skin: 'nebula' }] };
  const rare = (...rules) => ({ all: [gate, ...rules] });
  const skins = [
    { id: '', name: 'Classic steel', tier: 'Starter', palette: ['#8891a5','#424957','#1a202c'] },
    { id: 'midnight', name: 'Midnight blue', tier: 'Starter', palette: ['#8ca8d2','#304d78','#101d36'] },
    { id: 'bronze', name: 'Bronze', tier: 'Starter', palette: ['#e4b37d','#946133','#3d240f'] },
    { id: 'silver', name: 'Silver', tier: 'Journey', unlock: { boss: 0 }, palette: ['#f8fafc','#afb8c8','#5c6475'] },
    { id: 'gold', name: 'Gold', tier: 'Journey', unlock: { boss: 1 }, palette: ['#fff0ba','#c69732','#6a4710'] },
    { id: 'champagne', name: 'Champagne', tier: 'Journey', unlock: { level: 5 }, palette: ['#f8eaca','#bea17c','#6d593c'] },
    { id: 'patina', name: 'Patina teal', tier: 'Rare', unlock: { streak: 7 }, palette: ['#79c6b8','#286f69','#103a39'] },
    { id: 'marble', name: 'Aqua satin', tier: 'Rare', unlock: { level: 10 }, palette: ['#d8fff3','#65c8b7','#1e746d'] },
    { id: 'amethyst', name: 'Amethyst', tier: 'Rare', unlock: { daily: 15 }, palette: ['#d2b6ff','#7643cb','#2a155d'] },
    { id: 'wine', name: 'Wine red', tier: 'Rare', unlock: { perfect: 1000 }, palette: ['#d18291','#7d3145','#341521'] },
    { id: 'obsidian', name: 'Obsidian & gold', tier: 'Masterwork', unlock: { boss: 2 }, palette: ['#52505a','#23222a','#090a10'], pattern: 'filigree', accent: 'gold' },
    { id: 'nebula', name: 'Nebula', tier: 'Masterwork', unlock: { all: [{ level: 20 }, { daily: 25 }] }, palette: ['#a283dd','#3d297c','#0c0b30'], texture: 'nebula-violet.webp', pattern: 'constellation' },
    { id: 'graphite-mandala', name: 'Graphite mandala', tier: 'Collector', unlock: rare({ level: 22 }, { runs: 50 }), palette: ['#858486','#35363c','#11131a'], rim: 'natural', pattern: 'mandala' },
    { id: 'indigo-mandala', name: 'Indigo mandala', tier: 'Collector', unlock: rare({ level: 24 }, { daily: 40 }), palette: ['#75bed6','#214b68','#0d182e'], rim: 'natural', pattern: 'mandala' },
    { id: 'hammered-aurum', name: 'Hammered aurum', tier: 'Collector', unlock: rare({ level: 24 }, { notes: 10000 }), palette: ['#fbe0a0','#b88c48','#493716'], texture: 'hammered.svg', rim: 'charcoal', accent: 'gold' },
    { id: 'silver-copper', name: 'Silver & copper', tier: 'Collector', unlock: rare({ level: 25 }, { perfect: 5000 }), palette: ['#f4f5f3','#a5a7a6','#575e68'], rim: 'natural', accent: 'copper' },
    { id: 'celadon-gold', name: 'Celadon & gold', tier: 'Collector', unlock: rare({ level: 26 }, { workouts: 15 }), palette: ['#eefaf1','#72bfa8','#205d53'], texture: 'marble-mint.webp', accent: 'gold' },
    { id: 'ocean-gold', name: 'Ocean & gold', tier: 'Collector', unlock: rare({ level: 28 }, { daily: 60 }), palette: ['#93d4f4','#175990','#071e48'], texture: 'marble-ocean.webp', rim: 'charcoal', accent: 'gold' },
    { id: 'verdigris-relief', name: 'Verdigris relief', tier: 'Collector', unlock: rare({ level: 28 }, { minutes: 600 }), palette: ['#79b7aa','#286b66','#143e44'], pattern: 'relief', accent: 'silver' },
    { id: 'blue-vortex', name: 'Blue vortex', tier: 'Legendary', unlock: rare({ level: 30 }, { combo: 100 }), palette: ['#b7dffb','#2a6fbc','#142c64'], texture: 'vortex.svg', rim: 'charcoal', accent: 'gold' },
    { id: 'bronze-relief', name: 'Antique bronze relief', tier: 'Legendary', unlock: rare({ level: 30 }, { runs: 125 }), palette: ['#d9b681','#88704f','#3e332a'], pattern: 'relief', accent: 'copper' },
    { id: 'prism', name: 'Prismatic aurora', tier: 'Legendary', unlock: rare({ level: 32 }, { runs: 100 }), palette: ['#a2eff3','#4977ba','#602b91'], texture: 'prism.svg', rim: 'wine', accent: 'gold' },
    { id: 'lunar-eclipse', name: 'Lunar eclipse', tier: 'Legendary', unlock: rare({ level: 32 }, { streak: 21 }), palette: ['#c0b4ec','#474285','#1a1a40'], texture: 'eclipse.svg', rim: 'charcoal', accent: 'silver' },
    { id: 'astral-script', name: 'Astral inscription', tier: 'Legendary', unlock: rare({ level: 34 }, { workouts: 30 }), palette: ['#93bee9','#3b6aa2','#192e5a'], pattern: 'script', rim: 'natural', accent: 'silver' }
  ];
  const rims = [
    { id: '', name: 'Original edge' }, { id: 'off', name: 'Black protective rim', unlock: gate },
    { id: 'natural', name: 'Natural rattan', unlock: gate }, { id: 'charcoal', name: 'Charcoal weave', unlock: gate },
    { id: 'wine', name: 'Wine & ivory braid', unlock: rare({ daily: 30 }) },
    { id: 'aqua', name: 'Aqua braid', unlock: rare({ workouts: 10 }) },
    { id: 'violet', name: 'Amethyst braid', unlock: rare({ level: 25 }) },
    { id: 'ivory', name: 'Ivory & gold braid', unlock: rare({ perfect: 3000 }) }
  ];
  const accents = [
    { id: '', name: 'Original note centres' },
    { id: 'blue', name: 'Sapphire blue centres', unlock: gate },
    { id: 'silver', name: 'Silver note centres', unlock: rare({ level: 22 }) },
    { id: 'copper', name: 'Copper note centres', unlock: rare({ level: 24 }) },
    { id: 'violet', name: 'Amethyst note centres', unlock: rare({ level: 26 }) },
    { id: 'gold', name: 'Gold note centres', unlock: rare({ level: 28 }) }
  ];
  const patterns = [
    { id: '', name: 'No engraving' },
    { id: 'mandala', name: 'Celestial mandala', unlock: gate },
    { id: 'filigree', name: 'Gold filigree', unlock: rare({ workouts: 7 }) },
    { id: 'constellation', name: 'Star engraving', unlock: rare({ combo: 100 }) },
    { id: 'relief', name: 'Embossed border', unlock: rare({ runs: 75 }) },
    { id: 'script', name: 'Astral glyphs', unlock: rare({ level: 30 }) }
  ];
  const nebulas = [
    { id: '', name: 'Deep space' }, { id: 'violet', name: 'Violet nebula', unlock: { level: 3 } },
    { id: 'blue', name: 'Blue nebula', unlock: { workouts: 3 } }, { id: 'aqua', name: 'Aqua nebula', unlock: { combo: 50 } }
  ];
  const shapes = [
    {id:'',name:'Round petals'},
    {id:'lotus',name:'Lotus petals',unlock:{level:5}},
    {id:'double',name:'Double-cut petals',unlock:{level:10}}
  ];
  const catalog = { skin: skins, rim: rims, accent: accents, pattern: patterns, nebula: nebulas, shape: shapes };
  const skinOf = id => skins.find(item => item.id === id) || skins[0];
  const effective = look => {
    const skin = skinOf(look.skin);
    // An explicit empty field means Original / No engraving. Catalogue
    // thumbnails without these fields use the finish's decorative preset.
    return { ...look, rim: look.rim ?? skin.rim ?? '', accent: look.accent === 'off' ? '' : look.accent ?? skin.accent ?? '', pattern: look.pattern === 'off' ? '' : look.pattern ?? skin.pattern ?? '' };
  };
  const ns = 'http://www.w3.org/2000/svg';
  const el = (name, attrs, parent) => { const node = document.createElementNS(ns, name); Object.entries(attrs).forEach(([key,value]) => node.setAttribute(key, value)); if (parent) parent.appendChild(node); return node; };
  function rimSvg(count = 72) {
    let result = '<g class="cos-rattan"><circle r="1.008" fill="none" stroke="#131721" stroke-width=".092"/><circle r="1.008" fill="none" stroke="var(--weave-dark,#6c482d)" stroke-width=".069"/>';
    for (let i = 0; i < count; i++) result += `<g transform="rotate(${i * 360/count})"><path d="M-.029 -.98 Q-.028 -1.034 .004 -1.036 Q.032 -1.029 .026 -.989" fill="none" stroke="var(--weave,#cba675)" stroke-width=".018"/><path d="M-.019 -1.001 Q-.002 -.97 .024 -.99" fill="none" stroke="var(--weave-light,#f1d3a0)" stroke-width=".009"/></g>`;
    return result + '</g><g class="cos-protective"><circle r="1.005" fill="none" stroke="#070b12" stroke-width=".09"/><circle r="1.025" fill="none" stroke="#343b45" stroke-width=".013"/><circle r=".975" fill="none" stroke="#89919c" stroke-opacity=".32" stroke-width=".008"/></g>';
  }
  function patternSvg(selected) {
    let mandala = '<g class="cos-pattern cos-mandala">';
    for (let i=0;i<32;i++) mandala += `<g transform="rotate(${i*11.25})"><path d="M0 -.31 Q-.058 -.37 0 -.46 Q.058 -.37 0 -.31 M0 -.86 Q-.025 -.918 0 -.947 Q.025 -.918 0 -.86"/><circle cx="0" cy="-.484" r=".009"/></g>`;
    for (let i=0;i<24;i++) mandala += `<g transform="rotate(${i*15})"><path d="M0 -.12 Q-.035 -.17 0 -.224 Q.035 -.17 0 -.12 M0 -.224 Q-.063 -.258 0 -.303 Q.063 -.258 0 -.224 M0 -.50 Q-.035 -.55 0 -.59 Q.035 -.55 0 -.50"/><circle cx="0" cy="-.62" r=".009"/><path d="M-.017 -.637 L0 -.671 L.017 -.637 L0 -.61Z"/></g>`;
    for (const r of [.115,.225,.294,.306,.493,.507,.686,.858,.953]) mandala+=`<circle r="${r}"/>`;
    mandala+='</g>';
    let filigree='<g class="cos-pattern cos-filigree">';
    for(let i=0;i<48;i++) filigree += `<path transform="rotate(${i*7.5})" d="M-.05 -.895 Q-.025 -.966 0 -.903 Q.025 -.966 .05 -.895 M0 -.924 Q-.03 -.85 0 -.824 Q.03 -.85 0 -.924"/>`;
    filigree+='<circle r=".878"/><circle r=".962"/></g>';
    let relief='<g class="cos-pattern cos-relief">';
    for(let i=0;i<72;i++) relief += `<path transform="rotate(${i*5})" d="M-.036 -.88 Q0 -.81 .036 -.88 Q0 -.95 -.036 -.88 M-.024 -.916 Q0 -.972 .024 -.916"/>`;
    relief+='<circle r=".823"/><circle r=".966"/></g>';
    let script='<g class="cos-pattern cos-script">';
    // Invented geometric celestial glyphs, rather than copied sacred text.
    for (const radius of [.43,.53,.85,.93]) for(let i=0;i<40;i++) {
      const a=i*9;
      script+=`<g transform="rotate(${a}) translate(0 -${radius})"><path d="M-.019 .017 V-.02 H.019 V.012 H-.007 V-.008 M-.023 -.029 H.023 ${i%3===0?'M0 -.036 V.03':''}"/></g>`;
    }
    script+='</g>';
    let stars='<g class="cos-pattern cos-constellation">';
    for(let i=0;i<12;i++) stars+=`<g transform="rotate(${i*30})"><path d="M-.1 -.43 L-.06 -.54 L.09 -.5 L.14 -.66"/><circle cx="-.1" cy="-.43" r=".009"/><circle cx="-.06" cy="-.54" r=".012"/><circle cx=".09" cy="-.5" r=".008"/><circle cx=".14" cy="-.66" r=".012"/></g>`;
    const designs={mandala,filigree,relief,script,constellation:stars+'</g>'};
    return selected === undefined ? Object.values(designs).join('') : designs[selected] || '';
  }
  // The same zig-zag positions and ellipses as the playable D Kurd handpan.
  function handpanFields(count=9,offset=180/count) {
    return Array.from({length:count},(_,i)=>{
      const num=i+1,angle=(num===1?0:(num%2===0?-1:1)*Math.floor(num/2)*360/count)+offset;
      const a=angle*Math.PI/180,t=count>1?i/(count-1):0,x=.645*Math.sin(a),y=.645*Math.cos(a);
      return {num,x,y,rx:.23-.105*t,ry:.175-.07*t,rot:Math.atan2(y,x)*180/Math.PI};
    });
  }
  function tonguePath(shape='',w=.18,inner=.35,outer=.93) {
    if(shape==='lotus') return `M${-w*.78} ${-(outer)} C${-w*.7} ${-(outer-.16)} ${-w*1.10} ${-(inner+.18)} ${-w*.66} ${-(inner+.065)} Q${-w*.18} ${-(inner+.065)} 0 ${-(inner)} Q${w*.18} ${-(inner+.065)} ${w*.66} ${-(inner+.065)} C${w*1.10} ${-(inner+.18)} ${w*.7} ${-(outer-.16)} ${w*.78} ${-(outer)}`;
    return `M${-w} ${-(outer)} C${-w*.96} ${-(outer-.16)} ${-w*.78} ${-(inner+.26)} ${-w*.78} ${-(inner+.13)} Q${-w*.78} ${-(inner)} 0 ${-(inner)} Q${w*.78} ${-(inner)} ${w*.78} ${-(inner+.13)} C${w*.78} ${-(inner+.26)} ${w*.96} ${-(outer-.16)} ${w} ${-(outer)}`;
  }
  function tongueCutSvg() {
    const cut=d=>`<path class="td-cut-depth" d="${d}"/><path class="td-cut-edge" d="${d}"/>`;
    return `<svg class="tongue-cut" viewBox="-1 -1 2 2" preserveAspectRatio="none" aria-hidden="true">${['','lotus','double'].map(shape=>`<g class="td-cut-${shape||'round'}">${cut(tonguePath(shape,.76,-.82,.92))}${shape==='double'?`${cut(tonguePath('',.46,-.58,.92))}`:''}</g>`).join('')}</svg>`;
  }
  let uid = 0;
  function preview(look = {}, options = {}) {
    const s=skinOf(look.skin), e=effective(look), id=`cos-preview-${++uid}`;
    const [a,b,c]=s.palette;
    const texture=s.texture ? `<image href="${asset(s.texture)}" x="-1" y="-1" width="2" height="2" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id}-clip)"/>` : '';
    const tone=options.tongue;
    let pads='';
    const makePad=(x,y,rx,ry,central=false,index=0)=>`<g class="cos-tone-field" data-note="${central?'D':index}" transform="translate(${x} ${y})"><ellipse rx="${rx}" ry="${ry}" fill="url(#${id}-pad)" stroke="${a}" stroke-opacity=".35" stroke-width=".012"/><ellipse rx="${rx*(central?.42:.5)}" ry="${ry*(central?.42:.5)}" class="cos-preview-dip" fill="url(#${id}-dip)" stroke="#fff" stroke-opacity=".22" stroke-width=".006"/>${options.labels?`<text y=".026" text-anchor="middle" fill="white" stroke="#08111e" stroke-width=".014" paint-order="stroke" font-family="system-ui" font-weight="700" font-size=".105">${central?'D':index}</text>`:''}</g>`;
    const cut=(d,inner=false)=>`<path class="cos-cut-depth" d="${d}" fill="none" stroke="#040611" stroke-width="${s.id==='nebula'?(inner?'.024':'.032'):(inner?'.012':'.018')}" stroke-linecap="round"/>${s.id==='nebula'?`<path class="cos-cut-gold" d="${d}" fill="none" stroke="url(#${id}-cut-gold)" stroke-width="${inner?'.009':'.013'}" stroke-linecap="round"/>`:''}`;
    if(tone) {
      for(let i=0;i<8;i++) {
        const inner=.35+i*.009,outer=.935-i*.004,w=.19-i*.004,shape=e.shape||'',d=tonguePath(shape,w,inner,outer);
        pads+=`<g class="cos-tongue-field" transform="rotate(${i*45})">${e.accent?`<path class="cos-preview-dip" d="${tonguePath(shape,w*.84,inner+.035,outer-.012)}" fill="url(#${id}-dip)" opacity=".35"/>`:""}${cut(d)}${shape==='double'?cut(tonguePath('',w*.61,inner+.10,outer),true):''}</g>`;
      }
    } else {
      pads+=makePad(0,0,.27,.24,true);
      handpanFields(options.noteCount||9).forEach(p=>{pads+=`<g transform="translate(${p.x} ${p.y}) rotate(${p.rot})">${makePad(0,0,p.rx,p.ry,false,p.num)}</g>`;});
    }
    return `<svg class="cos-drum-preview" data-skin="${s.id}" data-rim="${e.rim}" data-accent="${e.accent}" data-pattern="${e.pattern}" data-shape="${e.shape||''}" viewBox="-1.09 -1.09 2.18 2.18" aria-hidden="true"><defs><linearGradient id="${id}-cut-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff1bc"/><stop offset=".32" stop-color="#dba64d"/><stop offset=".62" stop-color="#92601e"/><stop offset="1" stop-color="#ffe3a0"/></linearGradient><radialGradient id="${id}-shell" cx="35%" cy="28%" r="80%"><stop stop-color="${a}"/><stop offset=".52" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></radialGradient><radialGradient id="${id}-pad" cx="37%" cy="25%"><stop stop-color="${a}" stop-opacity=".65"/><stop offset=".7" stop-color="${b}" stop-opacity=".42"/><stop offset="1" stop-color="${c}" stop-opacity=".8"/></radialGradient><radialGradient id="${id}-dip" cx="35%" cy="25%"><stop stop-color="var(--dip-a,${b})"/><stop offset=".55" stop-color="var(--dip-b,${c})"/><stop offset="1" stop-color="var(--dip-c,${b})"/></radialGradient><clipPath id="${id}-clip"><circle r=".984"/></clipPath></defs><circle r="1" fill="url(#${id}-shell)" stroke="${a}" stroke-width=".02"/>${texture}<ellipse cx="-.28" cy="-.38" rx=".54" ry=".18" transform="rotate(-32)" fill="white" opacity=".06"/>${pads}${patternSvg(e.pattern)}${e.rim ? rimSvg(options.large?96:48) : ''}</svg>`;
  }
  function enhanceDrum(svg, prefix) {
    const defs=svg.querySelector('defs'), body=svg.querySelector('.hp-body');
    const clip=el('clipPath',{id:`${prefix}-cos-clip`},defs); el('circle',{r:.98},clip);
    const texture=el('image',{x:-1,y:-1,width:2,height:2,'clip-path':`url(#${prefix}-cos-clip)`,preserveAspectRatio:'xMidYMid slice',class:'cosmetic-texture'});
    body.querySelector('.hp-shell').after(texture);
    const dip=el('radialGradient',{id:`${prefix}-cos-dip`,cx:'32%',cy:'25%'},defs);
    [['0%','--dip-a'],['55%','--dip-b'],['100%','--dip-c']].forEach(([offset,color])=>el('stop',{offset,style:`stop-color:var(${color},#8c6940)`},dip));
    svg.querySelectorAll('.pad:not(.pad-perc) .dimple').forEach(node=>node.style.setProperty('--dip-fill',`url(#${prefix}-cos-dip)`));
    const decor=el('g',{class:'cos-accessories','pointer-events':'none'},svg);
    decor.innerHTML=patternSvg()+rimSvg(112);
    applyTextures(document.body.dataset.skin,svg);
  }
  function applyTextures(id, scope=document) {
    const texture=skinOf(id).texture;
    scope.querySelectorAll('.cosmetic-texture').forEach(image=>{if(texture){image.setAttribute('href',asset(texture));image.style.display='';}else{image.removeAttribute('href');image.style.display='none';}});
  }
  function apply(look) {
    const e=effective(look);
    for(const key of ['rim','accent','pattern','shape']){if(e[key])document.body.dataset[key]=e[key];else delete document.body.dataset[key];}
    const [a,b,c]=skinOf(look.skin).palette;
    const light=['silver','gold','champagne','marble','silver-copper','celadon-gold'].includes(look.skin);
    const values={'--skin-a':a,'--skin-b':b,'--skin-c':c,'--skin-pad-a':a,'--skin-pad-b':b,'--skin-pad-op':'.6','--skin-rim-a':a,'--skin-rim-b':b,'--skin-rim-c':a,'--skin-ink':light?'#152b36':'#f5f6fb','--skin-ink-stroke':light?'#f6fcfb99':'#040d1e99'};
    Object.entries(values).forEach(([key,value])=>document.body.style.setProperty(key,value));
    applyTextures(look.skin);
    const texture=skinOf(look.skin).texture;
    document.body.style.setProperty('--finish-texture',texture?`url("${asset(texture)}")`:'linear-gradient(transparent,transparent)');
    document.body.style.setProperty('--skin-decor',texture?`url("${asset(texture)}")`:'linear-gradient(transparent,transparent)');
  }
  function enhanceTongue(body) {
    const overlay=el('svg',{viewBox:'-1.09 -1.09 2.18 2.18',class:'cos-td-overlay','aria-hidden':'true'});
    overlay.innerHTML=patternSvg()+rimSvg(96);body.appendChild(overlay);
  }
  window.EtherealCosmetics={skins,rims,accents,patterns,nebulas,shapes,handpanFields,tonguePath,tongueCutSvg,catalog,gate,asset,skinOf,effective,preview,enhanceDrum,enhanceTongue,apply};
})();
