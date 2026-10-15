#!/usr/bin/env python3
"""Create the motor's private TLS leaf on its GCP host; never export its key."""
import hashlib
import json
import os
from pathlib import Path
import pwd
import stat
import subprocess

HOST = '10.71.0.3'
OWNER = 'lianum-testnet-signer'
PARENT = Path('/var/lib/lianum-testnet-signer')
DIRECTORY = PARENT / 'transport'


def checked_directory(path, uid):
    s = path.lstat()
    if not stat.S_ISDIR(s.st_mode) or s.st_uid != uid or stat.S_IMODE(s.st_mode) != 0o700 or path.resolve() != path:
        raise ValueError('TRANSPORT_PRIVATE_DIRECTORY')


def checked_file(path, uid, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        s = os.fstat(fd)
        if not stat.S_ISREG(s.st_mode) or s.st_uid != uid or s.st_nlink != 1 or stat.S_IMODE(s.st_mode) != 0o600 or not 0 < s.st_size <= limit:
            raise ValueError('TRANSPORT_PRIVATE_FILE')
        raw = os.read(fd, limit + 1)
        if len(raw) != s.st_size:
            raise ValueError('TRANSPORT_FILE_CHANGED')
        return raw
    finally:
        os.close(fd)


def openssl(*arguments, owner=False):
    command = ['/usr/bin/openssl', *arguments]
    if owner:
        command = ['/usr/sbin/runuser', '-u', OWNER, '--', *command]
    return subprocess.run(command, check=True, capture_output=True, timeout=15).stdout


def main():
    if os.getuid() != 0:
        raise ValueError('TRANSPORT_ROOT_INITIALIZATION')
    interfaces = json.loads(subprocess.run(['/usr/sbin/ip', '-j', 'address', 'show'],
                            check=True, capture_output=True, timeout=5).stdout)
    if not any(address.get('local') == HOST for interface in interfaces
               for address in interface.get('addr_info', [])):
        raise ValueError('TRANSPORT_HOST_BINDING')
    user = pwd.getpwnam(OWNER)
    checked_directory(PARENT, user.pw_uid)
    key, cert = DIRECTORY / 'server-key.pem', DIRECTORY / 'server-certificate.pem'
    created = False
    try:
        DIRECTORY.mkdir(mode=0o700)
        os.chown(DIRECTORY, user.pw_uid, user.pw_gid)
        created = True
    except FileExistsError:
        pass
    checked_directory(DIRECTORY, user.pw_uid)
    if created:
        # An interrupted first creation stays visible; rerun never replaces it.
        old_mask = os.umask(0o077)
        try:
            openssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
                    '-noenc', '-days', '30', '-subj', '/CN=lianum-private-motor',
                    '-addext', 'subjectAltName=IP:' + HOST,
                    '-addext', 'basicConstraints=critical,CA:FALSE',
                    '-addext', 'keyUsage=critical,digitalSignature',
                    '-addext', 'extendedKeyUsage=serverAuth',
                    '-keyout', str(key), '-out', str(cert), owner=True)
        finally:
            os.umask(old_mask)
    checked_file(key, user.pw_uid, 8192)
    checked_file(cert, user.pw_uid, 16384)
    certificate_key = openssl('x509', '-in', str(cert), '-pubkey', '-noout')
    private_key_public = openssl('pkey', '-in', str(key), '-pubout')
    if certificate_key != private_key_public:
        raise ValueError('TRANSPORT_KEY_BINDING')
    checked_host = openssl('x509', '-in', str(cert), '-checkip', HOST, '-noout')
    if checked_host.strip() != ('IP ' + HOST + ' does match certificate').encode():
        raise ValueError('TRANSPORT_CERTIFICATE_HOST')
    openssl('x509', '-in', str(cert), '-checkend', '86400', '-noout')
    details = openssl('x509', '-in', str(cert), '-text', '-noout')
    if b'CA:FALSE' not in details or b'TLS Web Server Authentication' not in details:
        raise ValueError('TRANSPORT_LEAF_EXTENSIONS')
    der = openssl('x509', '-in', str(cert), '-outform', 'DER')
    print(json.dumps({'profile': 'LIANUM_PRIVATE_MOTOR_TRANSPORT_V4',
                      'created': created, 'host': HOST, 'ownerUid': user.pw_uid,
                      'certificateSHA256': hashlib.sha256(der).hexdigest(),
                      'certificatePath': str(cert), 'privateKeyExported': False,
                      'listenerStarted': False, 'publicIngressReady': False,
                      'financialAcceptance': False}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        code = str(error) if isinstance(error, ValueError) else 'TRANSPORT_INITIALIZATION_FAILED'
        print(json.dumps({'status': 'REJECTED', 'code': code, 'privateKeyExported': False}))
        raise SystemExit(1)
