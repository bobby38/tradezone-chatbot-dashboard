/**
 * Storage Filter Tests
 * Tests NVMe/SSD queries to ensure no accessories/cases/games returned
 *
 * Related Commit:
 * - 6d70726: Tighter storage filter to drop accessories in nvme/ssd results
 *
 * User Complaint:
 * - "nvme ssd" query returned 12 products including cases, games, and drives
 *
 * Fix:
 * - Added stricter hasStorageKeyword requirement
 * - Excluded console accessories, games, cases, controllers, etc.
 */

import { test, expect } from "@playwright/test";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

test.describe("Storage Filter Tests - NVMe/SSD Accuracy", () => {
  test("nvme ssd query should only return actual storage devices", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-storage-nvme-${Date.now()}`,
        message: "nvme ssd",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data.response).toBeDefined();
    const responseText = data.response.toLowerCase();

    // Should mention storage products
    const hasStorageKeywords =
      responseText.includes("ssd") ||
      responseText.includes("nvme") ||
      responseText.includes("solid state") ||
      responseText.includes("storage");

    expect(hasStorageKeywords).toBeTruthy();

    // Should NOT mention cases/accessories
    const hasCaseContamination =
      responseText.includes("case") ||
      responseText.includes("bag") ||
      responseText.includes("cover");

    expect(hasCaseContamination).toBeFalsy();

    // Should NOT mention actual game products (ignore image filenames)
    const hasGameContamination =
      responseText.includes("black myth") ||
      responseText.includes("wukong") ||
      responseText.includes("call of duty") ||
      responseText.includes("fifa") ||
      /\bgame\s+(title|bundle|edition)/i.test(responseText);

    expect(hasGameContamination).toBeFalsy();

    // Should NOT mention controllers/accessories
    const hasAccessoryContamination =
      responseText.includes("controller") ||
      responseText.includes("mouse") ||
      responseText.includes("pad") ||
      responseText.includes("fan");

    expect(hasAccessoryContamination).toBeFalsy();

    // Should NOT mention consoles
    const hasConsoleContamination =
      responseText.includes("playstation") ||
      responseText.includes("xbox") ||
      responseText.includes("switch") ||
      responseText.includes("portal") ||
      responseText.includes("ally");

    expect(hasConsoleContamination).toBeFalsy();
  });

  test("ssd query should only return SSDs, not laptops/PCs", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-storage-ssd-${Date.now()}`,
        message: "ssd",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should mention SSDs
    const hasStorageContent =
      responseText.includes("ssd") || responseText.includes("solid state");

    expect(hasStorageContent).toBeTruthy();

    // Should NOT mention laptops/PCs (even if they contain SSDs)
    const hasLaptopContamination =
      responseText.includes("laptop") ||
      responseText.includes("macbook") ||
      responseText.includes("notebook") ||
      responseText.includes("gaming pc") ||
      responseText.includes("desktop");

    expect(hasLaptopContamination).toBeFalsy();
  });

  test("m.2 query should only return M.2 storage devices", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-storage-m2-${Date.now()}`,
        message: "m.2 ssd",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should mention M.2 or NVMe
    const hasM2Content =
      responseText.includes("m.2") ||
      responseText.includes("m2") ||
      responseText.includes("nvme");

    expect(hasM2Content).toBeTruthy();

    // Should NOT mention expansion cards for consoles
    const hasExpansionCardContamination =
      responseText.includes("expansion card") ||
      responseText.includes("seagate game drive");

    expect(hasExpansionCardContamination).toBeFalsy();
  });

  test("storage query should return storage devices, not accessories", async ({
    request,
  }) => {
    const response = await request.post(`${API_BASE_URL}/api/chatkit/agent`, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      data: {
        sessionId: `test-storage-generic-${Date.now()}`,
        message: "storage",
        history: [],
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    const responseText = data.response.toLowerCase();

    // Should mention storage devices (SSD, HDD, NVMe, etc.)
    const hasStorageContent =
      responseText.includes("ssd") ||
      responseText.includes("nvme") ||
      responseText.includes("hard drive") ||
      responseText.includes("hdd") ||
      responseText.includes("storage");

    expect(hasStorageContent).toBeTruthy();

    // Should NOT mention bags/cases/accessories
    const hasBagContamination =
      responseText.includes("bag") ||
      responseText.includes("housing") ||
      responseText.includes("case for") ||
      responseText.includes("storage bag");

    expect(hasBagContamination).toBeFalsy();
  });
});
