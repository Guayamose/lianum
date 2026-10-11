"""Bounded streaming execution of a process group owned by this invocation."""
import codecs
import math
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time


class Interrupted(Exception):
    def __init__(self, signum):
        self.signum = signum


def interrupted(signum, _frame):
    raise Interrupted(signum)


def stop_group(process, grace_seconds=0.25):
    """Never signal the caller's process group or an unrelated process."""
    for signum in (signal.SIGTERM, signal.SIGKILL):
        try:
            os.killpg(process.pid, signum)
        except ProcessLookupError:
            break
        if signum == signal.SIGTERM:
            time.sleep(grace_seconds)
    process.wait(timeout=2)


def run_bounded(command, *, cwd, timeout_seconds=120, log_path=None,
                output=None, max_output_bytes=8 * 1024 * 1024, termination_grace=.25):
    """Stream output, bound wall time/log size, and reap this command's children.

    A successful parent that leaves live descendants is a failure, not a pass.
    Commands must not intentionally daemonize or create detached process groups.
    """
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0 or max_output_bytes <= 0:
        raise ValueError('Positive execution and output limits are required')
    output = output if output is not None else sys.stdout
    started = time.monotonic()
    decoder = codecs.getincrementaldecoder('utf-8')(errors='replace')
    chunks, written, status, exit_code = [], 0, None, None
    log = None
    process = None
    previous = {}
    selector = selectors.DefaultSelector()
    try:
        if log_path is not None:
            Path(log_path).parent.mkdir(parents=True, exist_ok=True)
            log = Path(log_path).open('wb')
        for signum in (signal.SIGINT, signal.SIGTERM):
            previous[signum] = signal.signal(signum, interrupted)
        process = subprocess.Popen(command, cwd=cwd, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True)
        os.set_blocking(process.stdout.fileno(), False)
        selector.register(process.stdout, selectors.EVENT_READ)
        while selector.get_map() or process.poll() is None:
            remaining = timeout_seconds - (time.monotonic() - started)
            if remaining <= 0:
                status, exit_code = 'TIMEOUT', 124
                break
            for key, _events in selector.select(min(remaining, 0.05)):
                data = os.read(key.fileobj.fileno(), 65536)
                if not data:
                    selector.unregister(key.fileobj)
                    continue
                allowed = max_output_bytes - written
                if len(data) > allowed:
                    data = data[:allowed]
                    status, exit_code = 'OUTPUT_LIMIT', 125
                written += len(data)
                if log:
                    log.write(data)
                    log.flush()
                text = decoder.decode(data)
                chunks.append(text)
                output.write(text)
                output.flush()
                if status:
                    break
            if status:
                break
            if process.poll() is not None:
                try:
                    os.killpg(process.pid, 0)
                except ProcessLookupError:
                    pass
                else:
                    status, exit_code = 'ORPHANED_PROCESS', 125
                    break
        if status is None:
            exit_code = process.wait()
            status = 'PASS' if exit_code == 0 else 'FAIL'
    except Interrupted as error:
        status, exit_code = 'CANCELLED', 128 + error.signum
    finally:
        if process is not None:
            stop_group(process, termination_grace)
            process.stdout.close()
        selector.close()
        if log:
            log.close()
        for signum, handler in previous.items():
            signal.signal(signum, handler)
    tail = decoder.decode(b'', final=True)
    if tail:
        chunks.append(tail)
        output.write(tail)
        output.flush()
    return {'status': status, 'exitCode': exit_code, 'stdout': ''.join(chunks),
            'durationSeconds': round(time.monotonic() - started, 3),
            'timeoutSeconds': timeout_seconds, 'outputBytes': written,
            'maxOutputBytes': max_output_bytes}
