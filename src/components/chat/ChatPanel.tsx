import { useEffect, useMemo, useRef, useState } from 'react';
import type { CurrencyCode, Group, Member } from '../../types';
import type { AgentClient } from '../../lib/llm/agent';
import { runTurn } from '../../lib/llm/agent';
import type { AgentPhase, ChatMessage, ContentBlock, ModelId } from '../../lib/llm/types';
import { newId } from '../../lib/id';
import { AnthropicClient } from '../../lib/llm/anthropicClient';
import { OpenAIClient } from '../../lib/llm/openaiClient';
import { LocalClient } from '../../lib/llm/localClient';
import {
  AuthError,
  LocalEndpointUnreachableError,
  NetworkError,
  ProviderRateLimitError,
  TruncationError,
  VaultLockedError,
} from '../../lib/llm/errors';
import { keyVault } from '../../lib/keyVault';
import { UnlockDialog } from '../UnlockDialog';
import { buildAgentSystemPrompt } from '../../lib/llm/prompt';
import { preflight, estimateCostMicros } from '../../lib/llm/preflight';
import { pruneHistory } from '../../lib/llm/conversation';
import { getModel, MODELS, DEFAULT_MODEL_ID, setLocalModelRuntime } from '../../lib/llm/models';
import { evaluatePolicy, type Provider } from '../../lib/policy';
import { usageToMicroUsd } from '../../lib/llm/cost';
import { createAgentExecutor, primaryToolSpecs } from '../../lib/llm/tools/registry';
import { parseSubmitDraftsContent, SUBMIT_DRAFTS_TOOL_NAME } from '../../lib/llm/tools/submit_drafts';
import {
  useAppStore,
  useActiveConversation,
  useSettings,
} from '../../state/store';
import { putImage, rehydrateHistoryBlocks } from '../../state/imageCache';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { MessageList } from './MessageList';
import { Composer, type SendResult } from './Composer';
import { TokenCostBar } from './TokenCostBar';
import { InjectionBanner } from './InjectionBanner';
import { ChatToolbar } from './ChatToolbar';
import { dispatchSlashCommand } from './slashCommands';

interface Props {
  group: Group;
  open: boolean;
  onClose: () => void;
  onConsentNeeded: (provider: Provider, resume: () => Promise<void>) => void;
  onToolConsentNeeded: (req: { tool: string; input: unknown; groupName: string }) => Promise<'allow' | 'deny'>;
  onRateInputNeeded: (req: { from: CurrencyCode; to: CurrencyCode; suggested?: number }) => Promise<{ rate: number | null }>;
  onPayerPromptNeeded: (req: {
    description: string;
    amountMinor: number;
    currency: CurrencyCode;
    members: Member[];
  }) => Promise<{ payerId: string | null }>;
  onOpenSettings: () => void;
}

type ActiveProvider = Provider;

function resolveModel(settings: ReturnType<typeof useSettings>): ModelId {
  if (settings.modelOverride) return settings.modelOverride;
  return DEFAULT_MODEL_ID[settings.llmProvider];
}

