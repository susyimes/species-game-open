import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {AUDIO_IDS} from '../src/audio/settings.js';

test('every runtime cue ships both browser codecs with matching provenance and bounded decoded duration',()=>{
  const root=new URL('../public/audio/',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('manifest.json',root)));
  assert.deepEqual(manifest.files.map(f=>f.id).sort(),[...AUDIO_IDS].sort());let bytes=0;
  for(const entry of manifest.files){
    assert.ok(entry.duration>0&&entry.duration<(entry.role==='music'?70:11));
    if(entry.role==='music')assert.ok(entry.duration>30);
    if(entry.loop)assert.ok(entry.seam_delta<.06,`${entry.id}: discontinuous loop`);
    assert.ok(Number.isInteger(entry.seed));assert.ok(entry.prompt.length>30);
    for(const format of ['ogg','mp3']){
      const data=fs.readFileSync(new URL(`${entry.id}.${format}`,root));bytes+=data.length;
      assert.equal(createHash('sha256').update(data).digest('hex'),entry.files[format].sha256);
      assert.equal(data.length,entry.files[format].bytes);assert.ok(entry.files[format].peak_dbfs<-.5);
      assert.ok(Math.abs(entry.files[format].duration-entry.duration)<.04,`${entry.id}: codec padding changed loop duration`);
      if(format==='ogg')assert.equal(data.subarray(0,4).toString(),'OggS');
    }
  }
  assert.ok(bytes<5000000,`${bytes} audio bytes`);
  assert.ok(!fs.readdirSync(root).some(n=>n.endsWith('.wav')),'raw masters do not ship to the browser');
});
