const { test, expect } = require("@playwright/test");

test.describe("Dashboard UI Analysis", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:3000/dashboard?bypassAuth=1", {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1200);
  });

  test("Analyze dashboard layout and navigation", async ({ page }) => {
    // Take screenshot of full page
    await page.screenshot({
      path: "dashboard-full-analysis.png",
      fullPage: true,
    });

    // Analyze navigation header
    const nav = await page.locator("nav").first();
    if ((await nav.count()) === 0) {
      console.log("Navigation element not found.");
      return;
    }

    const navHeight = await nav.boundingBox();
    console.log("Navigation height:", navHeight?.height);

    // Check if navigation items are visible
    const navItems = await page.locator("nav a").all();
    console.log("Number of navigation items:", navItems.length);

    for (let i = 0; i < navItems.length; i++) {
      const item = navItems[i];
      const text = await item.textContent();
      const isVisible = await item.isVisible();
      console.log(`Nav item ${i + 1}: "${text}" - Visible: ${isVisible}`);
    }

    // Check notification center
    const notificationCenter = await page
      .locator(
        '[data-testid="notification-center"], .notification-center, button:has(svg[data-testid="bell"])',
      )
      .first();
    if ((await notificationCenter.count()) > 0) {
      console.log("Notification center found");
      await notificationCenter.screenshot({ path: "notification-center.png" });
    }
  });

  test("Test mobile responsiveness", async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X
    await page.screenshot({
      path: "dashboard-mobile.png",
      fullPage: true,
    });

    // Check if mobile menu is present
    const mobileMenuButton = await page
      .locator("div.md\\:hidden button:has(svg)")
      .first();
    if ((await mobileMenuButton.count()) > 0) {
      console.log("Mobile menu button found");
      await mobileMenuButton.click({ force: true });
      await page.screenshot({ path: "dashboard-mobile-menu-open.png" });
    }

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 }); // iPad
    await page.screenshot({
      path: "dashboard-tablet.png",
      fullPage: true,
    });

    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test("Analyze navigation overflow and usability", async ({ page }) => {
    // Check if navigation items overflow
    const nav = await page.locator("nav").first();
    if ((await nav.count()) === 0) {
      console.log("Navigation element not found. Skipping overflow analysis.");
      return;
    }
    const navBox = await nav.boundingBox();

    if (navBox) {
      console.log("Navigation dimensions:", navBox);

      // Check if items are wrapping or overflowing
      const navItems = await page.locator("nav a").all();
      let totalItemWidth = 0;

      for (const item of navItems) {
        const itemBox = await item.boundingBox();
        if (itemBox) {
          totalItemWidth += itemBox.width;
        }
      }

      console.log("Total navigation items width:", totalItemWidth);
      console.log("Available navigation width:", navBox.width);

      if (totalItemWidth > navBox.width * 0.8) {
        console.log("WARNING: Navigation may be too crowded");
      }
    }

    // Test horizontal scroll behavior
    await page.evaluate(() => {
      const nav = document.querySelector("nav");
      if (nav) {
        console.log("Navigation scroll width:", nav.scrollWidth);
        console.log("Navigation client width:", nav.clientWidth);
      }
    });
  });

  test("Check accessibility and interaction", async ({ page }) => {
    // Test keyboard navigation
    await page.keyboard.press("Tab");
    await page.screenshot({ path: "dashboard-keyboard-nav.png" });

    // Test notification center interaction
    const bellIcon = await page
      .locator("svg")
      .filter({ hasText: /bell|notification/i })
      .first();
    if ((await bellIcon.count()) > 0) {
      await bellIcon.click();
      await page.screenshot({ path: "notification-dropdown.png" });
    }

    // Check color contrast and readability
    const headerText = await page.locator("h1, .text-xl").first();
    if ((await headerText.count()) > 0) {
      const styles = await headerText.evaluate((el) => {
        const computed = window.getComputedStyle(el);
        return {
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          fontSize: computed.fontSize,
        };
      });
      console.log("Header styles:", styles);
    }
  });
});
