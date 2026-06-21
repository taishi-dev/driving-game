import { useEffect } from 'react';

/**
 * Real-time driving feedback is currently disabled for performance.
 * Mission analysis is now done post-run in store.ts (calculateMissionResult).
 *
 * NOTE: This hook previously called `useDrivingStore()` with no selector, which
 * subscribes to the ENTIRE store. Because it is invoked from ClientApp (the app
 * root), that re-rendered the whole app subtree on every store write — and the
 * store is written many times per frame while driving. The destructured values
 * were unused (the effect body is empty), so the subscription was pure overhead
 * and has been removed.
 */
export function useDrivingFeedback() {
    useEffect(() => {
        // Placeholder for future real-time feedback features.
    }, []);
}