export function ChatPanel({
  group,
  open,
  onClose,
  onConsentNeeded,
  onToolConsentNeeded,
  onRateInputNeeded,
  onPayerPromptNeeded,
  onOpenSettings,
}: Props) {
  const settings = useSettings();
  const conversation = useActiveConversation(group.id);
  const store = useAppStore;

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<Record<string, Set<number>>>({});
  const [pending, setPending] = useState<{
    text: string;
    phase: AgentPhase | null;
    turnStartedAt: number;
    phaseStartedAt: number;
  } | null>(null);
  const [unlockPending, setUnlockPending] = useState<{ resume: () => Promise<void> } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const provider: ActiveProvider = settings.llmProvider;
  const modelId = resolveModel(settings);
  const planMode = settings.planMode;

  // Push user-configured local-model capacity into the module-level cache that
  // `getModel('local')` reads. One-way write: settings → library. No effect writes
  // back into the store, so there's no render loop.
  useEffect(() => {
    setLocalModelRuntime({
      contextWindowTokens: settings.localModel.contextWindowTokens,
      maxOutputTokens: settings.localModel.maxOutputTokens,
      supportsVision: settings.localModel.supportsVision,
    });
  }, [
    settings.localModel.contextWindowTokens,
    settings.localModel.maxOutputTokens,
    settings.localModel.supportsVision,
  ]);

  const providerLabel = useMemo(() => {
    const name = MODELS[modelId]?.displayName;
    if (provider === 'anthropic') return name ?? 'Claude';
    if (provider === 'openai') return name ?? 'OpenAI';
    return settings.localModel.modelName || name || 'Local';
  }, [provider, modelId, settings.localModel.modelName]);

  const localConfigured =
    settings.localModel.baseUrl.length > 0 && settings.localModel.modelName.length > 0;
  const keyMissing =
    provider === 'local' ? !localConfigured : !settings.apiKeys[provider];
  const composerDisabled = keyMissing;

  const runSend = async (
    blocks: ContentBlock[],
    options?: { planModeOverride?: boolean },
  ): Promise<SendResult> => {
    setError(null);
    setNotice(null);

    const planModeForTurn = options?.planModeOverride ?? planMode;

    const hasImages = blocks.some((b) => b.type === 'image');
    if (hasImages) {
      const decision = evaluatePolicy(
        { kind: 'uploadImage', provider },
        store.getState().policy,
        store.getState().costTracker,
        Date.now(),
      );
      if (!decision.allow) {
        onConsentNeeded(provider, () => runSend(blocks, options).then(() => undefined));
        return { kind: 'deferred' };
      }
    }

    const model = getModel(modelId as keyof typeof MODELS);
    const tools = primaryToolSpecs(group, planModeForTurn);
    const systemText = buildAgentSystemPrompt(
      {
        members: group.members,
        baseCurrency: group.baseCurrency,
        rateHints: group.rateHints,
        history: conversation.messages,
        model: modelId as keyof typeof MODELS,
      },
      group.name,
      tools,
      planModeForTurn,
    );
    const systemTokens = Math.ceil(systemText.length / 4);
    const maxResponseTokens = 1024;

    const pre = preflight(
      blocks,
      {
        members: group.members,
        baseCurrency: group.baseCurrency,
        rateHints: group.rateHints,
        history: conversation.messages,
        model: modelId as keyof typeof MODELS,
      },
      systemTokens,
      maxResponseTokens,
    );
    if (!pre.ok) {
      setError(pre.reason ?? 'Preflight check failed.');
      return { kind: 'deferred' };
    }

    const estCost = estimateCostMicros(pre.estimatedPromptTokens, maxResponseTokens, model);
    const sendDecision = evaluatePolicy(
      { kind: 'sendMessage', provider, estCostMicros: estCost },
      store.getState().policy,
      store.getState().costTracker,
      Date.now(),
    );
    if (!sendDecision.allow) {
      setError(sendDecision.reason);
      return { kind: 'deferred' };
    }

    const rate = store.getState().consumeRateToken(Date.now());
    if (!rate.ok) {
      setError(
        `Rate-limited (${rate.reason}). Try again in ~${Math.ceil(rate.retryAfterMs / 1000)}s.`,
      );
      return { kind: 'deferred' };
    }

    const userMessageId = newId();
    const userMsg: ChatMessage = {
      id: userMessageId,
      role: 'user',
      blocks,
      createdAt: Date.now(),
    };
    for (const b of blocks) {
      if (b.type === 'image') putImage(userMessageId, b.base64);
    }
    store.getState().appendMessage(group.id, userMsg);

    const controller = new AbortController();
    abortRef.current = controller;
    const turnStartedAt = performance.now();
    setPending({ text: '', phase: null, turnStartedAt, phaseStartedAt: turnStartedAt });
    try {
      let apiKey = '';
      if (provider !== 'local') {
        const storedKey = settings.apiKeys[provider];
        if (!storedKey) {
          setError(`${provider} API key is missing. Add it in Settings → Providers.`);
          return { kind: 'sent' };
        }
        try {
          apiKey = await keyVault.decryptKey(storedKey);
        } catch (err) {
          if (err instanceof VaultLockedError) {
            setUnlockPending({
              resume: () => runSend(blocks, options).then(() => undefined),
            });
            return { kind: 'deferred' };
          }
          throw err;
        }
      } else if (settings.apiKeys.local && settings.apiKeys.local.length > 0) {
        try {
          apiKey = await keyVault.decryptKey(settings.apiKeys.local);
        } catch (err) {
          if (err instanceof VaultLockedError) {
            setUnlockPending({
              resume: () => runSend(blocks, options).then(() => undefined),
            });
            return { kind: 'deferred' };
          }
          throw err;
        }
      }
      const client: AgentClient =
        provider === 'anthropic'
          ? new AnthropicClient({
              apiKey,
              maxRetries: settings.retryConfig.maxRetries,
              baseDelayMs: settings.retryConfig.baseDelayMs,
            })
          : provider === 'openai'
            ? new OpenAIClient({
                apiKey,
                maxRetries: settings.retryConfig.maxRetries,
                baseDelayMs: settings.retryConfig.baseDelayMs,
              })
            : new LocalClient({
                baseUrl: settings.localModel.baseUrl,
                modelName: settings.localModel.modelName,
                apiKey: apiKey.length > 0 ? apiKey : undefined,
                maxRetries: settings.retryConfig.maxRetries,
                baseDelayMs: settings.retryConfig.baseDelayMs,
              });
      const pruned = pruneHistory(conversation.messages, modelId as keyof typeof MODELS);
      const history = rehydrateHistoryBlocks(pruned);
      const executor = createAgentExecutor(group, {
        addMember: (gid, name) => store.getState().addMember(gid, name),
        ratePrompter: {
          requestRate: (req) => onRateInputNeeded(req),
        },
        payerPrompter: {
          requestPayer: (req) => onPayerPromptNeeded(req),
        },
        setRateHint: (gid, code, rate) => store.getState().setRateHint(gid, code, rate),
      });

      const turn = await runTurn({
        client,
        system: systemText,
        history: history.map((m) => ({ role: m.role, blocks: m.blocks })),
        userBlocks: blocks,
        tools,
        executor,
        prompter: {
          decide: async ({ tool, input }) =>
            onToolConsentNeeded({ tool, input, groupName: group.name }),
        },
        model: modelId as keyof typeof MODELS,
        reasoningEffort: settings.reasoningEffort,
        onPartialText: (t) =>
          setPending((p) =>
            p
              ? { ...p, text: t }
              : {
                  text: t,
                  phase: null,
                  turnStartedAt,
                  phaseStartedAt: turnStartedAt,
                },
          ),
        onPhase: (phase) =>
          setPending((p) => {
            const base = p ?? {
              text: '',
              phase: null,
              turnStartedAt,
              phaseStartedAt: turnStartedAt,
            };
            const prevKey = phaseKey(base.phase);
            const nextKey = phaseKey(phase);
            const phaseStartedAt =
              prevKey === nextKey ? base.phaseStartedAt : performance.now();
            return { ...base, phase, phaseStartedAt };
          }),
        signal: controller.signal,
      });

      const elapsedMs = Math.round(performance.now() - turnStartedAt);

      // Persist assistant messages + tool_result messages (skip the echoed history prefix)
      const newMessages = turn.messages.slice(history.length + 1);
      const submit = extractSubmitDrafts(turn.toolTrace);
      const drafts = submit?.drafts ?? null;
      const submitText = submit?.assistantText ?? '';

      const ids = newMessages.map(() => newId());
      const lastAssistantIdx = lastAssistantIndex(newMessages);
      const lastAssistantId = lastAssistantIdx >= 0 ? ids[lastAssistantIdx] : newId();

      let costMicros = 0;
      if (turn.usage.inputTokens > 0 || turn.usage.outputTokens > 0) {
        costMicros = usageToMicroUsd(turn.usage, model);
        store
          .getState()
          .recordCost(lastAssistantId, turn.usage, modelId as keyof typeof MODELS, Date.now());
      }

      const lastAssistantHasText =
        lastAssistantIdx >= 0 &&
        newMessages[lastAssistantIdx].blocks.some((b) => b.type === 'text');

      for (let i = 0; i < newMessages.length; i++) {
        const m = newMessages[i];
        const isLastAssistant = i === lastAssistantIdx;
        // If the model only emitted drafts via submit_drafts (no trailing text block),
        // promote submit_drafts.assistantText to a text block so the user sees the
        // explanation. Defensive against models that don't re-emit text after tool_result.
        const blocks: ContentBlock[] =
          isLastAssistant && !lastAssistantHasText && submitText.length > 0
            ? [{ type: 'text', text: submitText }, ...m.blocks]
            : m.blocks;
        const persisted: ChatMessage = {
          id: ids[i],
          role: m.role,
          blocks,
          createdAt: Date.now(),
          ...(isLastAssistant
            ? {
                usage: turn.usage,
                costUsdMicros: costMicros,
                drafts: drafts ?? undefined,
                modelId,
                elapsedMs,
                sentInPlanMode: planModeForTurn,
              }
            : {}),
        };
        store.getState().appendMessage(group.id, persisted);
      }

      if (turn.truncatedOutput) {
        setError(
          'Assistant response too long even at max tokens — split the request into smaller batches.',
        );
      } else if (turn.truncatedLoop) {
        setError(
          'Assistant ran out of tool rounds (32). Try breaking the request into fewer expenses at a time.',
        );
      }
      return { kind: 'sent' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        store.getState().appendMessage(group.id, {
          id: newId(),
          role: 'assistant',
          blocks: [{ type: 'text', text: '(cancelled)' }],
          createdAt: Date.now(),
        });
        return { kind: 'sent' };
      }
      const message = formatErrorMessage(err);
      setError(message);
      store.getState().appendMessage(group.id, {
        id: newId(),
        role: 'assistant',
        blocks: [{ type: 'text', text: message }],
        createdAt: Date.now(),
      });
      return { kind: 'sent' };
    } finally {
      setPending(null);
      if (abortRef.current === controller) abortRef.current = null;
    }
  };

  const cancelInFlight = () => {
    abortRef.current?.abort();
  };

  const handleSlashCommand = (command: string): { handled: boolean } => {
    setError(null);
    setNotice(null);
    const result = dispatchSlashCommand(command, {
      currentModelId: modelId,
      planMode,
      apiKeys: settings.apiKeys,
      localConfigured,
      setModelOverride: (id) => store.getState().setModelOverride(id),
      setLLMProvider: (p) => store.getState().setLLMProvider(p),
      setPlanMode: (v) => store.getState().setPlanMode(v),
    });
    if (!result.handled) return { handled: false };
    if (result.kind === 'success') setNotice(result.message);
    else setError(result.message);
    return { handled: true };
  };

  const togglePlanMode = () => {
    setError(null);
    setNotice(null);
    const next = !planMode;
    store.getState().setPlanMode(next);
    setNotice(next ? 'Plan mode on.' : 'Plan mode off.');
  };

  const handleSelectModel = (id: ModelId) => {
    setError(null);
    setNotice(null);
    const meta = MODELS[id];
    store.getState().setModelOverride(id);
    store.getState().setLLMProvider(meta.provider);
    const providerLabel =
      meta.provider === 'anthropic' ? 'Anthropic' : meta.provider === 'openai' ? 'OpenAI' : 'Local';
    const isLocal = meta.provider === 'local';
    const missing = isLocal ? !localConfigured : !settings.apiKeys[meta.provider];
    if (!missing) {
      setNotice(`Switched to ${meta.displayName} (${providerLabel}).`);
      return;
    }
    setNotice(
      isLocal
        ? `Switched to ${meta.displayName} (Local) — set the Base URL and model name in Settings to send.`
        : `Switched to ${meta.displayName} (${providerLabel}) — add an API key in Settings to send.`,
    );
  };

  const executePlan = (messageId: string) => {
    const msg = conversation.messages.find((m) => m.id === messageId);
    if (!msg || msg.sentInPlanMode !== true) return;
    void runSend([{ type: 'text', text: 'Execute the plan above.' }], {
      planModeOverride: false,
    });
  };

  const acceptDraft = (messageId: string, draftIndex: number) => {
    const ids = store.getState().acceptDrafts(group.id, messageId, [draftIndex]);
    if (ids.length > 0) {
      setAccepted((prev) => {
        const next = new Set(prev[messageId] ?? []);
        next.add(draftIndex);
        return { ...prev, [messageId]: next };
      });
    }
  };

  const markDraftAccepted = (messageId: string, draftIndex: number) => {
    setAccepted((prev) => {
      const next = new Set(prev[messageId] ?? []);
      next.add(draftIndex);
      return { ...prev, [messageId]: next };
    });
  };

  const acceptAll = (messageId: string) => {
    const msg = conversation.messages.find((m) => m.id === messageId);
    if (!msg?.drafts) return;
    const alreadyAccepted = accepted[messageId] ?? new Set<number>();
    const toAccept: number[] = [];
    msg.drafts.forEach((_, i) => {
      if (!alreadyAccepted.has(i)) toAccept.push(i);
    });
    store.getState().acceptDrafts(group.id, messageId, toAccept);
    setAccepted((prev) => ({
      ...prev,
      [messageId]: new Set([...Array.from(alreadyAccepted), ...toAccept]),
    }));
  };

  const discardDrafts = (messageId: string) => {
    store.getState().discardDrafts(group.id, messageId);
  };

  const providerDisplay =
    provider === 'anthropic' ? 'Anthropic' : provider === 'openai' ? 'OpenAI' : 'Local';

  return (
    <Dialog open={open} onClose={onClose} title="✨ AI assistant" widthClass="max-w-2xl">
      <div className="space-y-3">
        {!conversation.injectionBannerDismissed && (
          <InjectionBanner onDismiss={() => store.getState().dismissInjectionBanner(group.id)} />
        )}
        <TokenCostBar />
        <div className="max-h-[45vh] overflow-y-auto pr-1 sm:max-h-[50vh]">
          <MessageList
            group={group}
            messages={conversation.messages}
            acceptedDraftIndexes={accepted}
            onAcceptDraft={acceptDraft}
            onMarkDraftAccepted={markDraftAccepted}
            onAcceptAll={acceptAll}
            onDiscardDrafts={discardDrafts}
            onExecutePlan={executePlan}
            pendingText={pending?.text ?? null}
            pendingPhase={pending?.phase ?? null}
            pendingTurnStartedAt={pending?.turnStartedAt ?? null}
            pendingPhaseStartedAt={pending?.phaseStartedAt ?? null}
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-400/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-emerald-400/50 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </div>
        )}
        {keyMissing && (
          <div className="flex items-start justify-between gap-3 rounded-md border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <div>
              <div className="font-medium text-amber-100">
                {provider === 'local' ? 'Local provider not configured' : `${providerDisplay} API key missing`}
              </div>
              <div className="mt-0.5 text-amber-200/80">
                {provider === 'local'
                  ? 'Set the Base URL and model name in Settings → Providers → Local before sending.'
                  : `Add your ${providerDisplay} key in Settings → Providers to enable free-form input and receipt photos.`}
              </div>
            </div>
            <Button size="sm" variant="primary" onClick={onOpenSettings}>
              Open Settings
            </Button>
          </div>
        )}
        <ChatToolbar
          modelId={modelId}
          planMode={planMode}
          apiKeys={settings.apiKeys}
          localConfigured={localConfigured}
          onSelectModel={handleSelectModel}
          onTogglePlanMode={togglePlanMode}
          disabled={pending !== null}
        />
        <Composer
          disabled={composerDisabled}
          onSend={runSend}
          providerLabel={providerLabel}
          cancelling={pending !== null}
          onCancel={cancelInFlight}
          onTogglePlanMode={togglePlanMode}
          onSlashCommand={handleSlashCommand}
        />
        {conversation.messages.length > 0 && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => store.getState().clearConversation(group.id)}>
              Clear conversation
            </Button>
          </div>
        )}
      </div>
      <UnlockDialog
        open={unlockPending !== null}
        reason="send"
        onClose={() => setUnlockPending(null)}
        onUnlocked={() => {
          const resume = unlockPending?.resume;
          setUnlockPending(null);
          if (resume) void resume();
        }}
      />
    </Dialog>
  );
}

