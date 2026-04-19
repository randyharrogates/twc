import type { Group } from '../../types';
import type { ChatMessage, ContentBlock } from '../../lib/llm/types';
import { microUsdToUsd } from '../../lib/llm/cost';
import { getImage } from '../../state/imageCache';
import { Button } from '../ui/Button';
import { DraftCard } from './DraftCard';
import { PendingBubble } from './PendingBubble';
import { ToolUseBubble } from './ToolUseBubble';

interface Props {
  group: Group;
  messages: ChatMessage[];
  acceptedDraftIndexes: Record<string, Set<number>>;
  onAcceptDraft: (messageId: string, draftIndex: number) => void;
  onMarkDraftAccepted: (messageId: string, draftIndex: number) => void;
  onAcceptAll: (messageId: string) => void;
  onDiscardDrafts: (messageId: string) => void;
  onExecutePlan: (messageId: string) => void;
  pendingText?: string | null;
  pendingPhase?: import('../../lib/llm/types').AgentPhase | null;
  pendingTurnStartedAt?: number | null;
  pendingPhaseStartedAt?: number | null;
}

interface ToolOutcome {
  output: string;
  isError: boolean;
}

function buildToolOutputMap(messages: ChatMessage[]): Map<string, ToolOutcome> {
  const out = new Map<string, ToolOutcome>();
  for (const m of messages) {
    for (const b of m.blocks) {
      if (b.type === 'tool_result') {
        const text = b.content
          .filter((c): c is Extract<ContentBlock, { type: 'text' }> => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
        out.set(b.toolUseId, { output: text, isError: b.isError ?? false });
      }
    }
  }
  return out;
}

function TextBlock({ block }: { block: Extract<ContentBlock, { type: 'text' }> }) {
  return <p className="whitespace-pre-wrap">{block.text}</p>;
}

function ImageBlock({ messageId, block }: { messageId: string; block: Extract<ContentBlock, { type: 'image' }> }) {
  const data = block.base64 || getImage(messageId) || '';
  if (!data) {
    return <div className="text-xs text-ink-500 italic">(image removed — not persisted across reloads)</div>;
  }
  return (
    <img
      src={`data:${block.mediaType};base64,${data}`}
      alt="Uploaded receipt"
      className="max-h-48 rounded-lg border border-ink-300 object-contain"
    />
  );
}

function MessageBubble({
  group,
  message,
  acceptedSet,
  toolOutputs,
  hasLaterUserMessage,
  onAcceptDraft,
  onMarkDraftAccepted,
  onAcceptAll,
  onDiscardDrafts,
  onExecutePlan,
}: {
  group: Group;
  message: ChatMessage;
  acceptedSet: Set<number>;
  toolOutputs: Map<string, ToolOutcome>;
  hasLaterUserMessage: boolean;
  onAcceptDraft: (messageId: string, draftIndex: number) => void;
  onMarkDraftAccepted: (messageId: string, draftIndex: number) => void;
  onAcceptAll: (messageId: string) => void;
  onDiscardDrafts: (messageId: string) => void;
  onExecutePlan: (messageId: string) => void;
}) {
  const isUser = message.role === 'user';
  const hasVisibleBlocks = message.blocks.some((b) => b.type === 'text' || b.type === 'image' || b.type === 'tool_use');
  if (isUser && !hasVisibleBlocks) return null;
  const wrapper = isUser ? 'items-end' : 'items-start';
  const bubble = isUser
    ? 'bg-accent-500/20 border-accent-500/40'
    : 'bg-ink-100/60 border-ink-300';

  const drafts = message.drafts ?? [];
  const pendingCount = drafts.filter((_, i) => !acceptedSet.has(i)).length;
  const hasBubbleContent = message.blocks.some((b) => b.type === 'text' || b.type === 'image');
  const showExecuteButton =
    !isUser &&
    message.sentInPlanMode === true &&
    message.drafts == null &&
    !hasLaterUserMessage;

  return (
    <div className={`flex flex-col gap-2 ${wrapper}`}>
      {hasBubbleContent && (
        <div className={`max-w-[85%] break-words rounded-2xl border px-3 py-2 text-sm text-ink-800 ${bubble}`}>
          {message.blocks.map((b, i) => {
            if (b.type === 'text') return <TextBlock key={i} block={b} />;
            if (b.type === 'image') return <ImageBlock key={i} messageId={message.id} block={b} />;
            return null;
          })}
          {message.usage && (
            <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-ink-500">
              {message.usage.inputTokens}→{message.usage.outputTokens} tok
              {message.costUsdMicros !== undefined && (
                <span> · ${microUsdToUsd(message.costUsdMicros).toFixed(4)}</span>
              )}
              {message.modelId && <span> · {message.modelId}</span>}
              {message.elapsedMs !== undefined && (
                <span> · {(message.elapsedMs / 1000).toFixed(1)}s</span>
              )}
            </div>
          )}
        </div>
      )}
      {message.blocks
        .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => {
          const outcome = toolOutputs.get(b.id);
          return (
            <ToolUseBubble
              key={b.id}
              name={b.name}
              input={b.input}
              output={outcome?.output}
              isError={outcome?.isError}
            />
          );
        })}
      {showExecuteButton && (
        <div className="flex max-w-[85%] items-center gap-3">
          <Button size="sm" variant="primary" onClick={() => onExecutePlan(message.id)}>
            Execute this plan
          </Button>
          <span className="text-xs text-ink-500">
            or keep iterating in the composer below.
          </span>
        </div>
      )}
      {drafts.length > 0 && (
        <div className="w-full max-w-[85%] space-y-2">
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              group={group}
              accepted={acceptedSet.has(i)}
              onAccept={() => onAcceptDraft(message.id, i)}
              onMarkAccepted={() => onMarkDraftAccepted(message.id, i)}
              onDiscard={() => onDiscardDrafts(message.id)}
            />
          ))}
          {drafts.length > 1 && pendingCount > 1 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onAcceptAll(message.id)}
                className="text-xs text-accent-400 underline decoration-dotted underline-offset-2 hover:text-accent-300"
              >
                Accept all {pendingCount} remaining
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MessageList({
  group,
  messages,
  acceptedDraftIndexes,
  onAcceptDraft,
  onMarkDraftAccepted,
  onAcceptAll,
  onDiscardDrafts,
  onExecutePlan,
  pendingText,
  pendingPhase,
  pendingTurnStartedAt,
  pendingPhaseStartedAt,
}: Props) {
  const pendingActive = pendingText !== null && pendingText !== undefined;
  if (messages.length === 0 && !pendingActive) {
    return (
      <div className="rounded-xl border border-dashed border-ink-300 bg-ink-100/30 px-4 py-8 text-sm text-ink-500">
        <p className="mb-2 font-medium text-ink-700">How to use the AI assistant</p>
        <ul className="list-disc space-y-1 pl-5 text-left">
          <li>Attach a receipt photo with <span className="text-ink-700">+ attach receipt</span>, or paste an image into the box below.</li>
          <li>Or describe an expense in plain English — name the payer, amount, currency, and what it was for.</li>
          <li>Review the draft(s) it returns and accept the ones that look right.</li>
        </ul>
      </div>
    );
  }

  const toolOutputs = buildToolOutputMap(messages);
  return (
    <div className="space-y-3">
      {messages.map((m, idx) => {
        const hasLaterUserMessage = messages
          .slice(idx + 1)
          .some((later) => later.role === 'user');
        return (
          <MessageBubble
            key={m.id}
            group={group}
            message={m}
            acceptedSet={acceptedDraftIndexes[m.id] ?? new Set<number>()}
            toolOutputs={toolOutputs}
            hasLaterUserMessage={hasLaterUserMessage}
            onAcceptDraft={onAcceptDraft}
            onMarkDraftAccepted={onMarkDraftAccepted}
            onAcceptAll={onAcceptAll}
            onDiscardDrafts={onDiscardDrafts}
            onExecutePlan={onExecutePlan}
          />
        );
      })}
      {pendingActive &&
        pendingTurnStartedAt != null &&
        pendingPhaseStartedAt != null && (
          <PendingBubble
            text={pendingText as string}
            phase={pendingPhase}
            turnStartedAt={pendingTurnStartedAt}
            phaseStartedAt={pendingPhaseStartedAt}
          />
        )}
    </div>
  );
}
