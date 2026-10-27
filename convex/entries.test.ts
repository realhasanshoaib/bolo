import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = {
  './entries.ts': () => import('./entries'),
  './_generated/server.ts': () => import('./_generated/server'),
};
const entryFields = {
  createdAt: 1000, updatedAt: 1000, sourceLanguage: 'auto', sourceLanguageLabel: 'Automatic',
  targetLanguage: 'ur', targetLanguageLabel: 'Urdu', thumbnailUrl: '', title: 'Test video',
  videoId: 'dQw4w9WgXcQ', youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  processingVersion: 2, activeProcessingAttemptId: 'attempt-1', translatedChunkIndexes: [],
};
const sentence = (chunkIndex: number) => ({
  index: chunkIndex * 10_000, startMs: chunkIndex * 45_000, endMs: chunkIndex * 45_000 + 3000,
  originalText: 'Hello', translatedText: 'سلام', sourceChunkIndexes: [chunkIndex],
});

describe('progressive translations', () => {
  it('reveals only a contiguous prefix and keeps retry publication idempotent', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', { ...entryFields, status: 'processing' }));
    const args = { entryId, attemptId: 'attempt-1', createdAt: 2000 };
    await t.mutation(internal.entries.publishEntrySegments, { ...args, segments: [sentence(1)] });
    await t.mutation(internal.entries.completeTranslationChunk, { ...args, chunkIndex: 1 });
    expect(await t.query(api.entries.listEntrySegments, { entryId })).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(entryId)))?.firstTranslationAt).toBeUndefined();

    await t.mutation(internal.entries.publishEntrySegments, { ...args, createdAt: 2500, segments: [sentence(0)] });
    expect((await t.query(api.entries.listEntrySegments, { entryId })).map((s) => s.index)).toEqual([0]);
    await t.mutation(internal.entries.publishEntrySegments, { ...args, segments: [sentence(0)] });
    await t.mutation(internal.entries.completeTranslationChunk, { ...args, chunkIndex: 0 });
    expect((await t.query(api.entries.listEntrySegments, { entryId })).map((s) => s.index)).toEqual([0, 10_000]);
    expect((await t.run((ctx) => ctx.db.get(entryId)))?.firstTranslationAt).toBe(2500);
  });

  it('unlocks later speech when the first chunk is silent', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', { ...entryFields, status: 'processing' }));
    await t.mutation(internal.entries.publishEntrySegments, { entryId, attemptId: 'attempt-1', createdAt: 2000, segments: [sentence(1)] });
    await t.mutation(internal.entries.completeTranslationChunk, { entryId, attemptId: 'attempt-1', createdAt: 3000, chunkIndex: 0 });
    expect((await t.query(api.entries.listEntrySegments, { entryId })).length).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(entryId)))?.firstTranslationAt).toBe(3000);
  });

  it('rejects stale attempts and late writes to failed jobs', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', { ...entryFields, status: 'processing' }));
    await t.mutation(internal.entries.publishEntrySegments, { entryId, attemptId: 'old-attempt', createdAt: 2000, segments: [sentence(0)] });
    await t.run((ctx) => ctx.db.patch(entryId, { status: 'failed' }));
    await t.mutation(internal.entries.publishEntrySegments, { entryId, attemptId: 'attempt-1', createdAt: 3000, segments: [sentence(0)] });
    expect(await t.query(api.entries.listEntrySegments, { entryId })).toEqual([]);
  });

  it('clears the visibility frontier and timing when a new processing run resets the transcript', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', {
      ...entryFields, status: 'processing', firstTranslationAt: 1500, translatedChunkIndexes: [0, 1],
    }));
    await t.mutation(internal.entries.replaceEntrySegments, { entryId, attemptId: 'attempt-1', createdAt: 2000, segments: [] });
    const entry = await t.run((ctx) => ctx.db.get(entryId));
    expect(entry?.translatedChunkIndexes).toEqual([]);
    expect(entry?.firstTranslationAt).toBeUndefined();
  });
});

describe('processing reuse', () => {
  it.each(['ready', 'processing', 'queued'] as const)('reuses a %s video without starting another workflow', async (status) => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', { ...entryFields, status }));
    const result = await t.mutation(api.entries.queueSyncedEntry, {
      createdAt: 4000, updatedAt: 4000, sourceLanguage: 'auto', sourceLanguageLabel: 'Automatic',
      targetLanguage: 'ur', targetLanguageLabel: 'Urdu', thumbnailUrl: '', title: 'Test video',
      videoId: entryFields.videoId, youtubeUrl: entryFields.youtubeUrl, processingStage: 'Getting your video ready',
    });
    expect(result).toBe(entryId);
    expect((await t.query(api.entries.listEntries, {})).length).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(entryId)))?.updatedAt).toBe(4000);
  });
});

describe('saved-video lookup outside the history page', () => {
  it('keeps a selected or resumable video available after it leaves the latest 50 entries', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run(async (ctx) => {
      const saved = await ctx.db.insert('entries', { ...entryFields, status: 'ready' });
      for (let index = 0; index < 51; index += 1) {
        await ctx.db.insert('entries', { ...entryFields, status: 'ready', updatedAt: 2000 + index });
      }
      return saved;
    });
    expect((await t.query(api.entries.listEntries, {})).some((entry) => entry._id === entryId)).toBe(false);
    expect((await t.query(api.entries.getEntry, { entryId }))?._id).toBe(entryId);
  });

  it('returns a missing state for removed or invalid locally remembered IDs', async () => {
    const t = convexTest(schema, modules);
    const entryId = await t.run((ctx) => ctx.db.insert('entries', { ...entryFields, status: 'ready' }));
    await t.run((ctx) => ctx.db.delete(entryId));
    expect(await t.query(api.entries.getEntry, { entryId })).toBeNull();
    expect(await t.query(api.entries.getEntry, { entryId: 'invalid-saved-value' })).toBeNull();
  });
});
