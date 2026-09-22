// Headless test of the schedule engine (queue()) in index.html.
// Run: node scripts/queue-test.js   — exits non-zero on the first failed check.
// Uses its own small bracket, not data/results.json, so it stays meaningful after the event.
const fs=require('fs'); const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script id="app">([\s\S]*?)<\/script>/g);
if(!m||m.length!==1) throw new Error(`expected exactly one <script id="app"> block, found ${m?m.length:0}`);
const src=m[0].replace(/^<script id="app">/,'').replace(/<\/script>$/,'');

// ---- stubs: the engine never touches the DOM in queue(), but the script's top level references these
function load(location){
  let api=null;
  const el={innerHTML:'',addEventListener(){},classList:{toggle(){}},dataset:{},querySelector:()=>null,querySelectorAll:()=>[]};
  const window={QUEUE_TEST:a=>{api=a;},AppTheme:null,isSecureContext:false,scrollTo(){},addEventListener(){}};
  const document={querySelector:()=>el,querySelectorAll:()=>[],addEventListener(){},hidden:false,createElement:()=>({style:{},setAttribute(){},select(){},remove(){}}),body:{appendChild(){}},execCommand:()=>false};
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  new Function('window','document','localStorage','setInterval','fetch','navigator','location',src)(window,document,localStorage,()=>{},()=>new Promise(()=>{}),{},location);
  if(!api) throw new Error('index.html did not hand the engine to QUEUE_TEST');
  return api;
}
const api0=load({hostname:'losojos27.github.io',search:''}); const {queue,S,setData,setLive,SIM,forget,seen}=api0;

// ---- fixture: a men's division at the semifinal stage, a women's division at the quarterfinal stage
const P=(name,seed,team='Brazil')=>({name,seed,team});
const bout=(n,a,b,w=null,extra={})=>({n:String(n),a,b,w,decided:w!==null,result:null,winType:null,mat:null,video:null,...extra});
function fixture(){
  return {updated:new Date().toISOString(),event:{},mats:[],divs:[
    {id:'m99',name:'-99kg',sex:'m',kind:'pro',size:16,rounds:[
      {name:'R16',bouts:[1,2,3,4,5,6,7,8].map(i=>bout(i,P('R'+i+'a',i),P('R'+i+'b',17-i),0))},
      {name:'QF',bouts:[bout(57,P('R1a',1),P('R2a',9),0),bout(58,P('R3a',3),P('R4a',13),null),bout(59,P('R5a',5),P('R6a',11),0),bout(60,P('R7a',7),P('R8a',15),0)]},
      {name:'SF',bouts:[bout(77,P('R1a',1),null),bout(78,P('R5a',5),P('R7a',7))]},
      {name:'F',bouts:[bout(null,null,null)]}],
     third:bout(null,null,null)},
    {id:'w55',name:'W -55kg',sex:'w',kind:'pro',size:8,rounds:[
      {name:'QF',bouts:[bout(49,P('W1',1,'USA'),P('W8',8),0),bout(50,P('W5',5),P('W4',4),0),bout(51,P('W3',3),P('W6',6),0),bout(52,P('W7',7),P('W2',2),0)]},
      {name:'SF',bouts:[bout(85,P('W1',1,'USA'),P('W5',5)),bout(86,P('W3',3),P('W7',7))]},
      {name:'F',bouts:[bout(null,null,null)]}],
     third:bout(null,null,null)},
  ]};
}
const live=(n,matIdx,over=false,winner=null)=>({n:String(n),mat:'Mat '+(matIdx+1),matIdx,red:{},blue:{},clock:'4:00',period:'1',over,winner,updated:Date.now()});
const nums=q=>q.list.map(x=>x.bout&&x.bout.n);
let checks=0; const ok=(cond,msg)=>{ checks++; if(!cond) throw new Error('FAILED: '+msg); };
S.mats=3;

