"""Linux inventory for the fixed ledger watchdog's one original Popen child.

No authority is derived from names, argv, matching UIDs or reparenting alone.
Unknown adopted children latch unconfirmed cleanup and are never signalled.
This draft has not been executed.
"""
import ctypes
import json
import os
from pathlib import Path
import re
import select
import signal
import subprocess
import time


class LedgerProcessError(Exception):
    pass


def require(value, code):
    if not value:
        raise LedgerProcessError(code)


def proc_stat(pid):
    path = Path(f"/proc/{pid}/stat")
    value = path.read_text()
    require(value.startswith(str(pid) + " (") and ") " in value, "LEDGER_PROCESS_STAT_INVALID")
    fields = value.rsplit(") ", 1)[1].split()
    require(len(fields) >= 22, "LEDGER_PROCESS_STAT_INVALID")
    return {"pid": pid, "ppid": int(fields[1]), "pgrp": int(fields[2]),
            "session": int(fields[3]), "startTimeTicks": fields[19], "state": fields[0]}


def identity(pid, *, allow_terminal_read=False):
    before = proc_stat(pid)
    proc_owner = Path(f"/proc/{pid}/stat").stat().st_uid
    status = Path(f"/proc/{pid}/status").read_text()
    uids = re.search(r"^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$", status, re.M)
    require(uids and all(int(value) == os.getuid() for value in uids.groups()), "LEDGER_PROCESS_UID_CHANGED")
    after = proc_stat(pid)
    require(all(before[key] == after[key] for key in before if key != "state"), "LEDGER_PROCESS_IDENTITY_CHANGED")
    # Linux resets proc inode ownership to root after the mm is destroyed.
    # Only callers retaining an authenticated original may read that terminal
    # state for absence/reap; UID4 and all original identity joins still apply.
    if not (proc_owner == os.getuid() or allow_terminal_read and after["state"] in ("Z", "X") and proc_owner == 0):
        error = LedgerProcessError("LEDGER_PROCESS_PROC_OWNER_CHANGED")
        error.observed_identity = {**after, "uid": os.getuid(), "uids": [int(value) for value in uids.groups()], "rssBytes": 0}
        raise error
    rss = re.search(r"^VmRSS:\s+(\d+)\s+kB$", status, re.M)
    require(rss or after["state"] in ("Z", "X"), "LEDGER_PROCESS_RSS_UNAVAILABLE")
    return {**after, "uid": os.getuid(), "uids": [int(value) for value in uids.groups()],
            "rssBytes": int(rss[1]) * 1024 if rss else 0}


def immutable_equal(before, after):
    return all(before[key] == after[key] for key in ("pid", "pgrp", "session", "startTimeTicks", "uid", "uids"))


def stable_equal(before, after):
    return immutable_equal(before, after) and before["ppid"] == after["ppid"]


def process_table():
    result = {}
    for path in Path("/proc").iterdir():
        if path.name.isdecimal():
            try:
                result[int(path.name)] = proc_stat(int(path.name))
            except (FileNotFoundError, ProcessLookupError):
                continue
    return result


