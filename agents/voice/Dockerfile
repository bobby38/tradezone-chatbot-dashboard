FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code and auto-save system
COPY agent.py .
COPY auto_save.py .
COPY test_auto_save.py .

# Copy price grid JSON file (copied to agents/voice directory for Docker build)
COPY trade_in_prices_2025.json ./trade_in_prices_2025.json

# Download required model files for turn detector and VAD
RUN python agent.py download-files

# Run the agent
CMD ["python", "agent.py", "start"]
