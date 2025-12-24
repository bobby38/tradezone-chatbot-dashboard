#!/usr/bin/env python3
"""
LiveKit Voice Agent Environment Checker
Validates configuration before deployment
"""

import os
import sys
from pathlib import Path


# Colors for terminal output
class Colors:
    GREEN = "\033[92m"
    YELLOW = "\033[93m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"


def check_mark(passed):
    return f"{Colors.GREEN}✓{Colors.END}" if passed else f"{Colors.RED}✗{Colors.END}"


def warning_mark():
    return f"{Colors.YELLOW}⚠{Colors.END}"


def main():
    print(f"\n{Colors.BOLD}{'=' * 50}{Colors.END}")
    print(f"{Colors.BOLD}LiveKit Voice Agent - Environment Validation{Colors.END}")
    print(f"{Colors.BOLD}{'=' * 50}{Colors.END}\n")

    # Load .env.local from project root
    env_file = Path(__file__).parent.parent / ".env.local"
    env_vars = {}

    if env_file.exists():
        print(f"{check_mark(True)} Found .env.local at {env_file}")
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip().strip('"').strip("'")
    else:
        print(f"{check_mark(False)} .env.local not found at {env_file}")
        print(f"   {warning_mark()} Using environment variables only\n")

    # Merge with actual environment (env vars take precedence)
    for key in os.environ:
        env_vars[key] = os.environ[key]

    print(f"\n{Colors.BOLD}1. LiveKit Connection Settings{Colors.END}")
    print("-" * 50)

    # Check LIVEKIT_URL
    livekit_url = env_vars.get("LIVEKIT_URL", "")
    if livekit_url:
        is_self_hosted = "rezult.co" in livekit_url
        is_cloud = "livekit.cloud" in livekit_url

        print(f"{check_mark(bool(livekit_url))} LIVEKIT_URL: {livekit_url}")

        if is_self_hosted:
            print(f"   {Colors.BLUE}→ Self-hosted deployment detected{Colors.END}")
        elif is_cloud:
            print(f"   {Colors.BLUE}→ LiveKit Cloud detected{Colors.END}")
        else:
            print(f"   {warning_mark()} Unknown LiveKit deployment")
    else:
        print(f"{check_mark(False)} LIVEKIT_URL not set")
        print(f"   {Colors.RED}Required for voice agent{Colors.END}")

    # Check API keys
    livekit_api_key = env_vars.get("LIVEKIT_API_KEY", "")
    if livekit_api_key:
        print(f"{check_mark(True)} LIVEKIT_API_KEY: {livekit_api_key[:8]}...")
    else:
        print(f"{check_mark(False)} LIVEKIT_API_KEY not set")

    livekit_api_secret = env_vars.get("LIVEKIT_API_SECRET", "")
    if livekit_api_secret:
        print(f"{check_mark(True)} LIVEKIT_API_SECRET: {'*' * 8}... (hidden)")
    else:
        print(f"{check_mark(False)} LIVEKIT_API_SECRET not set")

    # Check agent name
    agent_name = env_vars.get("LIVEKIT_AGENT_NAME", "amara")
    print(f"{check_mark(True)} LIVEKIT_AGENT_NAME: {agent_name}")

    print(f"\n{Colors.BOLD}2. Voice Stack Configuration{Colors.END}")
    print("-" * 50)

    # Check voice stack
    voice_stack = env_vars.get("VOICE_STACK", "classic").lower()
    print(f"{check_mark(True)} VOICE_STACK: {voice_stack}")

    if voice_stack == "classic":
        print(
            f"   {Colors.BLUE}→ Using AssemblyAI STT + GPT + Cartesia TTS{Colors.END}"
        )

        # Check AssemblyAI key
        assemblyai_key = env_vars.get("ASSEMBLYAI_API_KEY", "")
        if assemblyai_key:
            print(f"{check_mark(True)} ASSEMBLYAI_API_KEY: {assemblyai_key[:8]}...")
        else:
            print(f"{check_mark(False)} ASSEMBLYAI_API_KEY not set")
            print(f"   {Colors.RED}Required for classic voice stack{Colors.END}")
    elif voice_stack == "realtime":
        print(f"   {Colors.BLUE}→ Using OpenAI Realtime API{Colors.END}")

    # Check OpenAI key
    openai_key = env_vars.get("OPENAI_API_KEY", "")
    if openai_key:
        print(f"{check_mark(True)} OPENAI_API_KEY: {openai_key[:8]}...")
    else:
        print(f"{check_mark(False)} OPENAI_API_KEY not set")
        print(f"   {Colors.RED}Required for LLM{Colors.END}")

    print(f"\n{Colors.BOLD}3. Self-Hosted Specific Settings{Colors.END}")
    print("-" * 50)

    # Check noise cancellation setting
    noise_cancel = env_vars.get("VOICE_NOISE_CANCELLATION", "false").lower()
    is_correct = noise_cancel == "false"

    print(f"{check_mark(is_correct)} VOICE_NOISE_CANCELLATION: {noise_cancel}")

    if is_self_hosted and noise_cancel != "false":
        print(
            f"   {Colors.RED}✗ Should be 'false' for self-hosted deployment{Colors.END}"
        )
        print(
            f"   {Colors.RED}  Noise cancellation is a LiveKit Cloud-only feature{Colors.END}"
        )
    elif is_self_hosted:
        print(
            f"   {Colors.GREEN}→ Correct for self-hosted (Cloud-only feature disabled){Colors.END}"
        )
    elif is_cloud and noise_cancel == "true":
        print(
            f"   {Colors.GREEN}→ Noise cancellation enabled (Cloud supports this){Colors.END}"
        )

    print(f"\n{Colors.BOLD}4. ChatKit API Integration{Colors.END}")
    print("-" * 50)

    # Check ChatKit API
    chatkit_api_key = env_vars.get("CHATKIT_API_KEY", "")
    if chatkit_api_key:
        print(f"{check_mark(True)} CHATKIT_API_KEY: {chatkit_api_key[:8]}...")
    else:
        print(f"{check_mark(False)} CHATKIT_API_KEY not set")
        print(f"   {Colors.RED}Required for API authentication{Colors.END}")

    # Check API URL
    api_url = env_vars.get("NEXT_PUBLIC_API_URL") or env_vars.get("API_BASE_URL", "")
    if api_url:
        print(f"{check_mark(True)} NEXT_PUBLIC_API_URL: {api_url}")
    else:
        print(f"{check_mark(False)} NEXT_PUBLIC_API_URL not set")
        print(f"   {Colors.YELLOW}Will default to https://trade.rezult.co{Colors.END}")

    print(f"\n{Colors.BOLD}5. Python Agent Code Check{Colors.END}")
    print("-" * 50)

    # Check if agent.py has conditional noise cancellation
    agent_file = Path(__file__).parent.parent / "agents/voice/agent.py"
    if agent_file.exists():
        with open(agent_file) as f:
            agent_code = f.read()

        has_conditional_import = (
            "VOICE_NOISE_CANCELLATION" in agent_code
            and "if VOICE_NOISE_CANCELLATION:" in agent_code
        )
        has_conditional_usage = (
            "if VOICE_NOISE_CANCELLATION:" in agent_code
            and "audio_input_options" in agent_code
        )

        print(
            f"{check_mark(has_conditional_import)} Conditional noise cancellation import"
        )
        print(
            f"{check_mark(has_conditional_usage)} Conditional noise cancellation usage"
        )

        if not (has_conditional_import and has_conditional_usage):
            print(f"\n   {Colors.RED}✗ Agent code needs updating!{Colors.END}")
            print(
                f"   {Colors.YELLOW}Run: git pull origin feature/livekit-voice-agent{Colors.END}"
            )
    else:
        print(f"{check_mark(False)} agent.py not found at {agent_file}")

    print(f"\n{Colors.BOLD}{'=' * 50}{Colors.END}")
    print(f"{Colors.BOLD}Summary{Colors.END}")
    print(f"{Colors.BOLD}{'=' * 50}{Colors.END}\n")

    # Count issues
    critical_issues = []
    warnings = []

    if not livekit_url:
        critical_issues.append("LIVEKIT_URL not set")
    if not livekit_api_key:
        critical_issues.append("LIVEKIT_API_KEY not set")
    if not livekit_api_secret:
        critical_issues.append("LIVEKIT_API_SECRET not set")
    if voice_stack == "classic" and not assemblyai_key:
        critical_issues.append(
            "ASSEMBLYAI_API_KEY not set (required for classic stack)"
        )
    if not openai_key:
        critical_issues.append("OPENAI_API_KEY not set")
    if not chatkit_api_key:
        critical_issues.append("CHATKIT_API_KEY not set")

    if is_self_hosted and noise_cancel != "false":
        warnings.append("VOICE_NOISE_CANCELLATION should be 'false' for self-hosted")

    if critical_issues:
        print(f"{Colors.RED}✗ {len(critical_issues)} Critical Issue(s):{Colors.END}")
        for issue in critical_issues:
            print(f"  • {issue}")
        print()

    if warnings:
        print(f"{Colors.YELLOW}⚠ {len(warnings)} Warning(s):{Colors.END}")
        for warning in warnings:
            print(f"  • {warning}")
        print()

    if not critical_issues and not warnings:
        print(f"{Colors.GREEN}✓ All configuration checks passed!{Colors.END}\n")
        print("Ready to deploy voice agent.\n")
        return 0
    elif critical_issues:
        print(
            f"{Colors.RED}Cannot deploy until critical issues are resolved.{Colors.END}\n"
        )
        return 1
    else:
        print(
            f"{Colors.YELLOW}Configuration has warnings but can proceed.{Colors.END}\n"
        )
        return 0

        return 0

if __name__ == "__main__":
    sys.exit(main())
