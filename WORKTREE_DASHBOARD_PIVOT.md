# Worktree Dashboard Pivot – Dependency Flow Plan

> **Generated:** 2025-01-22  
> **Status:** Active – Ready for Execution  
> **Architecture Shift:** File Browser → Worktree Context Dashboard  
> **Total Issues:** 16 new issues

This plan transforms Canopy from a passive file browser into an active Worktree Context Dashboard aimed at reducing “agent blindness” by surfacing activity across multiple git worktrees simultaneously.

**Key Architectural Changes**
- **Before:** Deep hierarchical file tree for a single directory
- **After:** Vertical stack of “Worktree Cards” showing all worktrees with AI summaries
- **Focus:** Changed files only, not the complete file system
- **Primary Action:** CopyTree with profiles for AI context extraction
- **Navigation:** Card-based with fuzzy search, not tree traversal

For contributor instructions, follow the execution protocol below. GitHub issues are the source of truth; keep status in sync with issue states and dependencies.

---

## Execution Protocol (for agents/contributors)
1. **Scan** the Execution Queue.
2. **Check status** of dependencies via GitHub.
3. **Identify ready tasks**: status is OPEN and all blocking dependencies are CLOSED.
4. **Skip assigned** tasks; only pick unassigned items.
5. **Claim & execute** the highest-priority ready task, then proceed through implementation and tests.

---

## Execution Queue

### 🏗️ Phase 1: Data Model & Services (Foundation)
Goal: Build backend to power dashboard – multi-worktree status, change sets, profiles  
**Milestone Gate:** Data Foundation Complete

- [ ] **#143 Multi-Worktree Status Fetching Service**  
  Dependencies: (None) • Complexity: Medium • Blocks: #144, #146

- [ ] **#144 Worktree Mood & Categorization Logic**  
  Dependencies: #143 • Complexity: Simple • Blocks: #146

- [ ] **#145 CopyTree Profile Support**  
  Dependencies: (None) • Complexity: Medium • Blocks: #149

---

### 🎨 Phase 2: Dashboard UI (Visual Rewrite)
Goal: Replace TreeView with Worktree Stack interface  
**Milestone Gate:** Dashboard UI Complete

- [ ] **#146 WorktreeCard Component**  
  Dependencies: #143, #144 • Complexity: Complex • Blocks: #147

- [ ] **#147 Vertical Stack Layout (Replace TreeView)**  
  Dependencies: #146 • Complexity: Medium • Blocks: #148, #151, #152, #154, #155

- [ ] **#148 Dashboard Navigation (useDashboardNav Hook)**  
  Dependencies: #147 • Complexity: Medium • Blocks: (None – enables interaction)

---

### 📋 Phase 3: CopyTree First-Class Integration
Goal: Make CopyTree the primary action from dashboard  
**Milestone Gate:** CopyTree Integration Complete

- [ ] **#149 CopyTree Context Packet Action**  
  Dependencies: #145, #146 • Complexity: Medium • Blocks: #150

- [ ] **#150 Profile Selector Modal**  
  Dependencies: #145, #149 • Complexity: Simple • Blocks: (None)

---

### 🔗 Phase 4: Interaction & Focus Mode
Goal: Handle edge cases where deep file browsing is needed  
**Parallel Execution:** Both tasks can run after Phase 2

- [ ] **#151 VS Code Integration (Portal to Editor)**  
  Dependencies: #147, #148 • Complexity: Simple • Blocks: (None)

- [ ] **#152 Fuzzy Search Focus Mode (Replace File Browser)**  
  Dependencies: #147 • Complexity: Complex • Blocks: (None)

---

### 🔧 Phase 5: Demote TreeView (Optional)
Goal: Keep existing TreeView as fallback without deleting work  
**Priority:** Optional

- [ ] **#153 Wrap TreeView as Secondary Tree Mode**  
  Dependencies: #147 • Complexity: Simple • Blocks: (None)

---

### ✨ Phase 6: Polish & Alignment
Goal: Align header, status bar, and documentation with new model  
**Parallel Execution:** All three can run after Phase 2

- [ ] **#154 Header Alignment (Worktree Dashboard Aware)**  
  Dependencies: #147 • Complexity: Simple • Blocks: (None)

- [ ] **#155 StatusBar Tuning for Dashboard Context**  
  Dependencies: #147 • Complexity: Simple • Blocks: (None)

- [ ] **#156 Documentation Rewrite for Worktree Dashboard**  
  Dependencies: All prior phases • Complexity: Medium • Priority: High • Blocks: (None)

---

### 🧪 Phase 7: Testing & Final QA
Goal: Ensure stability and complete test coverage  
**Sequential Execution:** Integration tests first, then update existing

- [ ] **#157 Integration Tests for Dashboard Flow**  
  Dependencies: All prior phases • Complexity: Complex • Priority: Critical • Blocks: (None)

