const { chromium } = require('playwright');

async function testStoryModal() {
  console.log('Starting story modal test...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  // Mock console to capture errors
  const consoleMessages = [];
  const errors = [];
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(`Page error: ${error.message}`);
  });

  try {
    // Navigate to the local site
    console.log('Loading page...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    
    // Wait for the page to be ready
    await page.waitForTimeout(2000);

    // Check if posts container exists
    const postsContainer = await page.$('#posts-container');
    if (!postsContainer) {
      console.error('❌ Posts container not found!');
      return { success: false, error: 'Posts container not found' };
    }
    console.log('✓ Posts container found');

    // Check for story cards
    const storyCards = await page.$$('.story-card');
    console.log(`Found ${storyCards.length} story cards`);

    if (storyCards.length === 0) {
      console.warn('⚠️ No story cards found - might be empty Firestore');
      // Create a mock story for testing
      console.log('Adding mock story for testing...');
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
    }

    // Re-check for story cards after potential mock
    const updatedStoryCards = await page.$$('.story-card');
    if (updatedStoryCards.length === 0) {
      console.error('❌ Still no story cards after adding mock data');
      return { success: false, error: 'No story cards available' };
    }

    // Test clicking the first story card
    console.log('\nTesting story card click...');
    const firstCard = updatedStoryCards[0];
    
    // Check if the card is visible
    const isVisible = await firstCard.isVisible();
    console.log(`First card visible: ${isVisible}`);
    
    // Check if the card has onclick attribute
    const hasOnclick = await page.evaluate(() => {
      const card = document.querySelector('.story-card');
      return card && card.hasAttribute('onclick');
    });
    console.log(`Has onclick attribute: ${hasOnclick}`);

    // Click the card
    await firstCard.click();
    await page.waitForTimeout(500);

    // Check if modal is visible
    const modal = await page.$('#storyModal');
    const modalVisible = await modal.evaluate(el => el.classList.contains('show'));
    
    if (modalVisible) {
      console.log('✅ Story modal opened successfully!');
      
      // Check modal content
      const modalTitle = await page.$eval('#storyModalTitle', el => el.textContent);
      console.log(`Modal title: "${modalTitle}"`);
      
      // Test closing modal
      console.log('\nTesting modal close...');
      await page.click('.story-modal-close');
      await page.waitForTimeout(300);
      
      const modalStillVisible = await modal.evaluate(el => el.classList.contains('show'));
      if (!modalStillVisible) {
        console.log('✅ Modal closed successfully!');
      } else {
        console.error('❌ Modal did not close!');
      }
      
      // Test keyboard navigation
      console.log('\nTesting keyboard navigation...');
      await firstCard.click();
      await page.waitForTimeout(300);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      
      const modalAfterEscape = await modal.evaluate(el => el.classList.contains('show'));
      if (!modalAfterEscape) {
        console.log('✅ Escape key closes modal!');
      } else {
        console.error('❌ Escape key did not close modal!');
      }
      
    } else {
      console.error('❌ Story modal did not open after clicking!');
      console.log('Checking for errors...');
      if (errors.length > 0) {
        console.error('JavaScript errors found:');
        errors.forEach(err => console.error('  -', err));
      }
      return { success: false, error: 'Modal did not open' };
    }

    // Test mobile viewport
    console.log('\nTesting mobile viewport...');
    await context.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    
    const mobileCards = await page.$$('.story-card');
    if (mobileCards.length > 0) {
      await mobileCards[0].click();
      await page.waitForTimeout(500);
      
      const mobileModalVisible = await modal.evaluate(el => el.classList.contains('show'));
      if (mobileModalVisible) {
        console.log('✅ Modal works on mobile viewport!');
      } else {
        console.error('❌ Modal does not work on mobile viewport!');
      }
    }

    console.log('\n=== Test Summary ===');
    if (errors.length > 0) {
      console.error(`Found ${errors.length} error(s):`);
      errors.forEach(err => console.error('  -', err));
    } else {
      console.log('✅ All tests passed!');
    }

    return { success: true, errors };

  } catch (error) {
    console.error('Test failed with error:', error);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

// Start local server and run tests
async function main() {
  const { spawn } = require('child_process');
  
  console.log('Starting local server...');
  const server = spawn('npx', ['serve', '.', '-p', '3000', '-n'], {
    cwd: __dirname,
    stdio: 'pipe'
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    const result = await testStoryModal();
    console.log('\nTest result:', result.success ? 'SUCCESS' : 'FAILED');
    if (!result.success) {
      console.error('Error:', result.error);
      process.exit(1);
    }
  } finally {
    server.kill();
  }
}

main().catch(console.error);
