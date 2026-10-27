import type { DisplayTranscriptSegment } from './syncedTranscript';

export const findActiveSentence = (segments: DisplayTranscriptSegment[], timeMs: number) => {
  // Hold the preceding sentence during silence; never jump to the first row in a gap.
  let low = 0;
  let high = segments.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (segments[middle].startMs <= timeMs) { result = middle; low = middle + 1; }
    else high = middle - 1;
  }
  return result;
};

