import { Button } from './ui/Button';
import { Dialog } from './ui/Dialog';

interface Props {
  tool: string;
  input: unknown;
  groupName: string;
  open: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

const TOOL_LABEL: Record<string, string> = {
  add_member: 'add a new member',
};

function labelFor(tool: string): string {
  return TOOL_LABEL[tool] ?? `run ${tool}`;
}

export function ToolConfirmDialog({ tool, input, groupName, open, onAllow, onDeny }: Props) {
  const preview = JSON.stringify(input, null, 2);
  return (
    <Dialog open={open} onClose={onDeny} title="Assistant action" widthClass="max-w-md">
      <div className="space-y-3 text-sm text-ink-700">
        <p>
          The assistant wants to <strong>{labelFor(tool)}</strong> in{' '}
          <em>{groupName}</em>.
        </p>
        <pre className="max-h-48 overflow-auto rounded-md border border-ink-300 bg-ink-100/50 p-2 font-mono text-xs text-ink-700">
          {preview}
        </pre>
        <p className="text-xs text-ink-500">
          Denying returns the request as an error to the assistant; it will continue without
          performing this action.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onDeny}>Deny</Button>
          <Button variant="primary" onClick={onAllow}>
            Allow
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
