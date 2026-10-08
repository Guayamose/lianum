/** Observation only. These labels never enroll a process or select a signal.
 * Chrome's Linux zygote flattens argv into one proctitle. The renderer role
 * must be an exact switch immediately after the fixed image, not a substring
 * of another argument. The caller still authenticates executable/PID/UID and
 * requires the kernel sandbox fields before recording a renderer. */
import assert from 'node:assert/strict';
const IMAGE = '/opt/google/chrome/chrome';
export function walletChromeCommandLineObservation(commandLine) {
  assert.equal(typeof commandLine, 'string');
  assert.ok(commandLine.length <= 1024 ** 2, 'BROWSER_COMMAND_LINE_BOUND');
  const vector = commandLine.split('\0').filter(Boolean);
  if (vector[0] === IMAGE) {
    const types = vector.slice(1).filter(argument => argument.startsWith('--type='));
    assert.ok(types.length <= 1, 'BROWSER_AMBIGUOUS_PROCESS_TYPE');
    const role = types.length ? /^--type=([a-z-]+)$/.exec(types[0])?.[1] ?? null : 'browser';
    return { role, form: 'NUL_ARGUMENTS', sandboxDisabled: vector.some(argument => /^--no-sandbox(?:=|$)/.test(argument)) };
  }
  if (vector.length === 1 && vector[0].startsWith(IMAGE + ' ')) {
    const title = vector[0].slice(IMAGE.length + 1);
    assert.ok([...title.matchAll(/(?:^| )--type=[^ ]*/g)].length <= 1, 'BROWSER_AMBIGUOUS_PROCESS_TYPE');
    const firstSwitch = /^--type=([a-z-]+)(?: |$)/.exec(title);
    return { role: firstSwitch?.[1] ?? null, form: 'CHROME_LINUX_PROCTITLE',
      sandboxDisabled: /(?:^| )--no-sandbox(?:=| |$)/.test(title) };
  }
  return { role: null, form: 'UNRECOGNIZED', sandboxDisabled: false };
}
