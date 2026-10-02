// Run with: node check-set-feedback.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({window:{},localStorage:{getItem:()=>null},TextEncoder,TextDecoder,atob,btoa});
vm.runInContext(fs.readFileSync(path.join(__dirname,'exercises.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'app.js'),'utf8').replace(
  /^\s*initialize\(\);/m,
  '    globalThis.check = {state,setGroups,normalizeEntry,renderSetGroups,effortLabel,progressSuggestion,makeEntry,formatNumber,planToken,decodePlan};'
),context);
const {state,setGroups,normalizeEntry,renderSetGroups,effortLabel,progressSuggestion,makeEntry,formatNumber} = context.check;
const ex = context.window.EXERCISES.find(item=>item.id==='exercise-6');
const date = new Date().toLocaleDateString('sv-SE');
const entry = {
  entryId:'check',exerciseId:ex.id,slot:'Грудной жим',rir:'some',discomfort:'no',
  sets:Array.from({length:ex.minSets},()=>({kind:'work',weight:'20',reps:String(ex.maxReps)}))
};
entry.sets.push({kind:'warm',weight:'5',reps:'20'});

const groups = setGroups(entry);
assert.equal(groups[0].rows[0].index,ex.minSets,'Warm-up row must still point to its original data index');
assert.equal(groups[2].rows[0].index,0);
const html = renderSetGroups(entry,false);
assert.ok(html.indexOf('data-set-group="warm"') < html.indexOf('data-set-group="work"'));
assert.ok(!html.includes('<select'),'Rows must not ask for their type');
assert.ok(html.includes(`data-set="${ex.minSets}"`));
for (const rir of ['near','some','many','','0','1','2','3+']) {
  assert.equal(normalizeEntry({...entry,rir}).rir,rir,'Backup import must preserve new and legacy ratings');
}
assert.ok(effortLabel('3+').includes('3+'),'Legacy 3+ must not be converted to 4+');
const old = normalizeEntry({exerciseId:ex.id,sets:[{weight:'20',reps:'10'}],rir:'2'});
assert.equal(old.sets[0].kind,'','Old untyped sets must not become working sets');
Object.assign(state.draft,{preset:'push',date,duration:'40',exercises:[entry]});
const received = context.check.decodePlan(context.check.planToken());
assert.equal(received.exercises[0].kinds,entry.sets.map(set=>set.kind==='warm'?'r':'w').join(''),'QR transfer must preserve warm-up and working-set types');
assert.ok(!Object.hasOwn(received.exercises[0],'rir'),'Effort rating must remain personal');

function logs(latest,previous='some') {
  state.workouts = [latest,previous].map((rir,index)=>({
    id:String(index),date,createdAt:`${date}T${index?'10':'11'}:00:00Z`,
    exercises:[{...entry,sets:entry.sets.map(set=>({...set})),rir}]
  }));
}
for (const rir of ['some','many','2','3+']) {
  logs(rir);
  assert.ok(progressSuggestion(ex.id).text.includes(`${formatNumber(20+ex.stepKg)} кг`),'Two successful workouts with reserve should permit an increase');
  assert.equal(makeEntry(ex.id,'Грудной жим').sets[0].weight,'20','Warm-up weight must not prefill a working set');
}
for (const rir of ['near','','0','1']) {
  logs(rir);
  assert.ok(!progressSuggestion(ex.id).text.includes('Можно попробовать'));
}
logs('many');
state.workouts[0].exercises[0].sets[0].reps=String(ex.maxReps-1);
assert.ok(!progressSuggestion(ex.id).text.includes('Можно попробовать'),'Feeling strong alone must not increase weight');
logs('many');
state.workouts[0].exercises[0].discomfort='yes';
assert.ok(progressSuggestion(ex.id).warning);
console.log('Set grouping, legacy ratings, backup import, and weight progression passed.');
