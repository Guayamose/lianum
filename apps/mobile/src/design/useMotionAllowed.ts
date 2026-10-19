import { useEffect, useState } from 'react';
import { AccessibilityInfo, AppState } from 'react-native';

export function useMotionPreference() {
  const [reduced, setReduced] = useState(true);
  const [resolved, setResolved] = useState(false);
  const [active, setActive] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (mounted) {
          setReduced(value);
          setResolved(true);
        }
      })
      .catch(() => {
        if (mounted) setResolved(true);
      });
    const preference = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    const visibility = AppState.addEventListener('change', (state) =>
      setActive(state === 'active'),
    );
    return () => {
      mounted = false;
      preference.remove();
      visibility.remove();
    };
  }, []);
  return { allowed: resolved && !reduced && active, reduced, active, resolved };
}

export function useMotionAllowed() {
  return useMotionPreference().allowed;
}
