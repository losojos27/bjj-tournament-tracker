// Headless test of the schedule engine (queue()) in index.html.
// Run: node scripts/queue-test.js   — exits non-zero on the first failed check.
// Uses its own small bracket, not data/results.json, so it stays meaningful after the event.
const fs=require('fs'); const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const m=html.match(/<script id="app">([\s\S]*?)<\/script>/g);
if(!m||m.length!==1) throw new Error(`expected exactly one <script id="app"> block, found ${m?m.length:0}`);
const src=m[0].replace(/^<script id="app">/,'').replace(/<\/script>$/,'');

// ---- stubs: the engine never touches the DOM in queue(), but the script's top level references these
let api=null;
const el={innerHTML:'',addEventListener(){},classList:{toggle(){}},dataset:{},querySelector:()=>null,querySelectorAll:()=>[]};
const window={QUEUE_TEST:a=>{api=a;},AppTheme:null,isSecureContext:false,scrollTo(){},addEventListener(){}};
const document={querySelector:()=>el,querySelectorAll:()=>[],addEventListener(){},hidden:false,createElement:()=>({style:{},setAttribute(){},select(){},remove(){}}),body:{appendChild(){}},execCommand:()=>false};
const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
new Function('window','document','localStorage','setInterval','fetch','navigator',src)(window,document,localStorage,()=>{},()=>new Promise(()=>{}),{});
if(!api) throw new Error('index.html did not hand the engine to QUEUE_TEST');
const {queue,S,setData,setLive}=api;

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
S.day=2; S.mats=3;

// A) no Flo lists, no live bout: block order across the assumed 3 mats, starting no earlier than the day's start
setData(fixture()); setLive({});
let q=queue();
ok(!q.floOrder && q.mode==='schedule' && q.matCount===3, 'A: fallback path reports schedule mode on 3 assumed mats');
ok(nums(q).slice(0,3).join()==='77,78,85', 'A: block order places the men\'s semis then the women\'s semi first: '+nums(q));
ok(q.list.every(x=>x.at.getTime()>=new Date(2026,8,13,11,0).getTime()), 'A: nothing is projected before the day\'s start');
ok(!nums(q).includes('57') && !nums(q).includes('49'), 'A: decided bouts are not queued');

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
ok(nums(q).slice(0,2).join()==='58,77', 'C: a Flo-listed quarterfinal (day-1 block) is placed in Flo\'s order: '+nums(q));

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

console.log(`ALL QUEUE CHECKS PASSED (${checks} checks)`);
