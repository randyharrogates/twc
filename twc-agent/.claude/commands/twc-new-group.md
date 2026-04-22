---
description: Create a new group file under data/groups/
argument-hint: <name> <baseCurrency> <member1> <member2> [member3...]
---

Create a new group. Arguments: $ARGUMENTS

Steps:

1. Parse `$ARGUMENTS`. The first token is the group name (quote it if it
   contains spaces). The second token is the base currency (must be one
   of: SGD MYR USD KRW JPY TWD EUR GBP THB). Everything after that is a
   member name. Require at least one member.

2. Derive the group id from the name: lowercase, replace non-alphanumeric
   runs with `-`, strip leading/trailing `-`. Example: `"Tokyo trip"` →
   `tokyo-trip`. If `data/groups/<id>.json` already exists, ask the user
   whether to pick a different id.

3. Assign each member a UUID-ish id (format: `m_<8 hex chars>`) so two
   members with the same name don't collide.

4. Build the group object in memory:
   ```
   {
     "id": "<slug>",
     "version": 1,
     "name": "<original name>",
     "baseCurrency": "<code>",
     "createdAt": <now ms>,
     "members": [ { "id": "m_xxxx", "name": "<name>" }, ... ],
     "expenses": [],
     "rateHints": {}
   }
   ```

5. Validate against `data/.schema/group.json` mentally (or `Read` it if
   unsure). Then `Write` the file to `data/groups/<id>.json` as pretty
   JSON (2-space indent, trailing newline).

6. Report: the path written and the member ids. Suggest the user run
   `/twc-add-expense <id>` next.

**Do not** add placeholder expenses. Leave `expenses: []` for the user.
