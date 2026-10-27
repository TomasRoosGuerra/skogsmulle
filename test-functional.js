const { chromium } = require('playwright');

async function functionalTest() {
  console.log('🧪 Testing story modal functionality...\n');
  
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2500);

    if (errors.length > 0) {
      console.log('❌ Page errors:', errors);
      return false;
    }
    console.log('✅ 1. Page loads without errors');

    const cards = await page.$$('.story-card');
    console.log(`✅ 2. Found ${cards.length} story cards`);
    if (cards.length === 0) return false;

    // Test click
    await cards[0].click();
    await page.waitForTimeout(500);
    let modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!modalVisible) {
      console.log('❌ Modal did not open');
      return false;
    }
    console.log('✅ 3. Modal opens on click');

    // Check hash updated
    const hash = await page.evaluate(() => window.location.hash);
    if (!hash.includes('story-')) {
      console.log('❌ URL hash not updated');
      return false;
    }
    console.log(`✅ 4. URL hash updated: ${hash}`);

    // Test close button
    await page.click('.story-modal-close');
    await page.waitForTimeout(300);
    modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (modalVisible) {
      console.log('❌ Close button failed');
      return false;
    }
    console.log('✅ 5. Close button works');

    // Test Escape key
    await cards[0].click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (modalVisible) {
      console.log('❌ Escape key failed');
      return false;
    }
    console.log('✅ 6. Escape key closes modal');

    // Test keyboard navigation (Enter)
    await cards[0].focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!modalVisible) {
      console.log('❌ Enter key failed');
      return false;
    }
    console.log('✅ 7. Enter key opens modal');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Test Space key
    if (cards.length > 1) {
      await cards[1].focus();
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
      modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
      if (!modalVisible) {
        console.log('❌ Space key failed');
        return false;
      }
      console.log('✅ 8. Space key opens modal');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const mobileCards = await page.$$('.story-card');
    await mobileCards[0].click();
    await page.waitForTimeout(500);
    modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!modalVisible) {
      console.log('❌ Mobile click failed');
      return false;
    }
    console.log('✅ 9. Mobile viewport works');

    // Check accessibility
    const hasTabindex = await mobileCards[0].evaluate(el => el.hasAttribute('tabindex'));
    const hasRole = await mobileCards[0].evaluate(el => el.getAttribute('role') === 'button');
    const hasAriaLabel = await mobileCards[0].evaluate(el => el.hasAttribute('aria-label'));
    
    if (!hasTabindex || !hasRole || !hasAriaLabel) {
      console.log('❌ Missing accessibility attributes');
      return false;
    }
    console.log('✅ 10. Accessibility attributes present');

    console.log('\n═══════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('═══════════════════════════════════');
    return true;

  } catch (error) {
    console.error('❌ Test error:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

functionalTest().then(success => process.exit(success ? 0 : 1));
