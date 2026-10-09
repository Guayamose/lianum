"""Private fixed current-generation V8 W39 task data, no caller selectors/paths/commands/receipts.

The shared ledger watchdog owns process/resource/lock/cleanup invariants.
This module does not execute a task or publish a release.
"""
from collections import namedtuple
from workspace import ROOT, DEV, RUNTIME

_FLAT = RUNTIME / "omnichain-flat-profile/flat-wallet"
_Task = namedtuple("_Task", "wrapper entry output reports schema lock_mode exec_args output_names")
_W39 = _Task(
    wrapper=ROOT / "scripts/development/native_value_w39.py",
    entry=_FLAT / "scripts/prepare-development-native-value-w39-v5.mjs",
    output=_FLAT / ".local/development-native-value-w39/v8",
    reports=DEV / "reports/native-value-dev-w39-build-v8",
    schema="LIANUM_NEW_PC15_W39_RESOURCE_RECEIPT_V8",
    lock_mode="NEW_PC15_W39_GENERATION_V8",
    exec_args=("--max-old-space-size=384",),
    output_names=("program.json", "key.vk", "withdraw_output.sol", "compiled.json",
                  "generation.json", "compilation.json", "source-pins.json", "receipt.json"),
)


def fixed_w39_task():
    # Identity of the single retained object, never a caller-shaped task.
    return _W39