- [ ] **#158 Update All Existing Tests for Dashboard Architecture**  
  Dependencies: #157 (can run in parallel) • Complexity: Medium • Priority: Critical • Blocks: (None)

---

## Dependency Graph Summary

```
Phase 1 (Foundation - All Parallel):
  #143 (Status) ─┐
  #144 (Mood) ───┼──→ #146
  #145 (Profiles)─┘

Phase 2 (Dashboard UI - Sequential):
  #146 (Card) ──→ #147 (Stack) ──→ #148 (Nav)
                      │
                      ├──→ #151 (VS Code)
                      ├──→ #152 (Search)
                      ├──→ #153 (TreeView)
                      ├──→ #154 (Header)
                      └──→ #155 (StatusBar)

Phase 3 (CopyTree - Sequential):
  #145 + #146 ──→ #149 (Action) ──→ #150 (Selector)

Phase 4 (Interaction - Parallel):
  #147 + #148 ──→ #151 (VS Code)
  #147 ──→ #152 (Search)

Phase 5 (Optional):
  #147 ──→ #153 (TreeView fallback)

Phase 6 (Polish - All Parallel):
  #147 ──→ #154 (Header)
  #147 ──→ #155 (StatusBar)
  All ──→ #156 (Docs)

Phase 7 (Testing - Sequential):
  All ──→ #157 (Integration) ─┐
                              ├──→ Can run in parallel
  All ──→ #158 (Update Tests)─┘
```

**Critical Path:** #143 → #144 → #146 → #147 → #157 → #158

---

## Milestones

- **Milestone 1: Data Foundation Complete** (end of Phase 1)  
  Multi-worktree status fetching working; mood categorization functional; CopyTree profiles configurable.

- **Milestone 2: Dashboard UI Complete** (end of Phase 2)  
  WorktreeCard component rendering; stack layout replacing TreeView; keyboard navigation functional.

- **Milestone 3: CopyTree Integration Complete** (end of Phase 3)  
  Context packet action working; profile selector modal functional.

- **Milestone 4: Interaction Complete** (end of Phase 4)  
  VS Code integration working; fuzzy search functional.

- **Milestone 5: Launch Readiness** (end of Phase 7)  
  All tests passing; documentation updated; performance targets met.

---

## Parallel Work Opportunities

- **Phase 1:** All 3 tasks can run in parallel (#143, #144, #145).  
- **Phase 4:** Both tasks can run in parallel (#151, #152).  
- **Phase 6:** All 3 tasks can run in parallel (#154, #155, #156).  
- **Phase 7:** Both tasks can run in parallel (#157, #158).

---

## What Changed From the Old Plan

**Closed as Obsolete** (Pivot makes these unnecessary): #94–#99, #103, #104, #106, #108, #116  
**Kept for Future:** #102 (Configurable keybindings), #105 (Mood-based header gradient)  
**Already Complete:** #90, #121, #123

---

## Success Metrics

- Dashboard renders cards for all detected worktrees.  
- AI summaries appear within 2 seconds of load.  
- Card navigation with keyboard is smooth (no lag).  
- CopyTree works with default profile from any card.  
- Profile selector modal functional.  
- VS Code integration opens correct worktree.  
- Fuzzy search returns relevant results in <500ms.  
- TreeView accessible via `/tree` command (if implemented).  
- All tests pass (`npm test` 100% pass rate).  
- Documentation updated (README, SPEC, CLAUDE.md).

**Performance Targets**  
- Initial load: <1s for 5 worktrees, <3s for 20 worktrees.  
- Worktree status refresh: <200ms per worktree (background).  
- Card expansion: <50ms latency.  
- CopyTree action: <500ms to clipboard.  
- Memory usage: <150 MB with 10 worktrees.

---

## Ready to Start Now

Issues with no dependencies (can begin immediately):

1. **#143 – Multi-Worktree Status Fetching Service** (foundation; blocks #144, #146)  
2. **#145 – CopyTree Profile Support** (blocks #149)

---

## Next Steps

1. ✅ Obsolete issues closed: #94–#99, #103, #104, #106, #108, #116  
2. ✅ New issues created: #143–#158  
3. Begin Phase 1 with #143 (Multi-Worktree Status) – **READY NOW**  
4. Parallel Phase 1 with #145 (CopyTree Profiles) – **READY NOW**  
5. Update SPEC.md in #156 to reflect the pivot.

---

## References

- Full pivot plan: this document (`WORKTREE_DASHBOARD_PIVOT.md`)  
- Original spec: `SPEC.md` (to be updated in #156)  
- AI agent instructions: `CLAUDE.md` (to be updated in #156)

---

Questions or changes? Treat this as a living plan and adjust priorities as implementation proceeds.

**Last Updated:** 2025-01-22  
**Next Review:** After Milestone 1 (Data Foundation Complete)
