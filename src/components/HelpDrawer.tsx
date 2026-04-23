import { Drawer } from './ui/Drawer';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDrawer({ open, onClose }: HelpDrawerProps) {
  return (
    <Drawer open={open} title="How to use TWC" onClose={onClose} side="right">
      <div className="space-y-[26px] px-[26px] py-[42px] md:px-[42px]">
        <Section heading="Quickstart">
          <p>
            TWC splits bills across a group. Create a group, add members, log who
            paid for what, and TWC figures out the minimal set of transfers that
            settles everyone up.
          </p>
          <p>
            Everything runs in your browser. No backend, no sign-up. Data lives in
            <span className="font-mono text-ink-800"> localStorage</span> on this
            device.
          </p>
        </Section>

        <Section heading="Groups">
          <p>
            Create a group for a trip, a flat, or any context where people share
            costs. Each group has its own base currency — settlements are
            expressed in that currency.
          </p>
          <p>
            Add members from the group header. Names are stored as IDs, so two
            people can share a first name without confusing the split.
          </p>
        </Section>

        <Section heading="Expenses">
          <p>
            Each expense records: who paid, the amount in its native currency,
            and a split rule. Four split modes ship out of the box:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-ink-700">
            <li><b>Even</b> — equal shares among participants.</li>
            <li><b>Shares</b> — weighted (e.g. Alice: 2, Bob: 1).</li>
            <li><b>Exact</b> — per-person amounts that must sum to the total.</li>
            <li><b>Percent</b> — percentages that must sum to 100.</li>
          </ul>
          <p>
            Non-base-currency expenses need an FX rate. TWC remembers the last
            rate you entered for each currency pair.
          </p>
        </Section>

        <Section heading="Settlement">
          <p>
            Step three shows three cards:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-ink-700">
            <li>
              <b>Balances</b> — each member's net position in the base currency.
              Positive = they're owed money; negative = they owe.
            </li>
            <li>
              <b>Transfers</b> — the smallest set of payments that clears every
              balance. Click <b>Edit</b> to reroute, merge, or manually adjust
              any transfer. A live imbalance banner warns if your edits no
              longer fully settle the group. Click <b>Reset to auto</b> to
              revert to the computed plan.
            </li>
            <li>
              <b>Summary</b> — plain-text breakdown including the expense list,
              balances, and transfers. Click <b>Copy</b> to paste it into
              WhatsApp, Slack, Discord, Telegram, or SMS in one shot.
            </li>
          </ul>
          <p>
            If you add, edit, or delete an expense after customising transfers,
            a staleness banner appears on the Transfers card. Either reset to
            auto or re-edit to re-balance.
          </p>
        </Section>

        <Section heading="Chat assistant">
          <p>
            The chat panel (<span className="font-mono text-ink-800">⌘K</span> /
            <span className="font-mono text-ink-800"> Ctrl+K</span>) takes photos
            of receipts or free-form text and proposes draft expenses for you
            to review before they hit the group. Accept all, accept some, or
            discard them.
          </p>
          <p>
            Three provider options:
          </p>
          <ul className="list-disc pl-6 space-y-1 text-ink-700">
            <li><b>Anthropic</b> — bring your own Claude API key.</li>
            <li><b>OpenAI</b> — bring your own OpenAI API key.</li>
            <li>
              <b>Local</b> — point at any OpenAI-compatible server you run
              yourself (Ollama, LM Studio, vLLM, llama.cpp). No outbound
              traffic, no third-party cost.
            </li>
          </ul>
        </Section>

        <Section heading="Security &amp; passphrase vault">
          <p>
            TWC is published on a shared GitHub Pages origin, which means
            sibling sites under the same user can read this site's
            <span className="font-mono text-ink-800"> localStorage</span> in
            theory.
          </p>
          <p>
            The passphrase vault mitigates that: set a passphrase under{' '}
            <b>Settings → Security</b> and TWC will encrypt any stored API key
            at rest with AES-GCM-256 keyed by PBKDF2-SHA256. The derived key
            lives only in memory for the session. Your passphrase is never
            persisted.
          </p>
        </Section>

        <Section heading="Currencies &amp; FX">
          <p>
            Money is stored as integer minor units (cents, yen, won) so rounding
            is predictable. FX conversion rounds to the nearest minor unit of
            the destination currency.
          </p>
          <p>
            Supported: SGD, MYR, USD, KRW, JPY, TWD, EUR, GBP, THB.
          </p>
        </Section>
      </div>
    </Drawer>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="font-display text-[26px] leading-none tracking-wide text-ink-800">
        {heading}
      </h3>
      <div className="space-y-3 text-[16px] leading-relaxed text-ink-600">{children}</div>
    </section>
  );
}