// A) no Flo lists, no live bout: block order across the assumed 3 mats, starting no earlier than the day's start
setData(fixture()); setLive({});
let q=queue();
ok(!q.floOrder && q.mode==='schedule' && q.matCount===3, 'A: fallback path reports schedule mode on 3 assumed mats');
ok(nums(q).slice(0,3).join()==='58,77,78', 'A: the unfought day-1 quarterfinal comes first, then the men\'s semis: '+nums(q));
ok(q.list.every(x=>x.at.getTime()>=new Date(2026,8,12,11,0).getTime()), 'A: nothing is projected before the first open day\'s start');
ok(!nums(q).includes('57') && !nums(q).includes('49'), 'A: decided bouts are not queued');
{ const lastSF=Math.max(...q.list.filter(x=>x.rName==='SF').map(x=>x.at.getTime()+20*60000)); const first3=Math.min(...q.list.filter(x=>x.rName==='3').map(x=>x.at.getTime()));
  ok(first3>=lastSF+30*60000, 'A: 3rd-place bouts start at least 30 min after the last semifinal ends'); }
// G) Flo trumps the assumed intermission: a live 3rd-place bout in progress means no gap is inserted
{ const d7=fixture(); setData(d7); setLive({'99':Object.assign(live(99,0),{round:'3rd Place'})}); const q7=queue();
  const lastSF=Math.max(...q7.list.filter(x=>x.rName==='SF').map(x=>x.at.getTime())); const first3=Math.min(...q7.list.filter(x=>x.rName==='3'&&!x.onMat).map(x=>x.at.getTime()));
  ok(first3<lastSF+50*60000, 'G: with a live 3rd-place bout on the feed, no 30-min gap is assumed'); }
// F) semis already over when the projection starts: no automatic gap (an intermission then is the break-until setting's job)
{ const d6=fixture(); for(const div of d6.divs) for(const r of div.rounds) if(r.name==='SF'||r.name==='QF') for(const b of r.bouts){ b.w=0; b.decided=true; }
  setData(d6); setLive({}); const q6=queue(); const first=q6.list[0];
  ok(first&&first.rName==='3'&&first.at.getTime()<=Date.now()+60000, 'F: with semis done, the first 3rd-place bout projects from now, not now+30: '+(first&&first.at.toTimeString().slice(0,5))); }

// B) Flo lists mats 1-2 only; a live bout is in progress on mat 3, which Flo lists nothing for
let d=fixture(); d.mats=[{name:'Mat 1',upcoming:[{n:'78'},{n:'86'}]},{name:'Mat 2',upcoming:[{n:'77'}]}];
setData(d); setLive({'85':live(85,2)});
q=queue();
ok(q.floOrder && q.mode==='live' && q.matCount===3, 'B: Flo-order path with the live mat counted: flo='+q.floOrder+' mode='+q.mode+' mats='+q.matCount);
const onMat1=q.list.filter(x=>x.mat===1&&!x.onMat).map(x=>x.bout.n);
ok(onMat1.slice(0,2).join()==='78,86', 'B: mat 1 runs Flo\'s listed bouts in Flo\'s order: '+onMat1);
ok(q.list.some(x=>x.mat===2&&x.bout.n==='77'), 'B: mat 2 gets its listed bout');
ok(q.list.some(x=>x.onMat&&x.bout.n==='85'&&x.mat===3), 'B: the live bout shows as on mat 3');
ok(q.list.some(x=>x.mat===3&&!x.onMat), 'B: a live-only mat still receives fallback bouts');

// C) Flo lists a bout whose block is tagged for the other day (the block tags are a guess): it must still be placed
d=fixture(); d.mats=[{name:'Mat 1',upcoming:[{n:'58'},{n:'77'}]}];
setData(d); setLive({});
q=queue();
ok(q.floOrder && q.matCount===1, 'C: only the one listed mat is in use');
ok(nums(q).slice(0,2).join()==='58,77', 'C: Flo\'s listed order is followed: '+nums(q));

// D) a live in-progress bout listed second on its mat: the entry listed before it counts as already run
d=fixture(); d.mats=[{name:'Mat 1',upcoming:[{n:'77'},{n:'78'},{n:'85'}]}];
setData(d); setLive({'78':live(78,0)});
q=queue();
ok(!nums(q).includes('77'), 'D: the bout listed before the live one is treated as run: '+nums(q));
ok(nums(q)[0]==='78' && q.list[0].onMat, 'D: the live bout leads the queue');

// E) a bout decided with no winner (double DQ) and a live-feed result both count as decided
d=fixture(); d.divs[0].rounds[2].bouts[1].decided=true;   // #78: decided, w null
setData(d); setLive({'85':live(85,0,true,0)});           // #85 finished per the live feed
q=queue();
ok(!nums(q).includes('78'), 'E: a decided-without-winner bout is not queued');
ok(!nums(q).includes('85'), 'E: a bout the live feed reports finished is not queued');
forget();

