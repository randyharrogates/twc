# src/state/ rules

- **One Zustand store**, persisted via `persist` middleware.
- **localStorage key: `twc-v1`.** Bump the version (`v2`, `v3`…) every time the persisted shape changes; add a `migrate` function in the same commit. Never silently change the shape under an existing key.
- **Actions are the only mutation path.** Nothing outside `store.ts` calls `set()`. Components read via selectors and call action methods.
- Selectors returning arrays/objects should use stable references (`useShallow` or equivalent) to avoid render storms.
- Money stays in integer minor units in the store. Conversion to base is computed on demand in selectors, not stored.
