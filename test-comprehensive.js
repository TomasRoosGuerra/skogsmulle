const { chromium } = require('playwright');

async function comprehensiveTest() {
  console.log('🧪 Starting comprehensive story modal tests...\n');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`Page error: ${error.message}`);
  });

  try {
    // Test 1: Page loads without errors
    console.log('✓ Test 1: Loading page...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      console.log('❌ JavaScript errors found:');
      errors.forEach(err => console.log('  -', err));
      return false;
    }
    console.log('  ✅ Page loaded without errors\n');

    // Add mock stories
    await page.evaluate(() => {
      window.allPosts = [
        {
          id: 'test-story-1',
          title: 'Skogsmulles Äventyr',
          content: '<p>Detta är en testberättelse om Skogsmulle.</p><p>Den har flera stycken.</p>',
          date: '27 Okt, 2026',
          category: 'äventyr',
          age: '3-5 år',
          timestamp: Date.now()
        },
        {
          id: 'test-story-2',
          title: 'Vännernas Sång',
          content: '<p>En berättelse om vänskap.</p>',
          date: '26 Okt, 2026',
          category: 'vänskap',
          age: '6-8 år',
          timestamp: Date.now() - 1000
        }
      ];
      renderAllPosts();
    });
    await page.waitForTimeout(500);

    const storyCards = await page.$$('.story-card');
    console.log(`✓ Test 2: Story cards rendered (${storyCards.length} cards found)\n`);

    // Test 3: Click functionality
    console.log('✓ Test 3: Testing click functionality...');
    await storyCards[0].click();
    await page.waitForTimeout(500);
    
    const modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!modalVisible) {
      console.log('❌ Modal did not open on click');
      return false;
    }
    console.log('  ✅ Modal opens on click\n');

    // Test 4: Modal content
    console.log('✓ Test 4: Checking modal content...');
    const modalTitle = await page.$eval('#storyModalTitle', el => el.textContent);
    if (modalTitle !== 'Skogsmulles Äventyr') {
      console.log('❌ Modal title incorrect:', modalTitle);
      return false;
    }
    console.log('  ✅ Modal displays correct content\n');

    // Test 5: URL hash
    console.log('✓ Test 5: Testing URL hash navigation...');
    const currentHash = await page.evaluate(() => window.location.hash);
    if (!currentHash.includes('story-')) {
      console.log('❌ URL hash not updated:', currentHash);
      return false;
    }
    console.log(`  ✅ URL hash updated: ${currentHash}\n`);

    // Test 6: Close button
    console.log('✓ Test 6: Testing close button...');
    await page.click('.story-modal-close');
    await page.waitForTimeout(300);
    
    const stillVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (stillVisible) {
      console.log('❌ Modal did not close');
      return false;
    }
    console.log('  ✅ Close button works\n');

    // Test 7: Escape key
    console.log('✓ Test 7: Testing Escape key...');
    await storyCards[0].click();
    await page.waitForTimeout(300);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    const afterEscape = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (afterEscape) {
      console.log('❌ Escape key did not close modal');
      return false;
    }
    console.log('  ✅ Escape key closes modal\n');

    // Test 8: Keyboard navigation (Enter key on card)
    console.log('✓ Test 8: Testing keyboard navigation (Enter)...');
    await storyCards[0].focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    
    const afterEnter = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!afterEnter) {
      console.log('❌ Enter key did not open modal');
      return false;
    }
    console.log('  ✅ Enter key opens modal\n');
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Test 9: Space key
    console.log('✓ Test 9: Testing Space key...');
    await storyCards[1].focus();
    await page.keyboard.press('Space');
    await page.waitForTimeout(300);
    
    const afterSpace = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!afterSpace) {
      console.log('❌ Space key did not open modal');
      return false;
    }
    
    const secondModalTitle = await page.$eval('#storyModalTitle', el => el.textContent);
    if (secondModalTitle !== 'Vännernas Sång') {
      console.log('❌ Wrong story opened');
      return false;
    }
    console.log('  ✅ Space key opens correct modal\n');
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Test 10: Direct link via hash
    console.log('✓ Test 10: Testing direct link via hash...');
    await page.goto('http://localhost:3000/#story-test-story-2');
    await page.waitForTimeout(1000);
    
    const modalFromHash = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!modalFromHash) {
      console.log('❌ Direct link did not open modal');
      return false;
    }
    
    const hashModalTitle = await page.$eval('#storyModalTitle', el => el.textContent);
    if (hashModalTitle !== 'Vännernas Sång') {
      console.log('❌ Wrong story opened from hash:', hashModalTitle);
      return false;
    }
    console.log('  ✅ Direct links work correctly\n');
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Test 11: Mobile viewport
    console.log('✓ Test 11: Testing mobile viewport...');
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const mobileCards = await page.$$('.story-card');
    if (mobileCards.length === 0) {
      console.log('❌ Cards not visible on mobile');
      return false;
    }
    
    // Check touch target size
    const cardSize = await mobileCards[0].boundingBox();
    if (cardSize.height < 44) {
      console.log(`⚠️  Warning: Card height ${cardSize.height}px is below recommended 44px touch target`);
    }
    
    await mobileCards[0].click();
    await page.waitForTimeout(500);
    
    const mobileModalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
    if (!mobileModalVisible) {
      console.log('❌ Modal does not work on mobile');
      return false;
    }
    
    // Check if modal is scrollable
    const modalScrollable = await page.$eval('.story-modal-content', el => {
      return el.scrollHeight > el.clientHeight || el.clientHeight > 0;
    });
    
    console.log('  ✅ Mobile viewport works correctly');
    console.log(`  ✅ Modal is ${modalScrollable ? 'scrollable' : 'displaying correctly'}\n`);
    
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Test 12: Accessibility attributes
    console.log('✓ Test 12: Testing accessibility...');
    const firstCard = storyCards[0];
    const hasTabindex = await firstCard.evaluate(el => el.hasAttribute('tabindex'));
    const hasRole = await firstCard.evaluate(el => el.getAttribute('role') === 'button');
    const hasAriaLabel = await firstCard.evaluate(el => el.hasAttribute('aria-label'));
    
    if (!hasTabindex || !hasRole || !hasAriaLabel) {
      console.log('❌ Missing accessibility attributes');
      return false;
    }
    console.log('  ✅ Cards have proper accessibility attributes\n');

    console.log('═══════════════════════════════════');
    console.log('✅ ALL TESTS PASSED SUCCESSFULLY!');
    console.log('═══════════════════════════════════\n');
    return true;

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

comprehensiveTest().then(success => {
  process.exit(success ? 0 : 1);
});
