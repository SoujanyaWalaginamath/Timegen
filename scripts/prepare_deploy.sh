#!/usr/bin/env bash
# prepare_deploy.sh
# Usage: ./scripts/prepare_deploy.sh <github-username> <repo-name>
# This script initializes git, commits, creates a GitHub repo (via gh if available), and pushes.

set -e
if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <github-username> <repo-name>"
  exit 1
fi

USER=$1
REPO=$2

git init
git add .
git commit -m "Prepare TimeGen for deploy"

if command -v gh >/dev/null 2>&1; then
  echo "Creating GitHub repo using gh..."
  gh repo create "$USER/$REPO" --public --source=. --remote=origin --push
else
  echo "gh CLI not found. Please create a repository on GitHub and run the following commands:" 
  echo "  git remote add origin https://github.com/$USER/$REPO.git"
  echo "  git branch -M main"
  echo "  git push -u origin main"
fi

echo "Done. If you used gh, the repo has been pushed. Now connect it in Render and deploy."
