"""Independent public synthetic wire checks. No proof or authority acceptance."""
import hashlib
import json
from pathlib import Path
import re
import struct
import sys

COMMON = [('version', 2), ('salt', 32), ('scope', 32), ('role', 1), ('branch', 1), ('chainDomain', 32)]
TAIL = [('amount', 8), ('nativeFeeCap', 8), ('payoutValue', 8), ('executeBy', 8), ('claimBy', 8), ('attempt', 32), ('policy', 32)]
SCHEMAS = {
    'menu': ('PC5-QB/menu/1', [('version', 2), ('scope', 32), ('session', 32), ('menuSalt', 32), ('quote', 56), ('outcomes', 16), ('sDescriptor', 136), ('bDescriptor', 124), ('timing', 16), ('resultSaltCommitment', 32), ('topology', 1)]),
    'legS': ('PC5-QB/leg-s/1', COMMON + [('recipient', 32)] + TAIL + [('resultSaltCommitment', 32)]),
    'legB': ('PC5-QB/leg-b/1', COMMON + [('recipientProgram', 20)] + TAIL + [('parentRule', 1), ('parentConstraint', 32)]),
    'resultSalt': ('PC5-QB/result-salt/1', [('resultSalt', 32)]),
    'statement': ('PC5-QB/statement/1', [('version', 2), ('scope', 32), ('session', 32), ('branch', 1), ('menuBinding', 32), ('C_S', 32), ('C_B', 32)]),
}


def need(condition, code):
    if not condition:
        raise ValueError(code)


def unique(pairs):
    result = {}
    for name, value in pairs:
        need(name not in result, 'duplicate JSON key')
        result[name] = value
    return result


def digest(value):
    return hashlib.sha256(value).digest()


def raw(value):
    need(isinstance(value, str) and re.fullmatch(r'(?:[0-9a-f]{2})*', value) is not None, 'canonical hex')
    return bytes.fromhex(value)


def frame(name, values):
    tag, fields = SCHEMAS[name]
    prefix = tag.encode('ascii')
    return struct.pack('>H', len(prefix)) + prefix + b''.join(struct.pack('>I', size) + values[key] for key, size in fields)


def decode(name, value):
    tag, fields = SCHEMAS[name]
    prefix = struct.pack('>H', len(tag)) + tag.encode('ascii')
    need(value.startswith(prefix), 'canonical tag')
    cursor, result = len(prefix), {}
    for key, size in fields:
        need(len(value) >= cursor + 4 + size and struct.unpack('>I', value[cursor:cursor+4])[0] == size, 'canonical width')
        result[key] = value[cursor+4:cursor+4+size]
        cursor += 4 + size
    need(cursor == len(value), 'canonical wire length')
    if 'version' in result:
        need(result['version'] == b'\x00\x01', 'canonical version')
    if 'branch' in result:
        need(result['branch'] in [b'\x00', b'\x01'], 'canonical branch')
    return result


