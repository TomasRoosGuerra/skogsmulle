const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function captureScreenshots() {
  console.log('📸 Capturing screenshots for verification...\n');
  
  const screenshotDir = '/tmp/screenshots';
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  
  try {
    // Desktop screenshots
    console.log('Taking desktop screenshots...');
    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await desktopPage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(2000);
    
    // Homepage with story cards
    await desktopPage.screenshot({ path: path.join(screenshotDir, '01-desktop-homepage.png'), fullPage: true });
    console.log('✓ Saved: 01-desktop-homepage.png');
    
    // Click first story
    const cards = await desktopPage.$$('.story-card');
    if (cards.length > 0) {
      // Highlight the card we're about to click
      await cards[0].evaluate(el => el.style.outline = '3px solid red');
      await desktopPage.screenshot({ path: path.join(screenshotDir, '02-desktop-story-card-focused.png') });
      console.log('✓ Saved: 02-desktop-story-card-focused.png');
      
      await cards[0].click();
      await desktopPage.waitForTimeout(500);
      
      // Modal open
      await desktopPage.screenshot({ path: path.join(screenshotDir, '03-desktop-modal-open.png') });
      console.log('✓ Saved: 03-desktop-modal-open.png');
      
      // Show URL with hash
      const hash = await desktopPage.evaluate(() => window.location.hash);
      console.log(`  URL hash: ${hash}`);
    }
    
    await desktopPage.close();
    
    // Mobile screenshots
    console.log('\nTaking mobile screenshots...');
    const mobilePage = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await mobilePage.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(2000);
    
    // Mobile homepage
    await mobilePage.screenshot({ path: path.join(screenshotDir, '04-mobile-homepage.png'), fullPage: true });
    console.log('✓ Saved: 04-mobile-homepage.png');
    
    // Mobile story card
    const mobileCards = await mobilePage.$$('.story-card');
    if (mobileCards.length > 0) {
      // Show touch target size
      await mobileCards[0].evaluate(el => {
        el.style.outline = '2px solid blue';
        const rect = el.getBoundingClientRect();
        const badge = document.createElement('div');
        badge.style.cssText = `
          position: fixed;
          top: ${rect.top}px;
          right: 10px;
          background: blue;
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          z-index: 9999;
        `;
        badge.textContent = `${Math.round(rect.height)}px height`;
        document.body.appendChild(badge);
      });
      await mobilePage.screenshot({ path: path.join(screenshotDir, '05-mobile-story-card-size.png') });
      console.log('✓ Saved: 05-mobile-story-card-size.png');
      
      await mobileCards[0].click();
      await mobilePage.waitForTimeout(500);
      
      // Mobile modal
      await mobilePage.screenshot({ path: path.join(screenshotDir, '06-mobile-modal-open.png'), fullPage: true });
      console.log('✓ Saved: 06-mobile-modal-open.png');
    }
    
    await mobilePage.close();
    
    console.log('\n✅ All screenshots saved to /tmp/screenshots/');
    console.log('Copy them to the workspace for the PR:');
    console.log('  cp /tmp/screenshots/* /workspace/');
    
    return true;
  } catch (error) {
    console.error('❌ Screenshot capture failed:', error);
    return false;
  } finally {
    await browser.close();
  }
}

captureScreenshots().then(success => {
  if (success) {
    const fs = require('fs');
    const files = fs.readdirSync('/tmp/screenshots');
    console.log(`\n📁 Generated ${files.length} screenshots`);
  }
  process.exit(success ? 0 : 1);
});
