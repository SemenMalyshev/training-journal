// Run with: node check-duration.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const context = vm.createContext({
  window: {}, localStorage: {getItem: () => null},
  TextEncoder, TextDecoder, atob, btoa
});
vm.runInContext(fs.readFileSync(path.join(__dirname,'exercises.js'),'utf8'),context);
const source = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
assert.equal((source.match(/^\s*initialize\(\);/gm) || []).length,1);
vm.runInContext(source.replace(/^\s*initialize\(\);/m,
  '    globalThis.check = {plannedSlots,normalizeWorkout,decodePlan};'),context);
const {plannedSlots,normalizeWorkout,decodePlan} = context.check;

for (const preset of ['push','pull','legs']) {
  assert.equal(plannedSlots(preset,10).length,1,'10 minutes must not produce a full plan');
  assert.equal(plannedSlots(preset,20).length,2);
  assert.equal(plannedSlots(preset,30).length,3);
  assert.equal(plannedSlots(preset,40).length,4);
  assert.equal(plannedSlots(preset,10)[0].slot,'Пресс');
}
assert.equal(plannedSlots('push',40)[0].slot,'Грудной жим');
assert.equal(plannedSlots('pull',40)[0].slot,'Вертикальная тяга');
assert.equal(plannedSlots('push','').length,6,'Unspecified time retains the full template');

const token = minutes => Buffer.from(JSON.stringify(
  [1,'push','2026-10-02',minutes,[[17,5,'ww']]]
)).toString('base64url');
assert.equal(decodePlan(token(10)).duration,10,'Short plans must survive QR transfer');
const workout = {id:'check',date:'2026-10-02',duration:'10',exercises:[]};
assert.equal(normalizeWorkout(workout).duration,'10','Short workouts must survive backup import');
for (const minutes of [9,10.5,241]) {
  assert.throws(() => decodePlan(token(minutes)));
  assert.throws(() => normalizeWorkout({...workout,duration:String(minutes)}));
}
console.log('Duration planning, QR transfer, and backup validation passed.');