// I) the live feed holds only each mat's current bout: a finish seen there must survive the mat moving on,
//    until results.json confirms it (the bug the simulator found on Sept 21)
{ forget(); setData(fixture()); setLive({'85':live(85,0,true,0)});
  ok(!nums(queue()).includes('85'), 'I: a bout the live feed reports finished is not queued');
  setLive({'86':live(86,0)});                                  // the mat has moved on to its next bout; #85 is gone from the feed
  const qi=queue(); ok(!nums(qi).includes('85'), 'I: the finished bout stays decided after its mat moves on: '+nums(qi));
  ok(seen()===1, 'I: exactly one remembered finish');
  const d9=fixture(); const b85=d9.divs[1].rounds[1].bouts[0]; b85.w=1; b85.decided=true; setData(d9);   // results.json catches up (and disagrees: Flo wins)
  ok(seen()===0, 'I: a finish is forgotten once results.json confirms the bout');
  forget(); setLive({}); }
// H) simulation mode: only on a local/private host, and projected slot lengths shrink by the sim's speed
ok(SIM===false, 'H: the public site is not in sim mode');
ok(load({hostname:'losojos27.github.io',search:'?sim'}).SIM===false, 'H: ?sim does nothing on the public hostname');
ok(load({hostname:'192.168.1.20',search:'?sim=1'}).SIM===true && load({hostname:'evil.example.com',search:'?sim'}).SIM===false, 'H: ?sim works on a private address and not on an arbitrary host');
{ const pub=load({hostname:'losojos27.github.io',search:'?demo'}); ok(pub.DEMO===true && pub.SIM===false, 'H: ?demo enables the in-browser demo on the public site, without sim mode');
  ok(load({hostname:'localhost',search:'?sim&demo'}).DEMO===false, 'H: the server simulation wins when both are asked for');
  pub.S.mats=1; const d10=fixture(); d10.sim={speed:60,demo:true}; pub.setData(d10); pub.setLive({});
  const q10=pub.queue().list.filter(x=>x.rName==='SF'); ok(Math.abs((q10[1].at-q10[0].at)/1000-20)<1, 'H: demo projections scale with the demo speed too'); }
{ const simApi=load({hostname:'localhost',search:'?sim'}); ok(simApi.SIM===true, 'H: ?sim on localhost enables sim mode');
  simApi.S.mats=1; const d8=fixture(); d8.sim={speed:20}; simApi.setData(d8); simApi.setLive({});
  const q8=simApi.queue().list.filter(x=>x.rName==='SF'); const gap=(q8[1].at-q8[0].at)/1000;
  ok(Math.abs(gap-20*60/20)<1, 'H: at ×20 a 20-minute semifinal slot projects as 60 s of wall time, got '+gap+'s'); }

// J) result wording: Flo's times are cumulative; the live feed's score is red-blue and its overtime lives in `period`
{ const f=api0.fmtResult, lr=api0.liveResult;
  ok(f('SUB','0-0 14:17 TB1')==='submission at 14:17 · overtime' && f('SCORE','5-0 15:00 TB1')==='5-0 on points · overtime' && f('SCORE','0-0 15:00 TB1')==='won in overtime' && f('REF','0-0 14:17 TB1')==='referee decision · overtime' && f('FOR','0-0')==='forfeit' && f('SUB','6-0 6:53')==='submission at 6:53', 'J: finishes read as finishes, with the cumulative match time');
  const L=(w,score,period,winType)=>({over:true,winner:w,finalScore:score,period,winType});
  ok(lr(L(1,'0-3','1','SCORE'))==='3-0 on points', 'J: a blue (bottom-slot) win reads winner-first: '+lr(L(1,'0-3','1','SCORE')));
  ok(lr(L(0,'0-0','TB1','SCORE'))==='won in overtime' && lr(L(0,'0-0','TB1','REF'))==='referee decision · overtime', 'J: overtime reaches live-sourced results through the period field');
  ok(lr(L(0,null,'1',null))==='', 'J: a feed entry with no finish yields empty text, not dangling separators'); }

console.log(`ALL QUEUE CHECKS PASSED (${checks} checks)`);
