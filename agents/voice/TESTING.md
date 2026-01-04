# TradeZone Voice Agent Unit Tests

Automated behavioral tests for the LiveKit voice agent using text inputs.

## Setup

```bash
cd agents/voice

# Install test dependencies
pip install -r requirements-test.txt
```

These tests call the OpenAI API via the LiveKit OpenAI plugin. Set your API key:

```bash
export OPENAI_API_KEY=sk-...
```

## Running Tests

```bash
# Run all LiveKit framework tests
pytest test_livekit_agent.py -v

# Run voice quality tests (short replies, $ currency, filters)
pytest test_livekit_voice_quality.py -v

# Run specific test
pytest test_livekit_agent.py::test_greeting -v

# Run a single voice quality test
pytest test_livekit_voice_quality.py::test_voice_currency_format_uses_dollar_sign -v

# Run with verbose output
LIVEKIT_EVALS_VERBOSE=1 pytest test_livekit_agent.py -s

# Run only sports filter tests
pytest test_livekit_agent.py -k "sports" -v

# Run all tests (including existing ones)
pytest test_*.py -v
```

## Test Coverage

### ✅ Greetings & Basic Interaction
- `test_greeting` - Initial greeting response

### ✅ Product Search
- `test_product_search_ps5` - PS5 console search
- `test_phone_search_affordable` - Affordable phone search
- `test_unknown_product` - Handling unavailable items

### ✅ Sports Filter
- `test_sports_filter_basketball` - Block basketball equipment
- `test_sports_filter_nba_2k` - Allow NBA 2K video games
- `test_racing_games_allowed` - Allow racing video games

### ✅ Trade-In Flow
- `test_tradein_ps5_pricing` - Trade-in price inquiry
- `test_tradein_multi_turn_flow` - Complete 3-step flow

### ✅ Location Validation
- `test_location_singapore_only` - Singapore-only service

## Integration with Voice Agent

To integrate with your actual voice agent:

1. Update the import in `test_voice_agent.py`:
   ```python
   from voice_agent import TradeZoneAgent
   ```

2. Initialize agent in each test:
   ```python
   await session.start(TradeZoneAgent())
   ```

3. Configure API endpoint if needed:
   ```python
   API_ENDPOINT = "https://trade.rezult.co/api/chatkit/agent"
   ```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Run voice agent tests
  run: |
    pip install -r voice-agent/tests/requirements.txt
    pytest voice-agent/tests/test_voice_agent.py -v
```

## Notes

- Tests use GPT-4o-mini for LLM judgments (cost-effective)
- Text-based testing validates behavior without audio pipeline
- For full audio E2E tests, integrate with Hamming or Coval after these pass