function formatErrorMessage(err: unknown): string {
  const suffix = (id?: string) => (id ? ` [req ${id}]` : '');
  if (err instanceof LocalEndpointUnreachableError) {
    return (
      'Your browser blocked the connection to your local model (mixed content or PNA). ' +
      'Either run TWC locally (npm run dev) or use Chrome/Edge. ' +
      'See the "Run with Ollama" section of the README.'
    );
  }
  if (err instanceof AuthError) return `Auth error: ${err.message}. Check your API key in Settings.${suffix(err.requestId)}`;
  if (err instanceof ProviderRateLimitError) {
    return `Provider rate-limited. Retry in ~${Math.ceil(err.retryAfterMs / 1000)}s.${suffix(err.requestId)}`;
  }
  if (err instanceof TruncationError) {
    return `Assistant response too long — split the request into smaller batches.${suffix(err.requestId)}`;
  }
  if (err instanceof NetworkError) return `Network error: ${err.message}${suffix(err.requestId)}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

function extractSubmitDrafts(
  toolTrace: Array<{ name: string; output: string; isError: boolean }>,
): { drafts: import('../../lib/llm/types').ExpenseDraft[]; assistantText: string } | null {
  const submit = toolTrace.find((t) => t.name === SUBMIT_DRAFTS_TOOL_NAME && !t.isError);
  if (!submit) return null;
  const parsed = parseSubmitDraftsContent(submit.output);
  if (!parsed) return null;
  return { drafts: parsed.drafts, assistantText: parsed.assistantText };
}

function lastAssistantIndex(messages: Array<{ role: 'user' | 'assistant' }>): number {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'assistant') return i;
  return -1;
}

function phaseKey(phase: AgentPhase | null | undefined): string {
  if (!phase) return 'none';
  if (phase.kind === 'calling_tool') return `calling_tool:${phase.name}`;
  if (phase.kind === 'tool_done') return `tool_done:${phase.name}`;
  return phase.kind;
}
