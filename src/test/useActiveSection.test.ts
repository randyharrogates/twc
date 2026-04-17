import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useActiveSection } from '../hooks/useActiveSection';

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

describe('useActiveSection', () => {
  let callback: ObserverCallback | null = null;
  const observed: Element[] = [];

  beforeEach(() => {
    callback = null;
    observed.length = 0;

    class MockIO {
      constructor(cb: ObserverCallback) {
        callback = cb;
      }
      observe(el: Element) {
        observed.push(el);
      }
      disconnect() {
        observed.length = 0;
      }
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', MockIO as unknown as typeof IntersectionObserver);

    for (const id of ['home', 'groups', 'expenses']) {
      const el = document.createElement('section');
      el.id = id;
      document.body.appendChild(el);
    }
  });

  it('returns the most-visible section id', () => {
    const { result } = renderHook(() => useActiveSection(['home', 'groups', 'expenses']));
    expect(result.current).toBe('home');

    act(() => {
      callback?.([
        { isIntersecting: true, intersectionRatio: 0.8, target: document.getElementById('groups')! },
        { isIntersecting: true, intersectionRatio: 0.2, target: document.getElementById('home')! },
      ]);
    });
    expect(result.current).toBe('groups');
  });
});
