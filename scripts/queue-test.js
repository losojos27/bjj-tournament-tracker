// Headless check of the schedule engine in index.html against data/results.json.
// Run: node scripts/queue-test.js   (exits non-zero on a failed check)
const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const src=html.split('<script>').pop().split('</script>')[0].replace(/^loadState\(\); loadData\(\); loadLive\(\);\s*$/m,'');
const stub={innerHTML:'',addEventListener(){},classList:{toggle(){},add(){},remove(){}},querySelectorAll:()=>[],dataset:{},querySelector:()=>null};
global.window={}; global.document={querySelector:()=>stub,querySelectorAll:()=>[],addEventListener(){},hidden:false};
global.localStorage={getItem:()=>null,setItem(){}}; global.setInterval=()=>{}; global.fetch=()=>new Promise(()=>{});
const ctx=new Function(src+`;return {setData:d=>{DATA=d},setLive:l=>{LIVE=l},queue,S,renderNext,setTab:t=>{tab=t}};`)();
const data=JSON.parse(fs.readFileSync(require('path').join(__dirname,'..','data','results.json')));
ctx.S.day=2; const now=Date.now();
const show=(label)=>{ const q=ctx.queue(); console.log(`\n# ${label}: mode=${q.mode} flo=${q.floOrder} mats=${q.matCount} n=${q.list.length}`); q.list.slice(0,7).forEach(m=>console.log(`  ${m.onMat?'NOW  ':m.at.toTimeString().slice(0,5)} mat${m.mat} #${m.bout?.n} ${m.div.name} ${m.rName}`)); return q; };
// A) no Flo lists, no live
ctx.setData(JSON.parse(JSON.stringify(data))); ctx.setLive({}); show('A block order, 3 mats assumed');
// B) Flo lists Mat1 [#73,#77,#79], Mat2 [#74,#78] only; live bout #75 in progress on Mat 3 (not listed)
const d2=JSON.parse(JSON.stringify(data)); d2.mats=[{name:'Mat 1',upcoming:[{n:'73'},{n:'77'},{n:'79'}]},{name:'Mat 2',upcoming:[{n:'74'},{n:'78'}]},{name:'Mat 3',upcoming:[]}];
ctx.setData(d2); ctx.setLive({'75':{n:'75',mat:'Mat 3',matIdx:2,red:{},blue:{},clock:'4:00',period:'1',over:false,winner:null,updated:now}});
const qB=show('B Flo lists on mats 1-2, live #75 on mat 3'); if(!qB.list.some(m=>m.mat===3&&!m.onMat)) throw new Error('fix 1 failed: nothing scheduled on mat 3');
if(qB.matCount!==3) throw new Error('fix 6 failed: matCount '+qB.matCount);
ctx.setLive({});
// D) Flo lists a bout whose block is tagged for day 1 (a men's QF #57 is day:1) — must still be placed
const d4=JSON.parse(JSON.stringify(data)); const qf=d4.divs.find(d=>d.id==='m99').rounds[1].bouts[0]; qf.w=null; qf.decided=false;
d4.mats=[{name:'Mat 1',upcoming:[{n:'57'},{n:'73'}]}]; ctx.setData(d4);
const qD=show('D Flo lists #57 (block tagged day 1)'); if(!qD.list.some(m=>m.bout?.n==='57')) throw new Error('fix 2 failed: #57 dropped');
if(qD.matCount!==1) throw new Error('fix 6: expected 1 mat, got '+qD.matCount);
console.log('\nALL QUEUE CHECKS PASSED');
