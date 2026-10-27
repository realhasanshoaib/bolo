import { createElement } from 'react';
import type { ScrollInteractionBoundaryProps } from './ScrollInteractionBoundary';

export function ScrollInteractionBoundary({ children, onManualScroll }: ScrollInteractionBoundaryProps) {
  return createElement('div', {
    style: { display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' },
    onWheel: onManualScroll,
    onTouchMove: onManualScroll,
    onKeyDown: (event) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) onManualScroll();
    },
  }, children);
}
