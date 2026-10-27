import { describe, expect, it } from 'vitest';
import { findActiveSentence } from './readerPlayback';
import { firstIncompleteChunk, indexChunkSegments, type DisplayTranscriptSegment } from './syncedTranscript';

const segments: DisplayTranscriptSegment[] = [
  { index: 0, startMs: 1000, endMs: 3000, originalText: 'One', translatedText: 'ایک', sourceChunkIndexes: [0] },
  { index: 1, startMs: 6000, endMs: 8000, originalText: 'Two', translatedText: 'دو', sourceChunkIndexes: [0] },
];
describe('sentence following', () => {
  it('handles leading silence, gaps, exact boundaries, and the end of playback', () => {
    expect(findActiveSentence([], 0)).toBe(-1);
    expect(findActiveSentence(segments, 0)).toBe(-1);
    expect(findActiveSentence(segments, 1000)).toBe(0);
    expect(findActiveSentence(segments, 5000)).toBe(0);
    expect(findActiveSentence(segments, 6000)).toBe(1);
    expect(findActiveSentence(segments, 10_000)).toBe(1);
  });
  it('keeps chunk IDs stable regardless of which chunk finishes first', () => {
    const secondChunk = indexChunkSegments(1, segments);
    const firstChunk = indexChunkSegments(0, segments);
    expect(secondChunk.map((s) => s.index)).toEqual([10_000, 10_001]);
    expect(firstChunk.map((s) => s.index)).toEqual([0, 1]);
    expect(firstIncompleteChunk([2, 0, 2])).toBe(1);
    expect(firstIncompleteChunk([2, 0, 1])).toBe(3);
  });
});
