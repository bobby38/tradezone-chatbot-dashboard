# Gemini CLI Git Integration Guide

## Overview

This setup provides full Git functionality for Gemini CLI, including commit, push, pull, and more. The integration uses a custom Git wrapper script that provides safe, colored output and error handling.

## Quick Start

1. **Start Gemini CLI with Git support:**
   ```bash
   cd /Users/bobbymini/Documents/tradezone-chatbot-dashboard
   gemini --all-files
   ```

2. **Available Git Commands:**
   - `git_status` - Check current git status
   - `git_add` - Add specific files to staging
   - `git_commit` - Commit staged changes
   - `git_push` - Push to remote repository
   - `git_pull` - Pull changes from remote
   - `git_quick_commit` - Add all changes and commit
   - `git_add_commit_push` - Complete workflow in one command
   - `git_log` - Show commit history

## Usage Examples

### Basic Git Workflow

1. **Check current status:**
   ```
   User: git_status
   ```

2. **Add specific files:**
   ```
   User: git_add app/components/NewFeature.tsx lib/utils.ts
   ```

3. **Commit changes:**
   ```
   User: git_commit "feat: add new feature component"
   ```

4. **Push to remote:**
   ```
   User: git_push
   ```

### Quick Workflow (All-in-One)

```
User: git_add_commit_push "app/components/*.tsx lib/utils.ts" "feat: implement new user interface"
```

### Quick Commit All Changes

```
User: git_quick_commit "WIP: latest development changes"
```

## Configuration

The Git integration is configured in `.gemini/config.json`:

- **Model:** gemini-1.5-pro
- **Git Wrapper:** `./.gemini/git-wrapper.sh`
- **Safe Commands:** All git commands are pre-approved
- **Approval Mode:** Default (asks before executing)

## Git Wrapper Features

The custom Git wrapper (`git-wrapper.sh`) provides:

- ✅ **Colored Output** - Easy-to-read status messages
- ✅ **Error Handling** - Graceful error messages and recovery
- ✅ **Safety Checks** - Validates repository state before operations
- ✅ **Auto-stash** - Safely handles uncommitted changes during pull
- ✅ **Branch Detection** - Automatically works with current branch
- ✅ **Remote Validation** - Checks remote existence before push

## Advanced Usage

### Custom Commit Messages

```
User: git_commit "fix: resolve authentication bug

- Updated JWT token validation
- Added error handling for expired tokens
- Improved user feedback messages"
```

### Branch Operations

```
User: git_push origin feature-branch
User: git_pull upstream main
```

### View History

```
User: git_log 20
```

## Troubleshooting

### Common Issues

1. **"Not in a git repository"**
   - Ensure you're in the correct directory
   - Run `git init` if needed

2. **"No staged changes to commit"**
   - Use `git_add` first or try `git_quick_commit`

3. **"Remote does not exist"**
   - Check available remotes with `git remote -v`
   - Specify correct remote: `git_push origin`

### Manual Git Commands

If the wrapper doesn't work, you can always use direct git commands:

```
User: terminal: git status
User: terminal: git add .
User: terminal: git commit -m "Your message"
User: terminal: git push
```

## Best Practices

1. **Always check status** before committing
2. **Use descriptive commit messages** following conventional commits
3. **Pull before pushing** to avoid conflicts
4. **Use quick_commit** for small, frequent saves
5. **Use add_commit_push** for complete workflows

## File Structure

```
.gemini/
├── config.json          # Main configuration
├── git-wrapper.sh       # Git operations script
├── mcp/                 # MCP server configs (if needed)
└── README.md           # This guide
```

## Security

- All Git operations require explicit approval
- The wrapper script includes safety checks
- No automatic pushes without confirmation
- Remote operations are validated before execution

## Support

For issues with the Git integration:

1. Check the wrapper script output for error messages
2. Verify Git repository status manually
3. Ensure remote repository is accessible
4. Check network connectivity for push/pull operations

---

**Happy coding with Gemini CLI + Git! 🚀**