#!/bin/bash

# Git Wrapper Script for Gemini CLI
# This script provides safe git operations with proper error handling

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[GIT-WRAPPER]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if we're in a git repository
check_git_repo() {
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not in a git repository"
        exit 1
    fi
}

# Function to get current branch
get_current_branch() {
    git branch --show-current
}

# Function to check if there are uncommitted changes
has_uncommitted_changes() {
    ! git diff --quiet || ! git diff --cached --quiet
}

# Main command handler
case "$1" in
    "status")
        check_git_repo
        print_status "Git Status"
        git status --porcelain
        ;;

    "add")
        check_git_repo
        if [ -z "$2" ]; then
            print_error "Please specify files to add"
            echo "Usage: $0 add <file1> [file2] ..."
            exit 1
        fi
        print_status "Adding files: ${@:2}"
        git add "${@:2}"
        print_success "Files added successfully"
        ;;

    "commit")
        check_git_repo
        if [ -z "$2" ]; then
            print_error "Please provide a commit message"
            echo "Usage: $0 commit \"Your commit message\""
            exit 1
        fi

        # Check if there are staged changes
        if git diff --cached --quiet; then
            print_warning "No staged changes to commit"
            print_status "Current status:"
            git status --porcelain
            exit 1
        fi

        print_status "Committing with message: $2"
        git commit -m "$2"
        print_success "Changes committed successfully"
        ;;

    "push")
        check_git_repo
        local branch=$(get_current_branch)
        local remote=${2:-origin}

        print_status "Pushing to $remote/$branch"

        # Check if remote exists
        if ! git remote get-url "$remote" > /dev/null 2>&1; then
            print_error "Remote '$remote' does not exist"
            print_status "Available remotes:"
            git remote -v
            exit 1
        fi

        # Check if branch exists on remote
        if ! git ls-remote --exit-code "$remote" "$branch" > /dev/null 2>&1; then
            print_warning "Branch '$branch' does not exist on remote '$remote'"
            print_status "Setting upstream and pushing..."
            git push -u "$remote" "$branch"
        else
            git push "$remote" "$branch"
        fi

        print_success "Pushed successfully to $remote/$branch"
        ;;

    "pull")
        check_git_repo
        local branch=$(get_current_branch)
        local remote=${2:-origin}

        # Check for uncommitted changes
        if has_uncommitted_changes; then
            print_warning "You have uncommitted changes"
            print_status "Stashing changes before pull..."
            git stash push -m "Auto-stash before pull"
        fi

        print_status "Pulling from $remote/$branch"
        git pull "$remote" "$branch"

        # Restore stashed changes if any
        if git stash list | grep -q "Auto-stash before pull"; then
            print_status "Restoring stashed changes..."
            git stash pop
        fi

        print_success "Pull completed successfully"
        ;;

    "add-commit-push")
        check_git_repo
        if [ -z "$2" ] || [ -z "$3" ]; then
            print_error "Please provide files and commit message"
            echo "Usage: $0 add-commit-push \"file1 file2\" \"Your commit message\""
            exit 1
        fi

        files=($2)
        message="$3"

        print_status "Starting add-commit-push workflow..."

        # Add files
        print_status "Adding files: ${files[*]}"
        git add "${files[@]}"

        # Commit
        print_status "Committing with message: $message"
        git commit -m "$message"

        # Push
        local branch=$(get_current_branch)
        local remote="origin"
        print_status "Pushing to $remote/$branch"
        git push "$remote" "$branch"

        print_success "add-commit-push workflow completed successfully"
        ;;

    "log")
        check_git_repo
        local limit=${2:-10}
        print_status "Showing last $limit commits"
        git log --oneline -n "$limit"
        ;;

    "branch")
        check_git_repo
        print_status "Current branch info:"
        echo "Current branch: $(get_current_branch)"
        echo "All branches:"
        git branch -a
        ;;

    "quick-commit")
        check_git_repo
        if [ -z "$2" ]; then
            print_error "Please provide a commit message"
            echo "Usage: $0 quick-commit \"Your commit message\""
            exit 1
        fi

        print_status "Quick commit workflow..."

        # Add all modified files
        print_status "Adding all modified files..."
        git add -A

        # Commit
        print_status "Committing with message: $2"
        git commit -m "$2"

        print_success "Quick commit completed"
        ;;

    *)
        echo "Git Wrapper Script for Gemini CLI"
        echo ""
        echo "Usage: $0 <command> [options]"
        echo ""
        echo "Available commands:"
        echo "  status                              - Show git status"
        echo "  add <file1> [file2] ...             - Add files to staging"
        echo "  commit \"message\"                    - Commit staged changes"
        echo "  push [remote]                       - Push to remote (default: origin)"
        echo "  pull [remote]                       - Pull from remote (default: origin)"
        echo "  add-commit-push \"files\" \"message\"  - Add, commit, and push in one command"
        echo "  log [limit]                         - Show commit log (default: 10)"
        echo "  branch                              - Show branch information"
        echo "  quick-commit \"message\"              - Add all changes and commit"
        echo ""
        echo "Examples:"
        echo "  $0 status"
        echo "  $0 add *.js"
        echo "  $0 commit \"Fix login bug\""
        echo "  $0 push"
        echo "  $0 add-commit-push \"*.js\" \"Update components\""
        echo "  $0 quick-commit \"WIP: latest changes\""
        exit 1
        ;;
esac