class LedgerOwnedProcesses:
    """Retain the causal original child, then live authenticated descendants.

    The watchdog is a dedicated single-child process. The temporary subreaper
    is local to this process; no system settings, cgroup or other owner changes.
    Newly adopted children lacking an observed authenticated chain remain
    unknown even when their PID/UID/start look plausible.
    """
    def __init__(self):
        self.owner = identity(os.getpid())
        self.child = None
        self.records = {}
        self.unknown = {}
        self.events = []
        self.unsafe = False
        self.active = False
        self.previous_subreaper = None
        self.wait_deadline = None

    def constrain_wait_deadline(self, deadline):
        require(type(deadline) in (int, float) and deadline > 0, "LEDGER_PROCESS_WAIT_DEADLINE")
        self.wait_deadline = deadline if self.wait_deadline is None else min(self.wait_deadline, deadline)

    def event(self, kind, **fields):
        require(len(self.events) < 512, "LEDGER_PROCESS_EVENT_BOUND")
        self.events.append({"kind": kind, **fields})

    def activate(self):
        require(not self.active and self.child is None, "LEDGER_PROCESS_INVENTORY_REUSED")
        require(not any(row["ppid"] == self.owner["pid"] for row in process_table().values()),
                "LEDGER_WRAPPER_PREEXISTING_CHILD")
        libc = ctypes.CDLL(None, use_errno=True)
        before = ctypes.c_int()
        require(libc.prctl(37, ctypes.byref(before), 0, 0, 0) == 0, "LEDGER_SUBREAPER_READ_FAILED")
        require(before.value == 0, "LEDGER_PREEXISTING_SUBREAPER")
        require(libc.prctl(36, 1, 0, 0, 0) == 0, "LEDGER_SUBREAPER_ENABLE_FAILED")
        self.previous_subreaper = before.value
        self.active = True
        self.event("subreaper-enabled", ownerIdentity=self.owner)

    def spawn(self, argv, *, cwd, env):
        """Internal seam only; the production wrapper fixes all arguments."""
        require(self.active and self.child is None, "LEDGER_PROCESS_SPAWN_REUSED")
        owner_pid = self.owner["pid"]
        read_fd, write_fd = os.pipe2(os.O_CLOEXEC)
        def before_exec():
            if ctypes.CDLL(None, use_errno=True).prctl(1, signal.SIGTERM, 0, 0, 0) != 0 or os.getppid() != owner_pid:
                os._exit(125)
            try:
                captured = identity(os.getpid())
                if captured["ppid"] != owner_pid or captured["pgrp"] != captured["pid"] or captured["session"] != captured["pid"]:
                    os._exit(125)
                data = json.dumps(captured, separators=(",", ":")).encode()
                if len(data) > 4096 or os.write(write_fd, data) != len(data):
                    os._exit(125)
                os.close(write_fd)
            except Exception:
                os._exit(125)
        try:
            self.child = subprocess.Popen(argv, cwd=cwd, env=env, start_new_session=True,
                preexec_fn=before_exec, pass_fds=(write_fd,), stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            os.close(write_fd); write_fd = None
            readable, _, _ = select.select([read_fd], [], [], 2)
            require(readable, "LEDGER_ORIGINAL_BIRTH_PIPE_DEADLINE")
            data = os.read(read_fd, 4097)
            require(data and len(data) <= 4096, "LEDGER_ORIGINAL_BIRTH_PIPE_INVALID")
            captured = json.loads(data)
            require(type(captured) is dict and captured.get("pid") == self.child.pid and
                    captured.get("ppid") == owner_pid and captured.get("pgrp") == self.child.pid and
                    captured.get("session") == self.child.pid and captured.get("uid") == os.getuid() and
                    captured.get("uids") == [os.getuid()] * 4, "LEDGER_ORIGINAL_BIRTH_PIPE_INVALID")
            self._retain(captured, origin="ORIGINAL_POPEN_PREEXEC_PIPE", parent_pid=owner_pid)
            return self.child
        except Exception:
            self.unsafe = True
            raise
        finally:
            os.close(read_fd)
            if write_fd is not None:
                os.close(write_fd)

    def _retain(self, captured, *, origin, parent_pid):
        require(len(self.records) < 32, "LEDGER_PROCESS_INVENTORY_BOUND")
        pidfd = None
        try:
            original_child = origin == "ORIGINAL_POPEN_PREEXEC_PIPE" and self.child is not None and captured["pid"] == self.child.pid
            if original_child and self.child.poll() is not None:
                self.records[captured["pid"]] = {"original": captured, "current": captured,
                    "pidfd": None, "gone": True, "origin": origin, "parentPID": parent_pid}
                self.event("retained-original-already-exited", identity=captured, exitCode=self.child.returncode)
                return
            current = identity(captured["pid"], allow_terminal_read=original_child)
            require(stable_equal(captured, current), "LEDGER_PROCESS_ENROLL_IDENTITY_CHANGED")
            if original_child and current["state"] in ("Z", "X"):
                require(self.child.poll() is not None, "LEDGER_ORIGINAL_TERMINAL_REAP_UNCONFIRMED")
                self.records[captured["pid"]] = {"original": captured, "current": current,
                    "pidfd": None, "gone": True, "origin": origin, "parentPID": parent_pid}
                self.event("reaped-original-terminal", identity=current, exitCode=self.child.returncode)
                return
            require(current["state"] not in ("Z", "X"), "LEDGER_TERMINAL_ENROLLMENT_FORBIDDEN")
            pidfd = os.pidfd_open(captured["pid"], 0)
            after = identity(captured["pid"], allow_terminal_read=original_child)
            require(stable_equal(current, after), "LEDGER_PROCESS_ENROLL_IDENTITY_CHANGED")
            if original_child and after["state"] in ("Z", "X"):
                require(self.child.poll() is not None, "LEDGER_ORIGINAL_TERMINAL_REAP_UNCONFIRMED")
                self.records[captured["pid"]] = {"original": captured, "current": after,
                    "pidfd": None, "gone": True, "origin": origin, "parentPID": parent_pid}
                self.event("reaped-original-terminal-after-pidfd", identity=after, exitCode=self.child.returncode)
                return
            require(after["state"] not in ("Z", "X"), "LEDGER_TERMINAL_ENROLLMENT_FORBIDDEN")
            self.records[captured["pid"]] = {"original": captured, "current": after,
                "pidfd": pidfd, "gone": False, "origin": origin, "parentPID": parent_pid}
            pidfd = None
            self.event("retained", identity=captured, origin=origin, parentPID=parent_pid)
        finally:
            if pidfd is not None:
                os.close(pidfd)

    def _read_retained(self, pid):
        record = self.records[pid]
        if record["gone"]:
            return None
        try:
            current = identity(pid, allow_terminal_read=True)
        except (FileNotFoundError, ProcessLookupError):
            record["gone"] = True
            self.event("absent", identity=record["original"])
            return None
        except LedgerProcessError as error:
            # During exit Linux can destroy mm/dumpability before publishing Z.
            # Only this already-retained pidfd may establish kernel termination;
            # an inode mismatch of a still-live process remains a rejection.
            hint = getattr(error, "observed_identity", None)
            if str(error) == "LEDGER_PROCESS_PROC_OWNER_CHANGED" and hint is not None and record["pidfd"] is not None:
                try:
                    require(immutable_equal(record["original"], hint), "LEDGER_RETAINED_IDENTITY_CHANGED")
                    self._ancestry(record, hint)
                    budget = 0 if self.wait_deadline is None else max(0, min(0.020, self.wait_deadline - time.monotonic()))
                    ready, _, _ = select.select([record["pidfd"]], [], [], budget)
                    require(ready, "LEDGER_PROCESS_PROC_OWNER_CHANGED")
                    if self.child is not None and pid == self.child.pid:
                        require(self.child.poll() is not None, "LEDGER_ORIGINAL_TERMINAL_REAP_UNCONFIRMED")
                        record["gone"] = True
                        self.event("pidfd-confirmed-original-exit", identity=hint, exitCode=self.child.returncode)
                        return None
                    current = identity(pid, allow_terminal_read=True)
                    require(current["state"] in ("Z", "X") and immutable_equal(record["original"], current),
                            "LEDGER_RETAINED_TERMINAL_UNCONFIRMED")
                    self._ancestry(record, current)
                    self.event("pidfd-confirmed-retained-terminal", identity=current)
                except Exception:
                    self.unsafe = True
                    raise
            else:
                self.unsafe = True
                raise
        except Exception:
            self.unsafe = True
            raise
        if not immutable_equal(record["original"], current):
            self.unsafe = True
            raise LedgerProcessError("LEDGER_RETAINED_IDENTITY_CHANGED")
        self._ancestry(record, current)
        record["current"] = current
        return current

    def _ancestry(self, record, current):
        if current["ppid"] != record["current"]["ppid"]:
            parent = self.records.get(record["current"]["ppid"])
            if current["ppid"] != self.owner["pid"] or parent is None or self._read_retained(parent["original"]["pid"]) is not None:
                self.unsafe = True
                raise LedgerProcessError("LEDGER_RETAINED_ANCESTRY_CHANGED")
            self.event("authenticated-adoption", identity=current, retainedParentIdentity=parent["original"])

    def scan(self):
        require(self.active, "LEDGER_PROCESS_INVENTORY_INACTIVE")
        require(stable_equal(self.owner, identity(self.owner["pid"])), "LEDGER_WRAPPER_IDENTITY_CHANGED")
        if self.child is not None:
            self.child.poll()
        for pid in list(self.records):
            self._read_retained(pid)
        table = process_table()
        for pid, retained in self.records.items():
            observed = table.get(pid)
            if observed is not None and observed["startTimeTicks"] != retained["original"]["startTimeTicks"]:
                self.unsafe = True
                self.unknown[pid] = observed
                self.event("retained-pid-reused", retainedIdentity=retained["original"], observedIdentity=observed,
                           signalAuthorized=False)
        pending = True
        while pending:
            pending = False
            for pid, observed in table.items():
                if pid in self.records or pid in self.unknown:
                    continue
                parent = self.records.get(observed["ppid"])
                if parent is None or parent["gone"]:
                    continue
                try:
                    captured = identity(pid)
                    parent_before = self._read_retained(observed["ppid"])
                    require(parent_before is not None and captured["ppid"] == parent_before["pid"],
                            "LEDGER_DESCENDANT_ANCESTRY_UNAVAILABLE")
                    # Every ancestor was previously enrolled from the original
                    # child. Revalidate that chain immediately before enrolment.
                    chain = parent_before
                    while chain["pid"] != self.child.pid:
                        previous = self.records[chain["pid"]]["parentPID"]
                        chain = self._read_retained(previous)
                        require(chain is not None, "LEDGER_DESCENDANT_ANCESTRY_UNAVAILABLE")
                    require(stable_equal(captured, identity(pid)) and
                            stable_equal(parent_before, identity(parent_before["pid"])),
                            "LEDGER_DESCENDANT_IDENTITY_CHANGED")
                    self._retain(captured, origin="AUTHENTICATED_LIVE_ANCESTRY", parent_pid=parent_before["pid"])
                    pending = True
                except (FileNotFoundError, ProcessLookupError):
                    continue
                except Exception:
                    self.unsafe = True
                    raise
        # The kernel may reparent a daemon before we have observed its parent.
        # That is evidence of an unknown child, never an enrolment credential.
        for pid, observed in table.items():
            if observed["ppid"] == self.owner["pid"] and pid not in self.records and pid not in self.unknown:
                self.unsafe = True
                try:
                    captured = identity(pid)
                except (FileNotFoundError, ProcessLookupError):
                    captured = observed
                self.unknown[pid] = captured
                self.event("unknown-adopted-child", observedIdentity=captured, signalAuthorized=False)
        self._reap_zombies()
        live = []
        for pid in list(self.records):
            current = self._read_retained(pid)
            if current is not None:
                live.append(current)
        return live

    def _reap_zombies(self):
        for pid, record in list(self.records.items()):
            if self.child is not None and pid == self.child.pid:
                continue  # The actual Popen object owns that wait/reap.
            current = self._read_retained(pid)
            if current is None or current["ppid"] != self.owner["pid"] or current["state"] not in ("Z", "X"):
                continue
            waited, status = os.waitpid(pid, os.WNOHANG)
            if waited:
                self.event("reaped-authenticated-child", identity=current, waitStatus=status)
                record["gone"] = True
        # Reaping an unknown zombie prevents a kernel zombie leak. It grants no
        # signal/cleanup authority: unsafe remains latched and the lock retained.
        for pid in list(self.unknown):
            try:
                # No signal or enrolment is authorized here. Kernel wait/reap
                # alone may remove our previously observed unknown zombie.
                current = identity(pid, allow_terminal_read=True)
            except (FileNotFoundError, ProcessLookupError):
                continue
            if all(key in self.unknown[pid] for key in ("uid", "uids")) and stable_equal(self.unknown[pid], current) and current["ppid"] == self.owner["pid"] and current["state"] in ("Z", "X"):
                waited, status = os.waitpid(pid, os.WNOHANG)
                if waited:
                    self.event("reaped-unknown-kernel-child", observedIdentity=current, waitStatus=status,
                               cleanupAuthorityEstablished=False)

    def signal_retained(self, selected):
        require(selected in (signal.SIGTERM, signal.SIGKILL), "LEDGER_PROCESS_SIGNAL_KIND")
        self.scan()
        results = []
        # Descendants first. Every signal uses a previously opened pidfd after
        # fresh full UID/birth/group/session/ancestry validation, never killpg.
        for pid in reversed(list(self.records)):
            current = self._read_retained(pid)
            if current is None or current["state"] in ("Z", "X"):
                continue
            require(self.records[pid]["pidfd"] is not None, "LEDGER_PROCESS_PIDFD_UNAVAILABLE")
            require(stable_equal(current, identity(pid)), "LEDGER_SIGNAL_IDENTITY_CHANGED")
            signal.pidfd_send_signal(self.records[pid]["pidfd"], selected, None, 0)
            row = {"pid": pid, "identity": current, "signal": signal.Signals(selected).name}
            self.event("signal", **row); results.append(row)
        return results

    def cleanup_confirmed(self):
        live = self.scan()
        return not self.unsafe and self.child is not None and self.child.poll() is not None and not live

    def receipt(self):
        return {"ownerIdentity": self.owner, "subreaperEnabled": self.active,
                "unsafeIdentityObserved": self.unsafe,
                "retained": [{"original": row["original"], "current": row["current"], "gone": row["gone"],
                              "origin": row["origin"], "parentPID": row["parentPID"]} for row in self.records.values()],
                "unknown": list(self.unknown.values()), "events": self.events[:]}

    def finish(self):
        confirmed = self.cleanup_confirmed()
        if confirmed:
            require(ctypes.CDLL(None, use_errno=True).prctl(36, self.previous_subreaper, 0, 0, 0) == 0,
                    "LEDGER_SUBREAPER_RESTORE_FAILED")
            self.active = False
            self.event("subreaper-restored", value=self.previous_subreaper)
        for row in self.records.values():
            if row["pidfd"] is not None:
                os.close(row["pidfd"]); row["pidfd"] = None
        return confirmed
