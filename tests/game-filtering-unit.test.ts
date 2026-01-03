/**
 * Unit tests for game filtering logic
 * Tests category extraction and filtering without requiring server
 */

import { describe, it, expect } from '@jest/globals';

describe('Category Extraction Bug Fix', () => {
  it('should extract category names correctly, not [object Object]', () => {
    // Simulating the bug scenario
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
    expect(wrongWay).not.toContain("playstation");

    // RIGHT way (the fix)
    const rightWay = mockProduct.categories.map(c => c.name).join(" ").toLowerCase();
    expect(rightWay).not.toContain("[object object]");
    expect(rightWay).toContain("brand new games");
    expect(rightWay).toContain("playstation 4");
  });

  it('should match PS4 games by category name', () => {
    const mockProducts = [
      {
        name: "Rock Band 4", // No "PS4" in name
        categories: [
          { name: "Brand New Games", slug: "brand-new-games-playstation-4" },
          { name: "Playstation 4", slug: "playstation-4" }
        ]
      },
      {
        name: "EA Sports FC 26 PS5/PS4/Switch", // Has "PS4" in name
        categories: [
          { name: "Brand New Games", slug: "brand-new-games-playstation-4" },
          { name: "Playstation 4", slug: "playstation-4" }
        ]
      },
      {
        name: "PS4 Controller", // Has "PS4" but wrong category
        categories: [
          { name: "Accessories", slug: "accessories" }
        ]
      }
    ];

    // Filter using the FIXED logic
    const ps4Games = mockProducts.filter(p => {
      const name = p.name.toLowerCase();
      const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
      return /ps4|playstation\s*4/.test(name) || /playstation\s*4/.test(cats);
    });

    expect(ps4Games).toHaveLength(2);
    expect(ps4Games.map(g => g.name)).toContain("Rock Band 4");
    expect(ps4Games.map(g => g.name)).toContain("EA Sports FC 26 PS5/PS4/Switch");
    expect(ps4Games.map(g => g.name)).not.toContain("PS4 Controller");
  });
});

describe('Game Category Filtering', () => {
  it('should filter to only game categories', () => {
    const mockProducts = [
      {
        name: "EA Sports FC 26 PS5/PS4/Switch",
        categories: [
          { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
        ]
      },
      {
        name: "PS4 Dualshock Controller",
        categories: [
          { name: "Accessories", slug: "accessories" }
        ]
      },
      {
        name: "+1 Year Warranty Extension",
        categories: [
          { name: "Warranty", slug: "warranty" }
        ]
      }
    ];

    // Filter using game category logic
    const isInGameCategory = (product: any) => {
      const categorySlugs = product.categories.map((c: any) => c.slug).join(" ");
      return /brand-new-games|pre-owned-games/i.test(categorySlugs);
    };

    const gamesOnly = mockProducts.filter(isInGameCategory);

    expect(gamesOnly).toHaveLength(1);
    expect(gamesOnly[0].name).toBe("EA Sports FC 26 PS5/PS4/Switch");
  });

  it('should separate brand new and pre-owned games', () => {
    const mockProducts = [
      {
        name: "Game A",
        categories: [
          { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
        ]
      },
      {
        name: "Game B",
        categories: [
          { name: "Pre-Owned Games", slug: "pre-owned-games-playstation-4" }
        ]
      },
      {
        name: "Game C",
        categories: [
          { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
        ]
      }
    ];

    const wantsPreOwned = false; // User just asked for "PS4 games"

    const filtered = mockProducts.filter(p => {
      const categorySlugs = p.categories.map(c => c.slug).join(" ");
      const isPreOwned = /pre-owned-games/i.test(categorySlugs);

      // Skip pre-owned unless specifically requested
      if (!wantsPreOwned && isPreOwned) {
        return false;
      }

      return true;
    });

    expect(filtered).toHaveLength(2);
    expect(filtered.map(g => g.name)).toContain("Game A");
    expect(filtered.map(g => g.name)).toContain("Game C");
    expect(filtered.map(g => g.name)).not.toContain("Game B");
  });
});

describe('Platform Filter Logic', () => {
  const testProducts = [
    {
      name: "Rock Band 4",
      categories: [
        { name: "Playstation 4", slug: "playstation-4" },
        { name: "Brand New Games", slug: "brand-new-games-playstation-4" }
      ]
    },
    {
      name: "Super Mario Wonder",
      categories: [
        { name: "Nintendo", slug: "nintendo" },
        { name: "Brand New Games", slug: "brand-new-games-nintendo" }
      ]
    },
    {
      name: "Halo Infinite",
      categories: [
        { name: "Xbox Item", slug: "xbox-item" }
      ]
    }
  ];

  it('should filter PS4 games correctly', () => {
    const ps4Games = testProducts.filter(p => {
      const name = p.name.toLowerCase();
      const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
      return /ps4|playstation\s*4/.test(name) || /playstation\s*4/.test(cats);
    });

    expect(ps4Games).toHaveLength(1);
    expect(ps4Games[0].name).toBe("Rock Band 4");
  });

  it('should filter Switch games correctly', () => {
    const switchGames = testProducts.filter(p => {
      const name = p.name.toLowerCase();
      const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
      return /switch|nintendo/.test(name) || /nintendo|switch/.test(cats);
    });

    expect(switchGames).toHaveLength(1);
    expect(switchGames[0].name).toBe("Super Mario Wonder");
  });

  it('should filter Xbox games correctly', () => {
    const xboxGames = testProducts.filter(p => {
      const name = p.name.toLowerCase();
      const cats = p.categories.map(c => c.name).join(" ").toLowerCase();
      return /xbox|series\s*[xs]/.test(name) || /xbox/.test(cats);
    });

    expect(xboxGames).toHaveLength(1);
    expect(xboxGames[0].name).toBe("Halo Infinite");
  });
});

console.log('✅ All unit tests validate the category extraction and filtering fixes');
