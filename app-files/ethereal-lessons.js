/* Ethereal r29 · deliberate practice, musical layers and preparation for a song. */
(function () {
  'use strict';
  const lessons = [
    {id:'pulse',name:'Pulse & breathing room',tag:'FOUNDATION',skill:'Keep time through silence. Let each note ring, with a light, relaxed touch.',patterns:[[[1,1],[0,1],[1,1],[0,1]],[[1,1],[2,1],[0,1],[2,1]],[[1,.5],[2,.5],[0,1],[3,1],[2,1]]],tips:['Count 1 · 2 · 3 · 4 even during the rests.','Move to a second note without changing the pulse.','Keep the same pulse as the melody starts to move.']},
    {id:'hands',name:'Hands in conversation',tag:'COORDINATION',skill:'Pass the phrase between your hands. Use equal volume and a small, relaxed movement.',patterns:[[[1,1],[2,1],[1,1],[2,1]],[[1,.5],[2,.5],[3,1],[2,.5],[1,.5],[3,1]],[[1,.5],[2,.5],[3,.5],[2,.5],[5,.5],[3,.5],[2,1]]],tips:['Alternate L-R slowly; neither hand should feel rushed.','Add the half beats, keeping the longer notes calm.','Turn the hand pattern into a flowing melodic phrase.']},
    {id:'doubles',name:'Doubles into a melody',tag:'CONTROL',skill:'Two light strokes per hand, then move the same gesture to another note.',patterns:[[[1,.5],[1,.5],[2,1],[3,.5],[3,.5],[2,1]],[[1,.5],[1,.5],[2,.5],[2,.5],[3,.5],[3,.5],[5,.5],[5,.5]],[[5,.5],[5,.5],[3,.5],[3,.5],[2,1],[1,1]]],tips:['Use L-L-R, then R-R-L. Avoid forcing the second stroke.','Keep each pair even while moving up the instrument.','Bring the doubles back down and give the ending space.']},
    {id:'arpeggio',name:'Climbing & returning',tag:'MELODY',skill:'Learn a short ascending shape, then its answer. Prepare the next note before moving.',patterns:[[[1,1],[2,1],[3,1],[5,1]],[[1,.5],[2,.5],[3,.5],[5,.5],[3,1],[2,1]],[[1,.5],[2,.5],[3,.5],[5,.5],[5,.5],[3,.5],[2,.5],[1,.5]]],tips:['Find four notes before starting. Keep the movement economical.','Add the descending answer without a pause.','Join ascent and descent into one continuous phrase.']},
    {id:'332',name:'The 3 · 3 · 2 groove',tag:'GROOVE',skill:'Feel an eight-note cycle grouped 3 + 3 + 2 while the underlying four beats stay steady.',patterns:[[[1,1.5],[2,1.5],[3,1]],[[1,1.5],[3,1.5],[5,1]],[[1,.5],[2,.5],[3,.5],[1,.5],[3,.5],[5,.5],[2,.5],[3,.5]]],tips:['Count ONE two three · ONE two three · ONE two.','Keep the spacing while changing the melody.','Fill in the subdivisions; keep the group accents in your body.']},
    {id:'layers',name:'Anchor & answering melody',tag:'MUSICAL LAYERS',skill:'Build a phrase one layer at a time: a home note, an answer, then a small melodic variation.',patterns:[[[1,1],[0,1],[1,1],[0,1]],[[1,1],[3,1],[1,1],[5,1]],[[1,.5],[3,.5],[2,1],[1,.5],[5,.5],[3,1]]],tips:['Make the home note steady, without striking harder.','Add just one answering note in each space.','Keep the anchor recognisable as the answer grows.']}
  ];
  const goals=[75,80,85], phaseNames=['Find the movement','Add a musical layer','Make it flow'];
  const repeat=(array,n)=>Array.from({length:n},(_,i)=>array[i%array.length]);
  const cleanBars=source=>String(source?.sequence||'').replace(/^\s*#.*$/gm,'').split('|').map(x=>x.trim()).filter(Boolean);
  function exercise(id,phase=0,tongue=false,source=null) {
    phase=Math.max(0,Math.min(2,Number(phase)||0));
    if(id==='song' && cleanBars(source).length) {
      const bars=cleanBars(source), take=[2,4,8][phase], selected=bars.slice(0,take), count=Math.max([4,3,2][phase],Math.ceil([8,12,16][phase]/selected.length));
      return {lesson:id,phase,sourceId:source.id,title:`Prepare · ${source.title} · ${phase+1}/3`,about:['Learn the opening slowly. Listen first; then find each note.','Connect the opening phrases without stopping.','Join the longer section and get ready for the full song.'][phase],bpm:Math.max(35,Math.round((source.bpm||80)*[.55,.75,.9][phase])),beatsPerBar:source.beatsPerBar||4,sequence:Array.from({length:count},()=>selected.join(' | ')).join(' | ')+' |',goal:goals[phase],length:`${selected.length} phrases × ${count}`};
    }
    const lesson=lessons.find(l=>l.id===id)||lessons[0], pattern=lesson.patterns[phase], bars=[8,12,16][phase];
    let strike=0;
    const seq=repeat([pattern],bars).map(events=>events.map(([note,d])=>{
      const hand=lesson.id==='doubles'?(Math.floor(strike++/2)%2?'R':'L'):(strike++%2?'R':'L');
      const label=note===0?(tongue?'0':'-'):tongue?String(note):`${note===1?'D':note}${hand}`;
      return label+(d===1?'':`:${d}`);
    }).join(' ')).join(' | ')+' |';
    return {lesson:lesson.id,phase,title:`${lesson.name} · ${phase+1}/3`,about:lesson.tips[phase],bpm:[60,72,84][phase],beatsPerBar:4,sequence:seq,goal:goals[phase],length:`${bars} bars`};
  }
  function create({app,tongue=false,source,onStart,onSong,onListen,onPractice=()=>{},onLayout=()=>{},canPlay=()=>true}) {
    const key=`${app}-lessons-v1`, esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    let active=null, dialog=null, lastPassed=false;
    const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{scores:{}};}catch{return {scores:{}};}};
    const stamp=(id,p,s)=>`${id}:${id==='song'?s?.id||'':''}:${p}`;
    const score=(id,p,s)=>Number(read().scores?.[stamp(id,p,s)])||0;
    const available=(id,p,s)=>p===0||score(id,p-1,s)>=goals[p-1];
    function begin(id,phase=0,s=null) {
      if(!available(id,phase,s))return false;
      const ex=exercise(id,phase,tongue,s);active={id,phase,source:s,exercise:ex,recorded:false};lastPassed=false;
      onStart(ex);showBanner();return true;
    }
    function showBanner() {
      let banner=document.querySelector('.lesson-banner');
      if(!active){if(banner){banner.remove();onLayout();}return;}
      if(!banner){const toolbar=document.querySelector('.trainer-toolbar');if(!toolbar)return;banner=document.createElement('section');banner.className='lesson-banner';toolbar.before(banner);}
      const e=active.exercise;
      banner.innerHTML=`<div><small>GUIDED PRACTICE · STEP ${e.phase+1} OF 3 · ${e.length}</small><b>${esc(e.title)}</b><p>${esc(e.about)}</p><span>Goal: ${e.goal}% · Practice · whole run at 1×</span></div><div class="lesson-banner-actions"><button type="button" data-coach-listen>Listen first</button><button type="button" data-coach-practise>Practise step</button><button type="button" data-coach-open>Lesson plan</button></div>`;
      banner.querySelector('[data-coach-listen]').onclick=onListen;
      banner.querySelector('[data-coach-practise]').onclick=onPractice;
      banner.querySelector('[data-coach-open]').onclick=()=>open(active.id,active.source);
      onLayout();
    }
    function record({accuracy,eligible,mode,speed}) {
      if(!active)return null;
      const passed=Boolean(eligible && mode==='practice' && speed>=1 && accuracy>=active.exercise.goal);
      lastPassed=passed;
      if(!active.recorded && passed){const data=read();data.scores=data.scores||{};const k=stamp(active.id,active.phase,active.source);data.scores[k]=Math.max(score(active.id,active.phase,active.source),accuracy);localStorage.setItem(key,JSON.stringify(data));active.recorded=true;}
      const next=passed?(active.phase<2?'Next learning step →':active.id==='song'?'Play the full song →':'Choose another lesson →'):'Practise this step again';
      return {passed,next,text:passed?(active.phase<2?'Step mastered. You are ready to add the next layer.':active.id==='song'?'Preparation complete. Take the phrase into the full song.':'Three steps complete. Keep the movement relaxed when you use it in a song.'):`Aim for ${active.exercise.goal}% in Practice at 1×. Listen to the phrase, slow down to learn it, then try the full step again.`};
    }
    function next() {
      if(!active)return false;
      if(!lastPassed){begin(active.id,active.phase,active.source);return true;}
      if(active.phase<2){begin(active.id,active.phase+1,active.source);return true;}
      const s=active.source;
      if(active.id==='song' && s && canPlay(s.id)){clear();onSong(s.id);return true;}
      open(active.id,s);return true;
    }
    function clear(){active=null;lastPassed=false;showBanner();}
    function open(selected='song',chosen=null) {
      const s=chosen||source();if(selected==='song'&&!cleanBars(s).length)selected='pulse';
      if(!dialog){dialog=document.createElement('dialog');dialog.className='dialog lesson-dialog';document.body.appendChild(dialog);}
      const paint=()=>{
        const l=lessons.find(l=>l.id===selected), name=l?.name||`Prepare · ${s?.title||'your song'}`;
        dialog.innerHTML=`<section class="lesson-school"><header><small>THE PRACTICE STUDIO</small><button type="button" data-close aria-label="Close">×</button><h2>Small skills. Real music.</h2><p>Listen, build the movement, then make it musical. Each lesson has three longer steps; your progress is saved.</p></header><div class="lesson-school-grid"><nav aria-label="Practice lessons">${cleanBars(s).length?`<button type="button" data-lesson="song" aria-pressed="${selected==='song'}"><small>FOR THIS SONG</small><b>${esc(s.title)}</b><span>Learn its actual opening phrases</span></button>`:''}${lessons.map(item=>`<button type="button" data-lesson="${item.id}" aria-pressed="${selected===item.id}"><small>${item.tag}</small><b>${item.name}</b><span>${[0,1,2].filter(p=>score(item.id,p)>=goals[p]).length} / 3 steps mastered</span></button>`).join('')}</nav><article class="lesson-plan"><small>LISTEN → BUILD → CONNECT</small><h3>${esc(name)}</h3><p>${esc(l?.skill||'Practise the actual notes and rhythm of the song you have selected. Start with a slow opening, connect more phrases, then return to the full song.')}</p><ol>${[0,1,2].map(p=>{const ex=exercise(selected,p,tongue,s),done=score(selected,p,s)>=goals[p],ok=available(selected,p,s);return `<li class="${done?'mastered':''}"><span class="lesson-step-number">${done?'✓':p+1}</span><div><b>${phaseNames[p]}</b><p>${esc(ex.about)}</p><small>${esc(ex.length)} · ${ex.bpm} BPM · goal ${goals[p]}%</small><button type="button" data-phase="${p}" ${ok?'':'disabled'}>${done?'Revisit step':ok?'Practise this step':'Master the previous step'}</button></div></li>`;}).join('')}</ol><p class="lesson-footnote">Listen and Wait for note are always available for learning. Step completion uses a full Practice run at 1×. Start slowly with the speed control whenever you need.</p></article></div></section>`;
        dialog.querySelector('[data-close]').onclick=()=>dialog.close();
        dialog.querySelectorAll('[data-lesson]').forEach(b=>b.onclick=()=>{selected=b.dataset.lesson;paint();});
        dialog.querySelectorAll('[data-phase]').forEach(b=>b.onclick=()=>{const phase=Number(b.dataset.phase);dialog.close();begin(selected,phase,selected==='song'?s:null);});
      };paint();if(!dialog.open)dialog.showModal();
    }
    return {key,open,begin,clear,record,next,showBanner,get active(){return active;}};
  }
  window.EtherealLessons={lessons,exercise,create,cleanBars};
})();
