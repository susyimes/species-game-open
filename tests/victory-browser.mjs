import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const raw=await fs.readFile('artifacts/longplay/continued/final-state.json','utf8');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});
  await page.goto('http://127.0.0.1:5196');await page.waitForFunction(()=>!!window.__game);await page.locator('#start-button').click();
  await Promise.all([page.waitForEvent('load'),page.evaluate(raw=>window.__game.callbacks.importSave(new File([raw],'victory.json')),raw)]);
  await page.waitForFunction(()=>!!window.__game);await page.waitForFunction(()=>window.__game.state.chapter.status==='won');
  await fs.mkdir('artifacts/victory',{recursive:true});await page.screenshot({path:'artifacts/victory/chapter-won.png'});
  const before=await page.evaluate(()=>({id:window.__game.state.chapter.victory.id,count:window.__game.state.chapterEvidence.filter(e=>e.type==='ChapterWon').length}));
  await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await page.waitForFunction(()=>!!window.__game);
  const after=await page.evaluate(()=>({id:window.__game.state.chapter.victory.id,count:window.__game.state.chapterEvidence.filter(e=>e.type==='ChapterWon').length}));
  assert.deepEqual(before,after);assert.equal(after.count,1);
  await fs.writeFile('artifacts/victory/report.json',JSON.stringify({passed:true,...after},null,2));console.log(JSON.stringify({passed:true,...after}));
}finally{await browser.close();}
