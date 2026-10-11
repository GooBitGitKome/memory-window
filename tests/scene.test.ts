import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WindowScene } from '../apps/web/src/scenes/WindowScene';
import { formatWallClock } from '../apps/web/src/scenes/WallClock';
test('scene renders independent room and character images for every state and time', () => {
  for (const state of ['IDLE','TEA','LOOK_OUTSIDE','TURN','WAVE','GREETING','LISTENING','SPEAKING','RESTING','READING','WALKING','SITTING'] as const) {
    for (const time of ['morning','day','evening','night'] as const) {
      const output = renderToStaticMarkup(createElement(WindowScene, {state,time}));
      assert.match(output,/role="img"/); assert.match(output,/aria-label="/);
      assert.match(output,new RegExp(`state-${state.toLowerCase()}`));
      assert.match(output,/\/art\/room\.png/);
      assert.match(output,/\/art\/character-v2-/);
      assert.match(output,/\/art\/weather-/);
      assert.match(output,/mask="url\(#room-glass-mask\)"/);
      assert.doesNotMatch(output, /NaN|undefined|https?:\/\//);
    }
  }
});
test('wall clock formats local date and time across midnight', () => {
  assert.deepEqual(formatWallClock(new Date(2026, 9, 11, 23, 59)), {
    dateText: '2026年10月11日（日）', dateValue: '2026-10-11', timeText: '23:59',
  });
  assert.deepEqual(formatWallClock(new Date(2026, 9, 12, 0, 0)), {
    dateText: '2026年10月12日（月）', dateValue: '2026-10-12', timeText: '00:00',
  });
});
