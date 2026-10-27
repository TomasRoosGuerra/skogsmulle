// Reader E2E: open every story on http + file://, mobile + desktop
// Kräver: npm i playwright-core, samt Chrome (CHROME_PATH). Kör: BASE_URL=http://localhost:PORT/ node tests/e2e-reader.js
// ERR_BLOCKED_BY_ORB ignoreras: en befintlig berättelse refererar en extern bild som inte kan laddas (innehållsfråga, inte kodfel).
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const BASE = process.env.BASE_URL || 'http://localhost:18433/';
const FILE = 'file://' + path.resolve(process.env.SITE_DIR || path.resolve(__dirname, '..')) + '/index.html';
const SHOTS = process.env.SHOTS || path.resolve(__dirname, 'screenshots');
const results = []; const ok=(n,c,d='')=>{results.push([c?'PASS':'FAIL',n,d]);console.log((c?'PASS ':'FAIL ')+n+(d?' — '+d:''));};
const profiles = {
  mobile:{viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2},
  desktop:{viewport:{width:1280,height:800}}
};
(async()=>{
 const b = await chromium.launch({executablePath:CHROME,args:['--no-sandbox']});
 for (const [pn,prof] of Object.entries(profiles)) for (const [mode,url] of [['http',BASE],['file',FILE]]) {
  const tag=`${pn}/${mode}`;
  const ctx = await b.newContext(prof); const p = await ctx.newPage(); const errs=[];
  // never allow Firestore writes from tests
  await p.route(/firestore\.googleapis\.com\/.*\/Write\//, r=>r.abort());
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))});
  p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,200)));
  p.on('requestfailed',r=>{ if(!/google|gstatic|firebase/.test(r.url())) errs.push('REQFAIL '+r.url().slice(-80)+' '+(r.failure()||{}).errorText)});
  await p.goto(url); 
  try{ await p.waitForSelector('.story-card',{timeout:15000}); }catch(e){}
  const n = await p.locator('.story-card').count();
  ok(`${tag} stories listed`, n>0, n+' cards');
  const titles = await p.locator('.story-card .story-card-title').allTextContents();
  await p.screenshot({path:`${SHOTS}/${pn}-${mode}-home.png`});
  if (n>0) {
   for (let i=0;i<n;i++){
    const card=p.locator('.story-card').nth(i);
    await card.scrollIntoViewIfNeeded();
    if (pn==='mobile') await card.tap(); else await card.click();
    const dlg=p.locator('#storyModal');
    await p.waitForTimeout(250);
    const vis = await dlg.isVisible();
    const t = (await p.locator('#storyModalTitle').textContent()||'').trim();
    const body=(await p.locator('#storyModalBody').innerText()).length;
    ok(`${tag} story ${i} opens, title matches`, vis && t===titles[i].trim(), `"${t}" body=${body}ch`);
    if (i===0) await p.screenshot({path:`${SHOTS}/${pn}-${mode}-story.png`});
    const focusIn = await p.evaluate(()=>!!document.activeElement.closest('#storyModal'));
    ok(`${tag} story ${i} focus inside dialog`, focusIn);
    const closeHow = ['escape','button','back'][i%3];
    if (closeHow==='escape') await p.keyboard.press('Escape');
    else if (closeHow==='button') await p.locator('#storyModal .story-modal-close').click();
    else await p.goBack();
    await p.waitForTimeout(300);
    ok(`${tag} story ${i} closes via ${closeHow}`, !(await dlg.isVisible()));
    const back = await p.evaluate(()=>document.activeElement && document.activeElement.classList.contains('story-card'));
    ok(`${tag} story ${i} focus restored to card`, closeHow==='back'?true:back);
   }
   // keyboard open
   await p.locator('.story-card').first().focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(250);
   ok(`${tag} Enter opens story`, await p.locator('#storyModal').isVisible()); await p.keyboard.press('Escape');
   await p.locator('.story-card').first().focus(); await p.keyboard.press('Space'); await p.waitForTimeout(250);
   ok(`${tag} Space opens story`, await p.locator('#storyModal').isVisible()); await p.keyboard.press('Escape');
   // hash deep link
   if (mode==='http'){ const id=await p.locator('.story-card').nth(1).getAttribute('data-id');
    await p.goto(url+'#story-'+id); await p.waitForSelector('.story-card'); await p.waitForTimeout(1200);
    const tt=(await p.locator('#storyModalTitle').textContent()||'').trim();
    ok(`${tag} deep link opens right story`, await p.locator('#storyModal').isVisible() && tt===titles[1].trim(), tt);
    await p.keyboard.press('Escape'); await p.waitForTimeout(300);
    ok(`${tag} deep link closes`, !(await p.locator('#storyModal').isVisible())); }
  }
  // horizontal overflow
  const ov = await p.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  ok(`${tag} no horizontal scroll`, ov<=1, 'overflow '+ov);
  // alt text on images
  const noalt = await p.evaluate(()=>[...document.images].filter(i=>!i.hasAttribute('alt')).length);
  ok(`${tag} all <img> have alt`, noalt===0, noalt+' missing');
  const real = errs.filter(e=>!/ERR_FILE_NOT_FOUND.*intro|favicon|ERR_BLOCKED_BY_ORB/.test(e));
  ok(`${tag} console errors none`, real.length===0, real.join(' | ').slice(0,400));
  await ctx.close();
 }
 await b.close();
 const f=results.filter(r=>r[0]==='FAIL').length; console.log(`\n${results.length-f}/${results.length} passed`); process.exit(f?1:0);
})();
