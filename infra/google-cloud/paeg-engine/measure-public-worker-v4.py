#!/usr/bin/env python3
"""Measure the real service cgroup without reading wallets, jobs or arguments."""
import argparse
import json
import os
from pathlib import Path
import re
import time

CGROUP = Path('/sys/fs/cgroup/system.slice/lianum-paeg-public.service')


def sample():
    state = CGROUP.stat()
    cpu = dict(line.split() for line in (CGROUP / 'cpu.stat').read_text().splitlines())
    return {'identity': (state.st_dev, state.st_ino),
            'cpuMicroseconds': int(cpu['usage_usec']),
            'memoryBytes': int((CGROUP / 'memory.current').read_text()),
            'memoryPeakBytes': int((CGROUP / 'memory.peak').read_text()),
            'tasks': int((CGROUP / 'pids.current').read_text())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seconds', type=int, required=True)
    parser.add_argument('--phase', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 3600 or not re.fullmatch(r'[A-Z][A-Z0-9_]{0,63}', args.phase):
        raise ValueError('PAEG_MEASURE_ARGUMENTS')
    if args.output.exists() or args.output.is_symlink():
        raise ValueError('PAEG_MEASURE_OUTPUT_EXISTS')
    first = sample()
    started = time.monotonic()
    maximum_memory = first['memoryBytes']
    maximum_tasks = first['tasks']
    samples = 1
    last = first
    while time.monotonic() - started < args.seconds:
        time.sleep(min(1, max(0, args.seconds - (time.monotonic() - started))))
        last = sample()
        if last['identity'] != first['identity']:
            raise ValueError('PAEG_MEASURE_CGROUP_REPLACED')
        maximum_memory = max(maximum_memory, last['memoryBytes'])
        maximum_tasks = max(maximum_tasks, last['tasks'])
        samples += 1
    elapsed = time.monotonic() - started
    if last['cpuMicroseconds'] < first['cpuMicroseconds']:
        raise ValueError('PAEG_MEASURE_CGROUP_REPLACED')
    result = {'profile': 'ACTUAL_PUBLIC_PAEG_SERVICE_RESOURCE_SAMPLE_V4',
              'phase': args.phase, 'wallSeconds': round(elapsed, 3),
              'cpuSeconds': round((last['cpuMicroseconds'] - first['cpuMicroseconds']) / 1e6, 3),
              'maximumObservedMemoryBytes': maximum_memory,
              'serviceLifetimeMemoryPeakBytes': last['memoryPeakBytes'],
              'maximumObservedTasks': maximum_tasks, 'samples': samples,
              'measurementScope': 'SERVICE_CGROUP_INCLUDING_PROVER_CHILDREN',
              'proofOrFinancialAcceptanceEstablished': False}
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as output:
        json.dump(result, output, sort_keys=True); output.write('\n')
        output.flush(); os.fsync(output.fileno())
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError):
        print(json.dumps({'measured': False, 'code': 'PAEG_MEASURE_UNAVAILABLE',
                          'proofOrFinancialAcceptanceEstablished': False}))
        raise SystemExit(1)
