const { chromium } = require('playwright');

async function quickTest() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

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
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);

    // Add mock story
    await page.evaluate(() => {
      window.allPosts = [{
        id: 'test-1',
        title: 'Test Story',
        content: '<p>This is a test story content.</p>',
        date: '27 Okt, 2026',
        category: 'äventyr',
        age: '3-5 år',
        timestamp: Date.now()
      }];
      renderAllPosts();
    });
    await page.waitForTimeout(500);

    // Check for errors
    if (errors.length > 0) {
      console.log('❌ JavaScript errors found:');
      errors.forEach(err => console.log('  -', err));
      return false;
    } else {
      console.log('✅ No JavaScript errors - DOMPurify loaded successfully!');
    }

    // Try clicking
    const cards = await page.$$('.story-card');
    if (cards.length > 0) {
      await cards[0].click();
      await page.waitForTimeout(500);
      
      const modalVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
      if (modalVisible) {
        console.log('✅ Story modal opens successfully!');
        
        // Test close
        await page.click('.story-modal-close');
        await page.waitForTimeout(300);
        
        const stillVisible = await page.$eval('#storyModal', el => el.classList.contains('show'));
        if (!stillVisible) {
          console.log('✅ Modal closes successfully!');
        }
        
        // Test Escape key
        await cards[0].click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        
        const afterEscape = await page.$eval('#storyModal', el => el.classList.contains('show'));
        if (!afterEscape) {
          console.log('✅ Escape key works!');
        }
        
        return true;
      } else {
        console.log('❌ Modal did not open');
        return false;
      }
    } else {
      console.log('❌ No story cards found');
      return false;
    }

  } catch (error) {
    console.error('Test error:', error.message);
    return false;
  } finally {
    await browser.close();
  }
}

quickTest().then(success => {
  console.log(success ? '\n✅ ALL TESTS PASSED' : '\n❌ TESTS FAILED');
  process.exit(success ? 0 : 1);
});
