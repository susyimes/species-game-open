import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {detectLocale,readLocale,setLocale,getLocale,t,tr,LOCALE_KEY,onLocaleChange,preserveLanguageFocus} from '../src/i18n.js';
import {english} from '../src/locales/en.js';
import {messagePatterns} from '../src/locales/patterns.js';
import * as config from '../src/core/config.js';
import {createState} from '../src/core/state.js';
import {serialize} from '../src/core/persistence.js';
import {journeyMarkup} from '../src/ui/journey.js';
import {weatherMarkup,chapterMarkup} from '../src/ui/chapter.js';
import {survivalMarkup,populationManagement} from '../src/ui/survival.js';

const han=/\p{Script=Han}/u;
test('locale detection uses the first browser preference and falls back safely',()=>{
 assert.equal(detectLocale(['en-US','zh-CN']),'en');assert.equal(detectLocale(['zh-TW','en']),'zh-CN');
 assert.equal(detectLocale(['fr-FR','zh-CN']),'zh-CN');assert.equal(detectLocale([]),'en');
 assert.equal(readLocale({getItem:()=> 'zh-CN'},['en-US']),'zh-CN');
 assert.equal(readLocale({getItem:()=> 'unknown'},['en-US']),'en');
 assert.equal(readLocale({getItem(){throw Error('blocked');}},['zh-CN']),'zh-CN');
});
test('explicit choice persists under a game-specific key and works with blocked storage',()=>{
 let record;setLocale('en',{setItem:(key,value)=>record=[key,value]});assert.deepEqual(record,[LOCALE_KEY,'en']);
 let calls=0;const unsubscribe=onLocaleChange(()=>calls++);
 assert.equal(setLocale('zh-CN',{setItem(){throw Error('blocked');}}),true);assert.equal(getLocale(),'zh-CN');
 assert.equal(setLocale('fr'),false);assert.equal(calls,1);unsubscribe();setLocale('en');
});
test('dictionary preserves interpolation and translates core names and old saved notifications at presentation',()=>{
 setLocale('en');assert.equal(t('第 {p0} 代',{p0:7}),'Generation 7');
 assert.equal(tr('采集 · 浆果'),'Gather · Berries');
 assert.equal(tr('生命 17 / 80'),'Health 17 / 80');
 assert.equal(tr('<span>浆果</span>'),'<span>浆果</span>'); // markup has its own localized templates
 for(const [key,value] of Object.entries(english)){
  assert.equal(han.test(value),false,key);assert.deepEqual([...key.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),[...value.matchAll(/\{\w+\}/g)].map(m=>m[0]).sort(),key);
 }
 for(const pattern of messagePatterns)assert.ok(Object.hasOwn(english,pattern),pattern);
});
test('active template accessors have dictionary coverage',()=>{
 const files=['src/main.js','src/view/world.js','src/audio/game-audio.js',...fs.readdirSync('src/ui').filter(f=>f.endsWith('.js')).map(f=>'src/ui/'+f)];
 for(const file of files){const source=fs.readFileSync(file,'utf8');for(const match of source.matchAll(/\b(?:t|msg)\(("(?:[^"\\]|\\.)*")/g)){const key=JSON.parse(match[1]);assert.ok(Object.hasOwn(english,key),file+': '+key);}}
});
test('all creature, biome, evolution, building and job descriptions translate without changing state',()=>{
 setLocale('en');const state=createState();
 function check(value){if(typeof value==='string'&&han.test(value))assert.equal(han.test(tr(value)),false,value);else if(value&&typeof value==='object')Object.values(value).forEach(check);}
 for(const value of [config.SPECIES,config.BIOMES,config.EVOLUTIONS,config.BUILDINGS,config.JOBS,config.APPEARANCES,config.QUESTS])check(value);
 for(const render of [journeyMarkup,weatherMarkup,chapterMarkup,survivalMarkup,populationManagement])assert.equal(han.test(render(state)),false,render.name);
 const snapshot=()=>{const value=JSON.parse(serialize(state));delete value.savedAt;return value;};const before=snapshot();setLocale('zh-CN');assert.equal(t('食物'),'食物');assert.deepEqual(snapshot(),before);setLocale('en');assert.deepEqual(snapshot(),before);
});

test('rebuilding a dialog retains keyboard focus on its replaced native language control',()=>{
 let replaced=false,focused=false;
 const oldControl={matches:selector=>selector==='[data-language-select]'};
 const root={contains:control=>control===oldControl,querySelector:()=>replaced?{focus(){focused=true;}}:oldControl};
 preserveLanguageFocus(root,()=>{replaced=true;},oldControl);assert.equal(focused,true);
 focused=false;preserveLanguageFocus(root,()=>{},null);assert.equal(focused,false);
});
