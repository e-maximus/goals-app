import "server-only";
import {
  BaseCheckpointSaver,
  WRITES_IDX_MAP,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { Pool } from "../db";

/**
 * A LangGraph checkpoint saver over this app's Postgres, scoped to one user.
 *
 * LangGraph ships `@langchain/langgraph-checkpoint-postgres`, and it is not
 * usable here: it keys every table on `thread_id` alone. Ids in this app are
 * globally unique but never a permission — every read and write names its
 * owner, because a bare-id filter crosses accounts (see the isolation rule in
 * AGENTS.md). It also brings its own `pg` pool, where the rest of the server
 * goes through Prisma.
 *
 * So the owner is bound at construction and every query filters on it. There is
 * no method that takes an owner id, which means no caller can pass the wrong
 * one: the only way to reach a checkpoint is to have built a saver for the user
 * the request resolved to.
 *
 * The stored `checkpoint` and `metadata` are bytes, not JSON — they are
 * whatever `serde` produced, and a JSON column would quietly change types on
 * the way back out.
 */
export class OwnerScopedCheckpointer extends BaseCheckpointSaver {
  constructor(
    private readonly pool: Pool,
    private readonly ownerId: string,
    serde?: SerializerProtocol
  ) {
    super(serde);
  }

  /** The thread/namespace/checkpoint a config is pointing at. */
  private target(config: RunnableConfig) {
    const configurable = (config.configurable ?? {}) as {
      thread_id?: string;
      checkpoint_ns?: string;
      checkpoint_id?: string;
    };
    if (!configurable.thread_id) {
      throw new Error("A checkpoint config must carry a thread_id.");
    }
    return {
      threadId: configurable.thread_id,
      ns: configurable.checkpoint_ns ?? "",
      checkpointId: configurable.checkpoint_id,
    };
  }

  /** A config naming one exact checkpoint, for handing back to LangGraph. */
  private configFor(threadId: string, ns: string, checkpointId: string): RunnableConfig {
    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpointId } };
  }

  /** The writes recorded against a checkpoint, in the order they were made. */
  private async pendingWrites(threadId: string, ns: string, checkpointId: string) {
    const rows = await this.pool.db.chatCheckpointWrite.findMany({
      where: {
        owner_id: this.ownerId,
        thread_id: threadId,
        checkpoint_ns: ns,
        checkpoint_id: checkpointId,
      },
      orderBy: [{ task_id: "asc" }, { idx: "asc" }],
    });
    return Promise.all(
      rows.map(
        async (row) =>
          [
            row.task_id,
            row.channel,
            await this.serde.loadsTyped(row.type ?? "json", row.value ?? new Uint8Array()),
          ] as [string, string, unknown]
      )
    );
  }

  /** Rebuild a tuple from a stored row. */
  private async toTuple(row: {
    thread_id: string;
    checkpoint_ns: string;
    checkpoint_id: string;
    parent_id: string | null;
    type: string | null;
    checkpoint: Uint8Array;
    metadata: Uint8Array;
  }): Promise<CheckpointTuple> {
    const type = row.type ?? "json";
    return {
      config: this.configFor(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
      checkpoint: (await this.serde.loadsTyped(type, row.checkpoint)) as Checkpoint,
      metadata: (await this.serde.loadsTyped(type, row.metadata)) as CheckpointMetadata,
      parentConfig: row.parent_id
        ? this.configFor(row.thread_id, row.checkpoint_ns, row.parent_id)
        : undefined,
      pendingWrites: await this.pendingWrites(row.thread_id, row.checkpoint_ns, row.checkpoint_id),
    };
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { threadId, ns, checkpointId } = this.target(config);

    // Without an explicit id this means "where the thread stands now", which is
    // its newest checkpoint.
    const row = await this.pool.db.chatCheckpoint.findFirst({
      where: {
        owner_id: this.ownerId,
        thread_id: threadId,
        checkpoint_ns: ns,
        ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
      },
      orderBy: [{ created_at: "desc" }, { checkpoint_id: "desc" }],
    });
    if (!row) return undefined;
    return this.toTuple(row);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions
  ): AsyncGenerator<CheckpointTuple> {
    const { threadId, ns } = this.target(config);
    const before = options?.before?.configurable?.checkpoint_id as string | undefined;

    const rows = await this.pool.db.chatCheckpoint.findMany({
      where: {
        owner_id: this.ownerId,
        thread_id: threadId,
        checkpoint_ns: ns,
        ...(before ? { checkpoint_id: { lt: before } } : {}),
      },
      orderBy: [{ created_at: "desc" }, { checkpoint_id: "desc" }],
      ...(options?.limit ? { take: options.limit } : {}),
    });

    for (const row of rows) {
      yield await this.toTuple(row);
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<RunnableConfig> {
    const { threadId, ns, checkpointId: parentId } = this.target(config);
    const [type, serializedCheckpoint] = await this.serde.dumpsTyped(checkpoint);
    const [metadataType, serializedMetadata] = await this.serde.dumpsTyped(metadata);
    if (type !== metadataType) {
      throw new Error("Checkpoint and metadata must serialize to the same type.");
    }

    const key = {
      owner_id: this.ownerId,
      thread_id: threadId,
      checkpoint_ns: ns,
      checkpoint_id: checkpoint.id,
    };
    const row = {
      parent_id: parentId ?? null,
      type,
      checkpoint: Buffer.from(serializedCheckpoint),
      metadata: Buffer.from(serializedMetadata),
      created_at: BigInt(Date.now()),
    };

    await this.pool.db.chatCheckpoint.upsert({
      where: {
        owner_id_thread_id_checkpoint_ns_checkpoint_id: key,
      },
      create: { ...key, ...row },
      update: row,
    });

    return this.configFor(threadId, ns, checkpoint.id);
  }

  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string): Promise<void> {
    const { threadId, ns, checkpointId } = this.target(config);
    if (!checkpointId) throw new Error("Writes must name the checkpoint they belong to.");

    await Promise.all(
      writes.map(async ([channel, value], i) => {
        // Some channels are singular — an error or an interrupt replaces the
        // previous one rather than appending. LangGraph marks those with a fixed
        // negative index, which is also what makes the upsert land on the same
        // row instead of growing the table on every retry.
        const idx = WRITES_IDX_MAP[channel] ?? i;
        const [type, serialized] = await this.serde.dumpsTyped(value);
        const key = {
          owner_id: this.ownerId,
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: checkpointId,
          task_id: taskId,
          idx,
        };
        const row = { channel, type, value: Buffer.from(serialized) };
        await this.pool.db.chatCheckpointWrite.upsert({
          where: {
            owner_id_thread_id_checkpoint_ns_checkpoint_id_task_id_idx: key,
          },
          create: { ...key, ...row },
          update: row,
        });
      })
    );
  }

  /**
   * Drop a thread's checkpoints. The owner comes from this saver, never from
   * the caller — the interface only passes a thread id, and honouring that
   * alone is exactly the cross-account read this class exists to prevent.
   */
  async deleteThread(threadId: string): Promise<void> {
    await this.pool.db.chatCheckpointWrite.deleteMany({
      where: { owner_id: this.ownerId, thread_id: threadId },
    });
    await this.pool.db.chatCheckpoint.deleteMany({
      where: { owner_id: this.ownerId, thread_id: threadId },
    });
  }
}
