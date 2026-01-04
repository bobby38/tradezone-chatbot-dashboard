// Quick test to verify sports filter regex
const testCases = [
  { query: "car games", shouldMatch: true },
  { query: "car game", shouldMatch: true },
  { query: "racing games", shouldMatch: true },
  { query: "racing game", shouldMatch: true },
  { query: "basketball", shouldMatch: true },
  { query: "NBA games", shouldMatch: true },
  { query: "dance games", shouldMatch: false },
];

const SPORT_TOKEN_MAP = [
  {
    regex: /basketball|nba|2k|curry|jordan|lebron|durant/i,
    tokens: ["nba", "2k", "basketball"],
  },
  {
    regex: /football|soccer|fifa|fc ?24|ea sports fc|messi|ronaldo/i,
    tokens: ["fifa", "fc", "football"],
  },
  {
    regex: /wrestling|wwe|wwf|undertaker|cena/i,
    tokens: ["wwe", "wrestling", "2k"],
  },
  {
    regex: /skateboard|skate|tony hawk/i,
    tokens: ["skate", "tony hawk", "skateboard"],
  },
  {
    regex: /\bcar\s+games?|\bracing\s+games?|\bgran turismo|forza|need\s+for\s+speed|nfs|burnout|mario\s+kart/i,
    tokens: ["racing", "car", "turismo", "forza", "kart", "speed"],
  },
];

console.log("Testing sports filter regex:\n");

testCases.forEach(({ query, shouldMatch }) => {
  const sportFilters = [];
  SPORT_TOKEN_MAP.forEach(({ regex, tokens }) => {
    if (regex.test(query)) {
      sportFilters.push(...tokens);
    }
  });
  
  const matched = sportFilters.length > 0;
  const status = matched === shouldMatch ? "✅" : "❌";
  console.log(`${status} "${query}" - Matched: ${matched}, Expected: ${shouldMatch}, Filters: [${sportFilters.join(", ")}]`);
});
