# Canopy Issue Workflow

Authoritative checklist for handling a single GitHub issue end-to-end.

1. **Read the issue**  
   - Open the issue body and capture goals, acceptance criteria, and linked references.
2. **Review comments**  
   - Scan all thread comments for clarifications, blockers, or updated requirements.
3. **Explore the codebase**  
   - Inspect relevant files, search for related modules/tests, and map existing behaviors before changing anything.
4. **Plan the execution**  
   - Produce a concise, ordered plan covering approach, code touch-points, and test strategy before edits.
5. **Implement and verify**  
   - Make the changes, keep the worktree clean, and ensure the full test suite (`npm test`, etc.) passes locally.
6. **Open and merge a PR**  
   - Push the branch, open a PR that explicitly references and closes the issue (e.g., `Closes #123`), includes a concise implementation summary and testing notes, then merge immediately once checks pass. Delete the feature branch after merge.
   - Keep PR bodies readable: use real newlines/bullets (no escaped `\n` strings), list key changes and tests run.

Use this workflow as the source of truth for future issue handling.***
