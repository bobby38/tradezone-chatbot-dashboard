-- Sample chat logs data for testing the dashboard
-- Run this in your Supabase SQL Editor

-- First, make sure the chat_logs table exists
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  response TEXT NOT NULL,
  status TEXT DEFAULT 'success',
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert sample chat logs
INSERT INTO chat_logs (user_id, prompt, response, status, timestamp, created_at) VALUES
-- Session 1: Long conversation
('session-001', 'What is the best GPU for gaming in 2025?', 'For gaming in 2025, the top GPUs include the RTX 5090, RTX 5080, and AMD RX 8800 XT. The RTX 5090 offers the best performance but at a premium price point.', 'success', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
('session-001', 'How much does the RTX 5090 cost?', 'The RTX 5090 typically retails for around $1,999-$2,199 USD, depending on the manufacturer and specific model. Prices may vary based on availability and market conditions.', 'success', NOW() - INTERVAL '2 hours' + INTERVAL '2 minutes', NOW() - INTERVAL '2 hours' + INTERVAL '2 minutes'),
('session-001', 'Is it worth upgrading from RTX 4080?', 'Upgrading from RTX 4080 to RTX 5090 offers about 25-30% performance improvement. If you game at 4K or use ray tracing heavily, it could be worth it. For 1440p gaming, the 4080 is still excellent.', 'success', NOW() - INTERVAL '2 hours' + INTERVAL '5 minutes', NOW() - INTERVAL '2 hours' + INTERVAL '5 minutes'),

-- Session 2: Trading questions
('session-002', 'How do I start trading stocks?', 'To start trading stocks: 1) Open a brokerage account, 2) Fund your account, 3) Research stocks, 4) Start with small positions, 5) Learn about risk management. Consider starting with ETFs for diversification.', 'success', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'),
('session-002', 'What are the best trading apps?', 'Popular trading apps include: Robinhood (commission-free), E*TRADE (research tools), TD Ameritrade (education), Fidelity (no fees), and Interactive Brokers (advanced features). Choose based on your needs and experience level.', 'success', NOW() - INTERVAL '1 hour' + INTERVAL '3 minutes', NOW() - INTERVAL '1 hour' + INTERVAL '3 minutes'),

-- Session 3: AI questions
('session-003', 'What is artificial intelligence?', 'Artificial Intelligence (AI) is technology that enables machines to simulate human intelligence, including learning, reasoning, and problem-solving. It includes machine learning, deep learning, and neural networks.', 'success', NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes'),

-- Session 4: Short conversation
('session-004', 'Hello, can you help me?', 'Hello! I''d be happy to help you. What can I assist you with today?', 'success', NOW() - INTERVAL '15 minutes', NOW() - INTERVAL '15 minutes'),

-- Session 5: Error example
('session-005', 'What is the meaning of life?', 'I apologize, but I encountered an error processing your request. Please try again or rephrase your question.', 'error', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '5 minutes'),

-- More recent conversations
('bc99d64b-cc18-4f03-b7ea-16a856b7b4c4', 'What are the latest crypto trends?', 'Current crypto trends include: DeFi 2.0, NFT utility expansion, Layer 2 scaling solutions, and institutional adoption. Bitcoin and Ethereum remain dominant, while newer chains focus on specific use cases.', 'success', NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes'),
('bc99d64b-cc18-4f03-b7ea-16a856b7b4c4', 'Should I invest in crypto now?', 'Crypto investment carries high risk and volatility. Only invest what you can afford to lose, do thorough research, consider dollar-cost averaging, and diversify your portfolio. Consult a financial advisor for personalized advice.', 'success', NOW() - INTERVAL '8 minutes', NOW() - INTERVAL '8 minutes');
