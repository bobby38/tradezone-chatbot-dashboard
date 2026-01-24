
async function test() {
    const API_BASE_URL = "http://localhost:3000";
    const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

    const response = await fetch(`${API_BASE_URL}/api/chatkit/agent`, {
        // Simulate a search request for "fishing game"
        const MOCK_QUERY = 'I want to know if you got the fishing game';

        // Only imports needed
        import { handleVectorSearch } from './lib/tools/vectorSearch';
        import { enhanceSearchQuery } from './lib/graphiti-search-enhancer';

        async function run() {
        console.log('--- START DEBUG ---');
        console.log('Query:', MOCK_QUERY);

        // 1. Test enhancer directly
        const enhancement = await enhanceSearchQuery(MOCK_QUERY);
        console.log('\n[Enhancement]:', enhancement);

        if(enhancement.enhancedQuery.includes('Bass Pro Shops')) {
            console.log('✅ Synonym applied correctly!');
} else {
    console.log('❌ Synonym NOT applied.');
}

// 2. Test full vector search
try {
    const context = { intent: 'product', toolUsed: 'searchProducts' };
    const result = await handleVectorSearch(MOCK_QUERY, context);

    console.log('\n[Vector Search Result]:');
    console.log(result.text);

    if (result.wooProducts && result.wooProducts.length > 0) {
        console.log(`\nFound ${result.wooProducts.length} products.`);
        result.wooProducts.forEach(p => console.log(`- ${p.name} ($${p.price_sgd})`));

        const found = result.wooProducts.some(p => p.name.toLowerCase().includes('bass pro'));
        if (found) {
            console.log('\n✅ SUCCESS: Found "Bass Pro Shops" game in results.');
        } else {
            console.log('\n❌ FAIL: "Bass Pro Shops" game MISSING from results.');
        }
    } else {
        console.log('\n❌ FAIL: No products returned.');
    }

} catch (error) {
    console.error('Error during search:', error);
}
}

run();
