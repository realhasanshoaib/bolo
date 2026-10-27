import type { ReactNode } from 'react';

export type ScrollInteractionBoundaryProps = {
  children: ReactNode;
  onManualScroll: () => void;
};

// Native scroll gestures are reported by FlatList's onScrollBeginDrag.
export function ScrollInteractionBoundary({ children }: ScrollInteractionBoundaryProps) {
  return <>{children}</>;
}
