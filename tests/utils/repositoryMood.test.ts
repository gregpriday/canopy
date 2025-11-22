import { describe, it, expect } from 'vitest';
import {
  analyzeRepositoryMood,
  getMoodGradient,
  getHeaderGradient,
  type RepositoryMood,
} from '../../src/utils/repositoryMood.js';
import type { GitStatus } from '../../src/types/index.js';

describe('analyzeRepositoryMood', () => {
  it('returns clean for empty status map', () => {
    const gitStatus = new Map<string, GitStatus>();
    expect(analyzeRepositoryMood(gitStatus)).toBe('clean');
  });

  it('returns additions for only added files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'added'],
      ['file2.ts', 'added'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('additions');
  });

  it('returns additions for only untracked files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'untracked'],
      ['file2.ts', 'untracked'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('additions');
  });

  it('returns additions for mix of added and untracked files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'added'],
      ['file2.ts', 'untracked'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('additions');
  });

  it('returns modifications for only modified files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'modified'],
      ['file2.ts', 'modified'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('modifications');
  });

  it('returns mixed for combination of added and modified files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'added'],
      ['file2.ts', 'modified'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('mixed');
  });

  it('returns mixed for combination of untracked and modified files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'untracked'],
      ['file2.ts', 'modified'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('mixed');
  });

  it('returns deletions when any deleted files present', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('deletions');
  });

  it('returns deletions when deleted files mixed with other statuses', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
      ['file2.ts', 'modified'],
      ['file3.ts', 'added'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('deletions');
  });

  it('returns clean for only ignored files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'ignored'],
      ['file2.ts', 'ignored'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('clean');
  });

  it('ignores ignored files when mixed with modifications', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'ignored'],
      ['file2.ts', 'modified'],
      ['file3.ts', 'ignored'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('modifications');
  });

  it('ignores ignored files when mixed with additions', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'ignored'],
      ['file2.ts', 'added'],
      ['file3.ts', 'ignored'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('additions');
  });

  it('prioritizes deletions over mixed changes', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
      ['file2.ts', 'modified'],
      ['file3.ts', 'added'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('deletions');
  });

  it('prioritizes deletions over ignored files', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
      ['file2.ts', 'ignored'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('deletions');
  });

  it('prioritizes deletions with untracked files present', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
      ['file2.ts', 'untracked'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('deletions');
  });

  it('prioritizes mixed over modifications', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'modified'],
      ['file2.ts', 'modified'],
      ['file3.ts', 'added'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('mixed');
  });

  it('prioritizes mixed over additions', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'added'],
      ['file2.ts', 'added'],
      ['file3.ts', 'modified'],
    ]);
    expect(analyzeRepositoryMood(gitStatus)).toBe('mixed');
  });
});

describe('getMoodGradient', () => {
  it('returns turquoise to blue gradient for clean mood', () => {
    const gradient = getMoodGradient('clean');
    expect(gradient).toEqual({
      mood: 'clean',
      start: '#00CED1',
      end: '#4169E1',
    });
  });

  it('returns green gradient for additions mood', () => {
    const gradient = getMoodGradient('additions');
    expect(gradient).toEqual({
      mood: 'additions',
      start: '#00FA9A',
      end: '#20B2AA',
    });
  });

  it('returns gold to orange gradient for modifications mood', () => {
    const gradient = getMoodGradient('modifications');
    expect(gradient).toEqual({
      mood: 'modifications',
      start: '#FFD700',
      end: '#FFA500',
    });
  });

  it('returns dark orange to tomato gradient for mixed mood', () => {
    const gradient = getMoodGradient('mixed');
    expect(gradient).toEqual({
      mood: 'mixed',
      start: '#FF8C00',
      end: '#FF6347',
    });
  });

  it('returns pink to crimson gradient for deletions mood', () => {
    const gradient = getMoodGradient('deletions');
    expect(gradient).toEqual({
      mood: 'deletions',
      start: '#FF1493',
      end: '#DC143C',
    });
  });

  it('returns red gradient for conflict mood', () => {
    const gradient = getMoodGradient('conflict');
    expect(gradient).toEqual({
      mood: 'conflict',
      start: '#FF0000',
      end: '#8B0000',
    });
  });

  it('returns valid hex color codes for all moods', () => {
    const moods: RepositoryMood[] = [
      'clean',
      'additions',
      'modifications',
      'mixed',
      'deletions',
      'conflict',
    ];

    const hexColorRegex = /^#[0-9A-F]{6}$/i;

    moods.forEach(mood => {
      const gradient = getMoodGradient(mood);
      expect(gradient.start).toMatch(hexColorRegex);
      expect(gradient.end).toMatch(hexColorRegex);
      expect(gradient.mood).toBe(mood);
    });
  });
});

describe('getHeaderGradient', () => {
  const projectIdentityGradient = {
    start: '#FF00FF',
    end: '#00FFFF',
  };

  it('returns project identity gradient when moodGradients is false', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file.ts', 'modified'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, false);

    expect(gradient).toEqual(projectIdentityGradient);
  });

  it('returns mood gradient when moodGradients is true and repo is clean', () => {
    const gitStatus = new Map<string, GitStatus>();

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#00CED1',
      end: '#4169E1',
    });
  });

  it('returns mood gradient when moodGradients is true and repo has modifications', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file.ts', 'modified'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#FFD700',
      end: '#FFA500',
    });
  });

  it('returns mood gradient when moodGradients is true and repo has additions', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file.ts', 'added'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#00FA9A',
      end: '#20B2AA',
    });
  });

  it('returns mood gradient when moodGradients is true and repo has deletions', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file.ts', 'deleted'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#FF1493',
      end: '#DC143C',
    });
  });

  it('returns mood gradient when moodGradients is true and repo has mixed changes', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'added'],
      ['file2.ts', 'modified'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#FF8C00',
      end: '#FF6347',
    });
  });

  it('treats untracked files as additions in header gradient', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'untracked'],
      ['file2.ts', 'untracked'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#00FA9A',
      end: '#20B2AA',
    });
  });

  it('honors deletion priority in header gradient with mixed statuses', () => {
    const gitStatus = new Map<string, GitStatus>([
      ['file1.ts', 'deleted'],
      ['file2.ts', 'added'],
      ['file3.ts', 'modified'],
    ]);

    const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, true);

    expect(gradient).toEqual({
      start: '#FF1493',
      end: '#DC143C',
    });
  });

  it('always uses project identity gradient regardless of git status when disabled', () => {
    const gitStatuses = [
      new Map<string, GitStatus>(),
      new Map<string, GitStatus>([['file.ts', 'modified']]),
      new Map<string, GitStatus>([['file.ts', 'added']]),
      new Map<string, GitStatus>([['file.ts', 'deleted']]),
    ];

    gitStatuses.forEach(gitStatus => {
      const gradient = getHeaderGradient(gitStatus, projectIdentityGradient, false);
      expect(gradient).toEqual(projectIdentityGradient);
    });
  });
});
