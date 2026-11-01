import {useEffect} from 'react';
import {BackHandler} from 'react-native';

/**
 * Handle Android's back button while `enabled`.
 *
 * The press counts as handled unless `onBack` returns false. Handlers run
 * newest first, so the most recently mounted surface answers before the app's.
 */
export function useBackPress(
  onBack: () => boolean | void,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sub = BackHandler.addEventListener(
      'hardwareBackPress',
      () => onBack() !== false,
    );
    return () => sub.remove();
  }, [onBack, enabled]);
}
