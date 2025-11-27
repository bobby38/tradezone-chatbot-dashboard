process.env.NEXT_PUBLIC_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-dummy";

async function main() {
  const { lookupPriceFromGrid } = await import(
    "../app/api/chatkit/agent/route"
  );

  type TestCase = {
    query: string;
    intent: "trade_in" | "retail";
    expected: number;
  };

  const cases: TestCase[] = [
    {
      query: "trade-in MSI Claw 1TB",
      intent: "trade_in",
      expected: 300,
    },
    {
      query: "trade-in MSI Claw 8AI+ 2TB",
      intent: "trade_in",
      expected: 1000,
    },
    {
      query: "buy price PS5 Pro 2TB Digital",
      intent: "retail",
      expected: 900,
    },
  ];

  let failures = 0;

  for (const testCase of cases) {
    const result = await lookupPriceFromGrid(testCase.query, testCase.intent);
    if (result.amount !== testCase.expected) {
      failures += 1;
      console.error(
        `❌ ${testCase.query} (${testCase.intent}) expected ${testCase.expected} but got ${result.amount}`,
      );
    } else {
      console.log(
        `✅ ${testCase.query} (${testCase.intent}) = S$${result.amount} (v${result.version || "n/a"})`,
      );
    }
  }

  if (failures > 0) {
    throw new Error(`Trade grid smoke tests failed (${failures}).`);
  }

  console.log("All trade grid smoke tests passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
