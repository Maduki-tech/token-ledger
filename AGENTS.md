# token-ledger

A Claude Code plugin. Commands, file roles and the cost model are in `README.md`; read its "How cost is worked out" before touching attribution in `scripts/usage.py`.

## Contract

`scripts/usage.py` prints JSON that three consumers read: the pane (`hooks/register.tsx`), the dashboard (`web/src`, via `scripts/server.py`) and the test fixture `ANSWERS` in `tests/ledger.test.tsx`. Its shape is typed in `types/index.d.ts`. A change to the output lands in all of them in one change.

## Invariants

- **Every dollar lands somewhere**: tool call costs plus the breakdown parts equal what the session's requests cost. `selftest` asserts it; keep it green.
- Python is standard library only; the user installs nothing but `python3`.
- `server.py` binds 127.0.0.1 only, and nothing leaves the machine.
- `web/dist` is the shipped dashboard, built from `web/src` and committed; `server.py` serves exactly the files it lists in `STATIC`.
- `PRICES` is hand-kept; order matters, as the first matching prefix wins (`claude-opus-5-5` before `claude-opus-5`).

## Done

A change is done when `web/dist` is rebuilt (`npm run build` in `web/`) if `web/src` changed, and `python3 scripts/usage.py selftest`, `claude plugin test .` and `claude plugin validate .` all pass.
