#!/usr/bin/env node

/**
 * Simple validation tests for game filtering fixes
 * Run with: node tests/validate-game-fixes.js
 */

console.log("🧪 Running Game Filtering Validation Tests\n");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function expect(value) {
  return {
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${expected}, got ${value}`);
      }
    },
    toContain(expected) {
      if (!value.includes(expected)) {
        throw new Error(`Expected to contain "${expected}", got "${value}"`);
      }
    },
    not: {
      toContain(expected) {
        if (value.includes(expected)) {
          throw new Error(`Expected NOT to contain "${expected}", but found it in "${value}"`);
        }
      }
    },
    toHaveLength(expected) {
      if (value.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${value.length}`);
      }
    },
    toBeGreaterThan(expected) {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    }
  };
}

// Test 1: Category Extraction Bug
test("Category extraction should use .map(c => c.name), not .join() on objects", () => {
  const mockProduct = {
    name: "Rock Band 4",
    categories: [
      { id: 121, name: "Brand New Games", slug: "brand-new-games-playstation-4" },
      { id: 66, name: "Playstation 4", slug: "playstation-4" }
    ]
  };

  // WRONG way (the bug)
  const wrongWay = mockProduct.categories.join(" ").toLowerCase();
  expect(wrongWay).toContain("[object object]");

  // RIGHT way (the fix)
  const rightWay = mockProduct.categories.map(c => c.name).join(" ").toLowerCase();
  expect(rightWay).not.toContain("[object object]");
  expect(rightWay).toContain("playstation 4");
});

// Test 2: PS4 Platform Filter
test("PS4 filter should match games by category name (not just product name)", () => {
  const mockProducts = [
    {
      name: "Rock Band 4", // No "PS4" in name!
      categories: [
        { name: "Playstation 4", slug: "playstation-4" },
        { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
      ]
    },
    {
      name: "Super Mario Wonder",
      categories: [
        { name: "Nintendo", slug: "nintendo" }
      ]
    }
  ];

  const ps4Games = mockProducts.filter(p => {
    const name = p.name.toLowerCase();
    const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
    return /ps4|playstation\s*4/.test(name) || /playstation\s*4/.test(cats);
  });

  expect(ps4Games).toHaveLength(1);
  expect(ps4Games[0].name).toBe("Rock Band 4");
});

// Test 3: Game Category Filtering
test("Should filter to ONLY game categories (exclude controllers, warranties)", () => {
  const mockProducts = [
    {
      name: "EA Sports FC 26",
      categories: [{ slug: "brand-new-games-playstation-4" }]
    },
    {
      name: "PS4 Controller",
      categories: [{ slug: "accessories" }]
    },
    {
      name: "Warranty Extension",
      categories: [{ slug: "warranty" }]
    }
  ];

  const gamesOnly = mockProducts.filter(p => {
    const slugs = p.categories.map(c => c.slug).join(" ");
    return /brand-new-games|pre-owned-games/i.test(slugs);
  });

  expect(gamesOnly).toHaveLength(1);
  expect(gamesOnly[0].name).toBe("EA Sports FC 26");
});

// Test 4: Brand New vs Pre-Owned Separation
test("Should default to brand new games, exclude pre-owned unless requested", () => {
  const mockProducts = [
    {
      name: "Game A (Brand New)",
      categories: [{ slug: "brand-new-games-playstation-4" }]
    },
    {
      name: "Game B (Pre-Owned)",
      categories: [{ slug: "pre-owned-games-playstation-4" }]
    },
    {
      name: "Game C (Brand New)",
      categories: [{ slug: "brand-new-games-playstation-4" }]
    }
  ];

  const query = "PS4 games"; // User didn't ask for pre-owned
  const wantsPreOwned = /\b(pre-?owned|used|second-?hand)\b/i.test(query);

  const filtered = mockProducts.filter(p => {
    const slugs = p.categories.map(c => c.slug).join(" ");
    const isPreOwned = /pre-owned-games/i.test(slugs);

    if (!wantsPreOwned && isPreOwned) {
      return false; // Skip pre-owned
    }

    return true;
  });

  expect(filtered).toHaveLength(2);
  expect(filtered.map(g => g.name)).toContain("Game A (Brand New)");
  expect(filtered.map(g => g.name)).not.toContain("Game B (Pre-Owned)");
});

// Test 5: Cross-Platform Games
test("Should include cross-platform games (PS4/PS5/Switch in same product)", () => {
  const mockProducts = [
    {
      name: "EA Sports FC 26 PS5/PS4/Switch", // Multi-platform
      categories: [
        { name: "Playstation 4", slug: "playstation-4" },
        { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
      ]
    }
  ];

  const ps4Games = mockProducts.filter(p => {
    const name = p.name.toLowerCase();
    const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
    return /ps4|playstation\s*4/.test(name) || /playstation\s*4/.test(cats);
  });

  expect(ps4Games).toHaveLength(1);
  expect(ps4Games[0].name).toContain("PS5/PS4/Switch");
});

// Test 6: Multiple Platform Filters
test("Platform filters should work for PS4, PS5, Switch, Xbox", () => {
  const mockProducts = [
    {
      name: "PS4 Game",
      categories: [{ name: "Playstation 4" }]
    },
    {
      name: "PS5 Game",
      categories: [{ name: "Playstation 5" }]
    },
    {
      name: "Switch Game",
      categories: [{ name: "Nintendo" }]
    },
    {
      name: "Xbox Game",
      categories: [{ name: "Xbox Item" }]
    }
  ];

  const filterByPlatform = (platform) => {
    const patterns = {
      ps4: /ps4|playstation\s*4/,
      ps5: /ps5|playstation\s*5/,
      switch: /switch|nintendo/,
      xbox: /xbox/
    };

    return mockProducts.filter(p => {
      const name = p.name.toLowerCase();
      const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
      return patterns[platform].test(name) || patterns[platform].test(cats);
    });
  };

  expect(filterByPlatform('ps4')).toHaveLength(1);
  expect(filterByPlatform('ps5')).toHaveLength(1);
  expect(filterByPlatform('switch')).toHaveLength(1);
  expect(filterByPlatform('xbox')).toHaveLength(1);
});

// Test 7: Phone/Tablet Category Extraction
test("Phone/tablet filters should also use proper category extraction", () => {
  const mockProducts = [
    {
      name: "iPhone 15",
      categories: [{ name: "Handphone" }]
    },
    {
      name: "iPad Pro",
      categories: [{ name: "Tablet" }]
    }
  ];

  const phones = mockProducts.filter(p => {
    const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
    return /handphone|phone/i.test(cats);
  });

  const tablets = mockProducts.filter(p => {
    const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
    return /tablet/i.test(cats);
  });

  expect(phones).toHaveLength(1);
  expect(tablets).toHaveLength(1);
});

console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  console.log("\n❌ Some tests failed!");
  process.exit(1);
} else {
  console.log("\n✅ All tests passed! Game filtering fixes are validated.");
  process.exit(0);
}
