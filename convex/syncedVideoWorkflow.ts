import { v } from 'convex/values';
import { Effect, Either } from 'effect';
import { internal } from './_generated/api';
import { workflow } from './workflow';
import {
  buildTranslationBatches,
  indexChunkSegments,
  mergeTranscriptSegments,
  type DisplayTranscriptSegment,
  type RawTranscriptSegment,
} from '../src/lib/syncedTranscript';

const CHUNK_CONCURRENCY = 6;
const TRANSLATION_BATCH_MAX_CHARS = 900;


export const processSyncedVideo = workflow
  .define({
    args: {
      attemptId: v.optional(v.string()),
      entryId: v.id('entries'),
      migrationReason: v.optional(v.literal('today-entries-reprocess')),
      reuseExistingMedia: v.optional(v.boolean()),
    },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    const startedAt = Date.now();

    await step.runMutation(
      internal.entries.beginProcessingRun,
      {
        attemptId: args.attemptId,
        entryId: args.entryId,
        processingVersion: 2,
        startedAt,
      },
      { inline: true },
    );

    try {
      const entry = await step.runQuery(internal.entries.getEntryForProcessing, {
        entryId: args.entryId,
      });

      if (!entry) {
        throw new Error('Entry not found.');
      }

      if (entry.processingVersion !== 2) {
        throw new Error('Entry is not queued for synced processing.');
      }

      const prepared = args.reuseExistingMedia
        ? await step.runQuery(internal.entries.getPreparedMediaForProcessing, {
            entryId: args.entryId,
          })
        : await step.runAction(
            internal.syncPipeline.prepareMedia,
            {
              attemptId: args.attemptId,
              entryId: args.entryId,
              youtubeUrl: entry.youtubeUrl,
            },
            { retry: { base: 2, initialBackoffMs: 10_000, maxAttempts: 1 } },
          );

      await step.runMutation(internal.entries.updateProgress, {
        attemptId: args.attemptId,
        entryId: args.entryId,
        processingStage: 'Adding your translation',
        updatedAt: Date.now(),
      });

      const translateSegmentsWithFallback = async (
        batchSegments: DisplayTranscriptSegment[],
      ): Promise<{
        elapsedSec: number;
        segments: DisplayTranscriptSegment[];
      }> => {
        try {
          return await step.runAction(
            internal.syncPipeline.translateSegmentBatch,
            {
              attemptId: args.attemptId,
              entryId: args.entryId,
              segments: batchSegments,
              sourceLanguageLabel: entry.sourceLanguageLabel,
              targetLanguageLabel: entry.targetLanguageLabel,
            },
            { retry: { base: 2, initialBackoffMs: 1_000, maxAttempts: 2 } },
          );
        } catch (error) {
          if (batchSegments.length <= 1) {
            throw error;
          }

          const splitIndex = Math.ceil(batchSegments.length / 2);
          const left = await translateSegmentsWithFallback(batchSegments.slice(0, splitIndex));
          const right = await translateSegmentsWithFallback(batchSegments.slice(splitIndex));

          return {
            elapsedSec: left.elapsedSec + right.elapsedSec,
            segments: [...left.segments, ...right.segments],
          };
        }
      };
      // Each worker transcribes, translates, and publishes one chunk. Sequential
      // batches inside a worker keep provider concurrency bounded across the job.
      await step.runMutation(internal.entries.replaceEntrySegments, {
        attemptId: args.attemptId, entryId: args.entryId, createdAt: Date.now(), segments: [],
      });
      const chunkOutcomes = await Effect.runPromise(Effect.all(
        prepared.chunks.map((chunk) => Effect.tryPromise({
          catch: (error) => error instanceof Error ? error : new Error(String(error)),
          try: async () => {
            const transcript = await step.runAction(internal.syncPipeline.transcribeChunk, {
              attemptId: args.attemptId,
              chunkDurationMs: chunk.durationMs,
              chunkIndex: chunk.index,
              chunkStartMs: chunk.startMs,
              entryId: args.entryId,
              language: entry.sourceLanguage !== 'auto' ? entry.sourceLanguage : undefined,
              r2Key: chunk.r2Key,
            }, { retry: { base: 2, initialBackoffMs: 3_000, maxAttempts: 3 } });
            const rawSegments: RawTranscriptSegment[] = transcript.segments.map((segment) => ({
              chunkIndex: transcript.chunkIndex, endMs: segment.endMs,
              startMs: segment.startMs, text: segment.text,
            }));
            const mergedSegments = mergeTranscriptSegments({ segments: rawSegments });
            const indexedSegments = indexChunkSegments(chunk.index, mergedSegments);
            const batches = buildTranslationBatches({ maxChars: TRANSLATION_BATCH_MAX_CHARS, segments: indexedSegments });
            let translationSec = 0;
            for (const batch of batches) {
              const indexes = new Set(batch.map((item) => Number(item.id)));
              const translated = await translateSegmentsWithFallback(indexedSegments.filter((segment) => indexes.has(segment.index)));
              translationSec += translated.elapsedSec;
              await step.runMutation(internal.entries.publishEntrySegments, {
                attemptId: args.attemptId, entryId: args.entryId,
                createdAt: Date.now(), segments: translated.segments,
              });
            }
            await step.runMutation(internal.entries.completeTranslationChunk, {
              attemptId: args.attemptId, entryId: args.entryId, chunkIndex: chunk.index, createdAt: Date.now(),
            });
            return { whisperSec: transcript.elapsedSec, translationSec, segmentCount: indexedSegments.length };
          },
        })),
        { concurrency: CHUNK_CONCURRENCY, mode: "either" },
      ));
      const chunkResults = chunkOutcomes.map((outcome) => {
        if (Either.isLeft(outcome)) throw outcome.left;
        return outcome.right;
      });
      if (!chunkResults.some((chunk) => chunk.segmentCount > 0)) {
        throw new Error('We could not find spoken words in this video.');
      }
      const whisperSec = chunkResults.reduce((total, chunk) => total + chunk.whisperSec, 0);
      const translationSec = chunkResults.reduce((total, chunk) => total + chunk.translationSec, 0);

      await step.runMutation(internal.entries.updateProgress, {
        attemptId: args.attemptId,
        entryId: args.entryId,
        processingStage: 'Finishing up',
        updatedAt: Date.now(),
      });
      await step.runAction(
        internal.syncPipeline.cleanupMediaChunks,
        {
          attemptId: args.attemptId,
          entryId: args.entryId,
          r2Keys: prepared.chunks.map((chunk) => chunk.r2Key),
        },
        { retry: { base: 2, initialBackoffMs: 3_000, maxAttempts: 3 } },
      );
      const now = Date.now();
      const totalSec = (now - startedAt) / 1000;
      await step.runMutation(internal.entries.completeProcessingRun, {
        attemptId: args.attemptId,
        completedAt: now,
        downloadSec: prepared.downloadSec,
        entryId: args.entryId,
        ffmpegSec: prepared.ffmpegSec,
        uploadSec: "uploadSec" in prepared ? prepared.uploadSec : undefined,
        realtimeFactor: prepared.durationSec > 0 ? prepared.durationSec / Math.max(totalSec, 1) : undefined,
        totalSec,
        translationSec,
        whisperSec,
      });
      await step.runMutation(internal.entries.markEntrySyncedReady, {
        attemptId: args.attemptId,
        durationSec: prepared.durationSec,
        entryId: args.entryId,
        processingStage: 'Ready to watch',
        updatedAt: now,
      });

      return null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Synced video processing failed.';
      const failedAt = Date.now();

      await step.runMutation(internal.entries.failProcessingRun, {
        attemptId: args.attemptId,
        entryId: args.entryId,
        errorMessage,
        failedAt,
      });
      await step.runMutation(internal.entries.failEntry, {
        attemptId: args.attemptId,
        entryId: args.entryId,
        errorMessage,
        processingStage: errorMessage,
        updatedAt: failedAt,
      });

      throw error;
    }
  });
