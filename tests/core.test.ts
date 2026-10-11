import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KnockDetector, timeOfDay, quietState, nextReaction, greetings, weatherFromCode, selectActivity } from '../packages/core/src/index';
test('local time boundaries and invalid input', () => {
  for (const [hour, expected] of [[0,'night'],[4,'night'],[5,'morning'],[10,'morning'],[11,'day'],[16,'day'],[17,'evening'],[19,'evening'],[20,'night'],[23,'night']] as const) assert.equal(timeOfDay(hour), expected);
  for (const hour of [-1,24,1.5,NaN]) assert.throws(() => timeOfDay(hour), RangeError);
});
test('two taps allow relaxed timing but reject duplicate clicks and expired taps', () => {
  const detector = new KnockDetector();
  assert.equal(detector.tap(0,false),false);
  assert.equal(detector.tap(30,false),false);
  assert.equal(detector.tap(800,false),true);
  assert.equal(detector.tap(900,false),false);
  assert.equal(detector.tap(1900,false),false);
  assert.equal(detector.tap(2600,false),true);
  assert.equal(detector.tap(2700,false),false);
});
test('reset and single tap never leave a pending double tap', () => {
  const detector = new KnockDetector();
  detector.tap(0,false); detector.reset();
  assert.equal(detector.tap(300,false),false);
  assert.equal(detector.tap(400,true),true);
  assert.equal(detector.tap(500,false),false);
});
test('reaction returns to idle and night activities stay quiet', () => {
  assert.equal(nextReaction('TURN'),'WAVE'); assert.equal(nextReaction('WAVE'),'GREETING'); assert.equal(nextReaction('GREETING'),'IDLE');
  for (let i=0;i<20;i++) assert.equal(quietState('night',i),'RESTING');
  assert.equal(quietState('day',1),'TEA'); assert.equal(quietState('day',3),'LOOK_OUTSIDE');
  assert.ok(Object.values(greetings).every(text => text.length > 0));
});

test('season follows local calendar month with validated boundaries', async () => {
  const { seasonOfMonth } = await import('../packages/core/src/index');
  assert.deepEqual(Array.from({length:12},(_,month) => seasonOfMonth(month)), ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter']);
  for (const month of [-1,12,NaN,0.1]) assert.throws(() => seasonOfMonth(month), RangeError);
});

test('weather codes map to calm visual groups and unknown inputs stay unknown',()=>{
  assert.equal(weatherFromCode(0),'sunny');assert.equal(weatherFromCode(3),'cloudy');
  assert.equal(weatherFromCode(61),'rainy');assert.equal(weatherFromCode(75),'snowy');
  assert.equal(weatherFromCode(45),'foggy');assert.equal(weatherFromCode(95),'stormy');
  assert.equal(weatherFromCode(-1),'unknown');
});
test('random activities avoid immediate repeats and walking at night',()=>{
  for(let index=0;index<100;index++){
    const day=selectActivity('day','READING',index/100);
    assert.notEqual(day,'READING');
    const night=selectActivity('night','RESTING',index/100);
    assert.notEqual(night,'RESTING');assert.notEqual(night,'WALKING');
  }
});
