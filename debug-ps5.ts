
async function test() {
    const API_BASE_URL = "http://localhost:3000";
    const API_KEY = process.env.CHATKIT_API_KEY || "test-key";

    const response = await fetch(`${API_BASE_URL}/api/chatkit/agent`, {
        method: 'POST',
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": API_KEY,
        },
        body: JSON.stringify({
            sessionId: `test-debug-${Date.now()}`,
            message: "skateboard",
            history: [],
        }),
    });

    const data = await response.json();
    console.log("RESPONSE_START");
    console.log(data.response);
    console.log("RESPONSE_END");
}

test();
