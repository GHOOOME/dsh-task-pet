import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPetSettings, validatePatch, safeImage, seedCharacters } from '../lib/settings.js';
import { rejectionFor } from '../lib/settings-routes.js';

async function fixture() {
 const root = await mkdtemp(join(tmpdir(), 'task-pet-settings-'));
 const bundledDir = join(root, 'builtin'), personalDir = join(root, 'personal'), charactersDir = join(root, 'characters');
 for (const dir of [bundledDir, personalDir]) {
  await mkdir(dir, { recursive:true });
  await writeFile(join(dir, 'sprite.png'), 'test image');
  await writeFile(join(dir, 'skin.json'), JSON.stringify({name:dir,states:{idle:{sprite:'sprite.png'}}}));
 }
 return {root,bundledDir,personalDir,charactersDir,file:join(root,'settings.json')};
}
test('first setup preserves the existing personal character; settings persist', async()=>{
 const f=await fixture();let applied=0;
 const svc=await createPetSettings({...f,onApply:()=>{applied++;}});
 assert.equal(svc.get().character,'personal');
 assert.equal((await svc.characters()).length,2);
 await svc.patch({scale:3,muted:true,completionBubbleMs:0});
 assert.equal(applied,1);
 const reread=JSON.parse(await readFile(f.file,'utf8'));
 assert.equal(reread.scale,3);assert.equal(reread.muted,true);
 assert.equal(await svc.skinDir(),f.personalDir);
});
test('bad settings and unknown characters are rejected without modifying saved settings',async()=>{
 const f=await fixture();const svc=await createPetSettings(f);
 for (const value of [{scale:7},{scale:1.5},{muted:'yes'},{character:'../bad'},{completionBubbleMs:-1},{unknown:1}])assert.throws(()=>validatePatch(value));
 await assert.rejects(svc.patch({character:'missing'}));
 assert.equal(svc.get().character,'personal');
});
test('concurrent patches serialize rather than losing fields',async()=>{
 const svc=await createPetSettings(await fixture());
 await Promise.all([svc.patch({scale:4}),svc.patch({muted:true})]);
 assert.equal(svc.get().scale,4);assert.equal(svc.get().muted,true);
});
test('previews reject traversal, absolute paths, and escaping symlinks',async()=>{
 const f=await fixture();const outside=join(f.root,'outside.png');await writeFile(outside,'private');
 await symlink(outside,join(f.bundledDir,'escape.png'));
 assert.equal(await safeImage(f.bundledDir,'../outside.png'),undefined);
 assert.equal(await safeImage(f.bundledDir,outside),undefined);
 assert.equal(await safeImage(f.bundledDir,'escape.png'),undefined);
 assert.equal(await safeImage(f.bundledDir,'sprite.png'),await realpath(join(f.bundledDir,'sprite.png')));
});
test('bundled characters seed once and never overwrite user edits', async()=>{
 const root = await mkdtemp(join(tmpdir(), 'task-pet-seed-'));
 const bundled = join(root,'bundled'), chars = join(root,'characters');
 await mkdir(join(bundled,'guard-01'),{recursive:true});
 await writeFile(join(bundled,'guard-01','sprite.png'),'art');
 await writeFile(join(bundled,'guard-01','skin.json'),JSON.stringify({name:'Guard'}));
 assert.deepEqual(await seedCharacters(bundled,chars),['guard-01']);
 assert.equal(await readFile(join(chars,'guard-01','sprite.png'),'utf8'),'art');
 await writeFile(join(chars,'guard-01','sprite.png'),'user edit');
 assert.deepEqual(await seedCharacters(bundled,chars),[]);
 assert.equal(await readFile(join(chars,'guard-01','sprite.png'),'utf8'),'user edit');
});
test('requests are fenced by connection trust or an equivalent origin check',()=>{
 const trusted={requestRejection:()=>undefined};
 const denied={requestRejection:()=>401};
 assert.equal(rejectionFor(trusted,{headers:{}}),undefined);
 assert.equal(rejectionFor(denied,{headers:{}}),401);
 assert.equal(rejectionFor(undefined,{headers:{'sec-fetch-site':'cross-site'}}),403);
 assert.equal(rejectionFor(undefined,{headers:{origin:'https://evil.example',host:'127.0.0.1:3080'}}),403);
 assert.equal(rejectionFor(undefined,{headers:{origin:'http://127.0.0.1:3080',host:'127.0.0.1:3080'}}),undefined);
 assert.equal(rejectionFor(undefined,{headers:{origin:'dsh-app://app'}}),undefined);
});