def check(data):
    need(set(data) == {'classification', 'menuHex', 'resultSaltHex', 'menuBinding', 'schemas', 'branches'}, 'fixture fields')
    need(data['classification'] == 'PUBLIC_SYNTHETIC_CANONICAL_WIRE_FIXTURES_NOT_AUTHORIZATION', 'synthetic fixture classification')
    need(set(data['schemas']) == set(SCHEMAS), 'schema names')
    for name, (tag, fields) in SCHEMAS.items():
        item = data['schemas'][name]
        need(set(item) == {'tag', 'fields', 'offsets', 'bytes'}, 'schema fields')
        need(all(isinstance(row, list) and len(row) == 2 and type(row[1]) is int for row in item['fields']), 'integer schema widths')
        need(item['tag'] == tag and item['fields'] == [list(row) for row in fields], 'original schema')
        cursor, offsets = 2 + len(tag), {}
        for key, size in fields:
            offsets[key] = cursor + 4
            cursor += 4 + size
        need(type(item['bytes']) is int and item['bytes'] == cursor and item['offsets'] == offsets, 'original schema offsets')
    need(isinstance(data['branches'], list) and len(data['branches']) == 2 and all(type(row['branch']) is int for row in data['branches']) and [row['branch'] for row in data['branches']] == [0, 1], 'exact branches')
    menu_bytes, salt = raw(data['menuHex']), raw(data['resultSaltHex'])
    menu = decode('menu', menu_bytes)
    need(menu['topology'] == b'\x01' and len(salt) == 32, 'original topology and salt')
    binding = digest(menu_bytes)
    need(raw(data['menuBinding']) == binding, 'menu binding')
    need(digest(frame('resultSalt', {'resultSalt': salt})) == menu['resultSaltCommitment'], 'result salt commitment')
    budget, fs, fb, ps, qs, pb, qb = struct.unpack('>7Q', menu['quote'])
    need(budget > 0 and min(ps, qs, pb, qb) > 0, 'independent arithmetic')
    outcomes = struct.unpack('>2Q', menu['outcomes'])
    for row in data['branches']:
        need(set(row) == {'branch', 'amounts', 'legSHex', 'legBHex', 'statementHex', 'commitments'}, 'branch fields')
        j, amount_s = row['branch'], outcomes[row['branch']]
        cost = (amount_s * ps + qs - 1) // qs
        need(fs + fb + cost <= budget, 'independent arithmetic')
        amount_b = (budget - fs - fb - cost) * qb // pb
        expected = dict(S=amount_s, K=amount_b, PS=cost + fs, PB=budget - cost - fs, cost=cost)
        need(amount_b > 0 and all(0 <= value < 2**64 for value in expected.values()) and row['amounts'] == {key: str(value) for key, value in expected.items()}, 'independent arithmetic')
        sb, bb, statement_bytes = raw(row['legSHex']), raw(row['legBHex']), raw(row['statementHex'])
        s, b, statement = decode('legS', sb), decode('legB', bb), decode('statement', statement_bytes)
        need(s['role'] == b'\x01' and b['role'] == b'\x02' and b['parentRule'] == b'\x01', 'original roles')
        for value in [s, b, statement]:
            need(value['scope'] == menu['scope'] and value['branch'] == bytes([j]), 'scope branch binding')
        need(statement['session'] == menu['session'] and statement['menuBinding'] == binding, 'statement binding')
        need(statement['C_S'] == digest(sb) and statement['C_B'] == digest(bb) and b['parentConstraint'] == digest(sb), 'opening commitments')
        need(row['commitments'] == {'C_S': digest(sb).hex(), 'C_B': digest(bb).hex()}, 'published commitments')
        for leg, amount, payout in [(s, amount_s, expected['PS']), (b, amount_b, expected['PB'])]:
            need(int.from_bytes(leg['amount'], 'big') == amount and int.from_bytes(leg['payoutValue'], 'big') == payout, 'independent arithmetic')
            need(leg['executeBy'] + leg['claimBy'] == menu['timing'], 'timing binding')
        sd, bd = menu['sDescriptor'], menu['bDescriptor']
        need(s['chainDomain'] + s['recipient'] + s['attempt'] + s['policy'] + s['nativeFeeCap'] == sd, 'S descriptor binding')
        need(b['chainDomain'] + b['recipientProgram'] + b['attempt'] + b['policy'] + b['nativeFeeCap'] == bd, 'B descriptor binding')
        need(s['resultSaltCommitment'] == menu['resultSaltCommitment'], 'S result binding')
    return {'branchesChecked': [0, 1], 'financialAcceptance': False}


if __name__ == '__main__':
    try:
        need(len(sys.argv) == 2, 'fixture argument')
        encoded = Path(sys.argv[1]).read_bytes()
        need(len(encoded) <= 128 * 1024, 'fixture size')
        print(json.dumps(check(json.loads(encoded, object_pairs_hook=unique))))
    except (ValueError, KeyError, TypeError, OSError, struct.error):
        # Only closed test codes, never a fixture, path or exception payload.
        code = sys.exception().args[0] if type(sys.exception()) is ValueError else 'fixture rejected'
        sys.stderr.write(str(code) + '\n')
        sys.exit(1)
