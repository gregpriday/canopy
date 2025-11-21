import { describe, it, expect } from 'vitest';
import { isAncestor, isOnActivePath } from '../../src/utils/pathAncestry.js';

describe('pathAncestry utilities', () => {
  describe('isAncestor', () => {
    it('returns true for direct descendants', () => {
      expect(isAncestor('/src', '/src/components/FileNode.tsx')).toBe(true);
    });

    it('returns false when paths are equal (even with trailing slash)', () => {
      expect(isAncestor('/src', '/src')).toBe(false);
      expect(isAncestor('/src', '/src/')).toBe(false);
    });

    it('handles root as the ultimate ancestor', () => {
      expect(isAncestor('/', '/src/components')).toBe(true);
    });

    it('ignores shared prefixes that are not ancestors', () => {
      expect(isAncestor('/src', '/srcs/index.ts')).toBe(false);
    });
  });

  describe('isOnActivePath', () => {
    it('returns false when there is no selection', () => {
      expect(isOnActivePath('/src', null)).toBe(false);
    });

    it('treats the selected node as active', () => {
      expect(isOnActivePath('/src/components', '/src/components')).toBe(true);
    });

    it('marks ancestors of the selection as active', () => {
      expect(isOnActivePath('/src', '/src/components/FileNode.tsx')).toBe(true);
    });

    it('respects trailing slashes on the active selection', () => {
      expect(isOnActivePath('/src/components', '/src/components/')).toBe(true);
    });

    it('denies unrelated nodes', () => {
      expect(isOnActivePath('/lib', '/src/components/FileNode.tsx')).toBe(false);
    });

    it('activates root when a deeper file is selected', () => {
      expect(isOnActivePath('/', '/src/components/FileNode.tsx')).toBe(true);
    });
  });
});
