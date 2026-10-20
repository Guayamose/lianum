"""Build Lianum's documentation artwork with the report/architecture visual system.

Standard-library SVG authoring. Optional PNG rendering uses local Chrome; no model
requests, downloaded fonts or product services are involved.
"""
from pathlib import Path
import argparse
import json
import subprocess
import xml.etree.ElementTree as ET

import brand as b

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'docs/assets'
WIDTH = 1280


def canvas(name, title, description, height, contents, dots=True):
    pattern = ('<defs><pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">'
               '<circle cx="2" cy="2" r="0.8" fill="#DCDCCE" opacity="0.55"/></pattern></defs>')
    background = f'<rect width="{WIDTH}" height="{height}" fill="{b.PAPER}"/>'
    if dots:
        background += f'<rect width="{WIDTH}" height="{height}" fill="url(#dots)"/>'
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{height}" '
           f'viewBox="0 0 {WIDTH} {height}" role="img" aria-labelledby="title desc">'
           f'<title id="title">{b.esc(title)}</title><desc id="desc">{b.esc(description)}</desc>'
           + b.markers() + pattern + background + contents + '</svg>')
    ET.fromstring(svg)
    (OUT / f'{name}.svg').write_text(svg + '\n')


def line(x, y, text, size=18, color=b.MUTED, **kwargs):
    return b.text(x, y, text, size=size, color=color, **kwargs)


def heading(label, title, sub):
    return (b.label(48, 42, label, size=13) + line(48, 91, title, 34, b.INK, weight=500)
            + line(48, 124, sub, 17))


def card(x, y, w, h, title, lines=(), color='blue', icon=None):
    out = b.box(x, y, w, h, color, d=6, tinted=True)
    if icon:
        out += b.icon(icon, x + 29, y + 32, s=0.65, color=color)
    out += line(x + (55 if icon else 20), y + 40, title, 21, b.INK if color == 'grey' else b.PALETTE[color][0], weight=500)
    for i, text in enumerate(lines):
        out += line(x + 20, y + 73 + i * 26, text, 17)
    return out


def hero():
    out = '<g transform="translate(56,35)">' + b.logo(46) + '</g>'
    out += b.label(1220, 66, 'WeBank FinTechathon 2026 · Track F', anchor='end', size=13)
    out += line(56, 179, 'One wallet.', 58, b.SLATE, weight=500)
    out += line(56, 251, 'Your always-on agent.', 54, b.SLATE, weight=500)
    out += line(59, 307, 'Turn financial intent into a plan you can review,', 21)
    out += line(59, 340, 'authorize and verify across networks.', 21)
    out += b.frame(850, 132, 365, 236, 'PAEG', 'blue', title_size=24)
    for x, y, label in [(907, 207, 'A'), (1040, 183, 'B'), (1040, 288, 'C'), (1160, 239, 'D')]:
        out += f'<circle cx="{x}" cy="{y}" r="22" fill="{b.PAPER}" stroke="#245E9D" stroke-width="1.7"/>'
        out += line(x, y + 7, label, 21, '#245E9D', anchor='middle', mono=True)
    for path in ['M930,203 L1014,186', 'M927,222 L1019,275', 'M1062,194 L1138,228', 'M1062,281 L1137,250']:
        out += b.path(path, 'blue')
    out += b.label(1030, 344, 'private · atomic settlement', size=12, anchor='middle', color='#245E9D')
    for x, title, lines, color, icon in [
        (56, 'Owner-held authority', ['Review exact terms.', 'Keep signing keys on the phone.'], 'blue', 'key'),
        (452, 'Persistent intelligence', ['One conversation. Bounded context.', 'Text, voice, tools and follow-ups.'], 'orange', 'chat'),
        (848, 'Proof-bound execution', ['Scoped witnesses. Durable evidence.', 'Conditional payout and recovery.'], 'purple', 'shield')]:
        out += card(x, 422, 366, 135, title, lines, color, icon)
    canvas('hero', 'Lianum: one wallet, an always-on agent and PAEG',
           'A mobile agent wallet combining owner authority, persistent conversation and private graph settlement.', 592, out)


def system():
    out = heading('System architecture', 'Custody, coordination, execution.', 'Separate authority boundaries. One connected financial experience.')
    out += card(48, 190, 230, 175, 'Mobile wallet', ['Keys + biometrics', 'Portfolio + review', 'Mainnet / Testnet'], 'blue', 'key')
    out += b.frame(327, 167, 897, 432, 'Google Cloud · Compute Engine', 'ink', title_size=20)
    out += card(354, 210, 373, 140, 'Wallet API host', ['Caddy · authenticated gateway', 'Native wallet relay'], 'blue', 'code')
    out += card(783, 210, 412, 140, 'Private engine host', ['PAEG · journals · chain / DeFi adapters', 'No public IP · scoped proof jobs'], 'blue', 'graph')
    out += card(354, 421, 373, 140, 'Persistent agent', ['Owner-scoped SQLite', 'Models · tools · voice · follow-ups'], 'orange', 'chat')
    out += card(783, 421, 412, 140, 'Proof workers', ['Noir · UltraHonk · verification', 'Child processes · no wallet keys'], 'purple', 'shield')
    out += b.path('M279,272 H349', 'blue', start=True)
    out += b.path('M731,272 H778', 'blue', start=True)
    out += b.path('M540,354 V415', 'orange', start=True)
    out += b.path('M990,354 V415', 'purple', start=True)
    out += line(48, 424, 'Public test environments', 17, b.INK)
    for i, name in enumerate(['Ethereum Sepolia', 'Bitcoin Testnet3', 'Solana devnet']):
        out += line(48, 459 + i * 29, name, 17, '#658348')
    out += line(48, 640, 'OpenAI: model + voice  ·  Firebase: push  ·  RPC providers: network observations', 17)
    canvas('system', 'Lianum deployment boundaries', 'Phone custody connects through the public API host to a private PAEG host. Agent and proof processes have separate roles.', 678, out)


def paeg():
    out = heading('Private Atomic Execution Graphs', 'One signed graph. Evidence for every transition.', 'A four-node route illustrates the recorded mixed local integration.')
    for x, y, title, lines, color, icon in [
        (48, 188, 'Uniswap step', ['Prepared venue operation', 'Beneficiary + terms'], 'blue', 'swap'),
        (48, 352, 'Native ETH', ['Original operation identity', 'Authenticated result'], 'blue', 'link'),
        (350, 188, 'Native BTC', ['Network-specific finality', 'Delivery evidence'], 'blue', 'link'),
        (350, 352, 'Native SOL', ['Network-specific finality', 'Delivery evidence'], 'blue', 'link')]:
        out += card(x, y, 252, 125, title, lines, color, icon)
    out += b.path('M308,250 H343', 'blue')
    out += b.path('M309,414 H343', 'blue')
    out += b.path('M610,250 H653 V333 H694', 'purple')
    out += b.path('M610,414 H653 V333', 'purple', end=False)
    out += card(700, 260, 225, 159, 'Scoped proofs', ['Commitment binding', 'Scoped witnesses', 'Single-use nullifiers', 'Verified transitions'], 'purple', 'shield')
    out += b.path('M933,333 H981', 'green')
    out += card(987, 260, 237, 159, 'Settlement', ['Conditional payout', 'Owner change', 'Accounted recovery'], 'green', 'graph')
    out += b.box(48, 531, 1176, 69, 'grey')
    out += line(70, 573, 'Reserve settlement is conditional. Confirmed native-chain effects remain final.', 20, b.INK)
    canvas('paeg', 'PAEG evidence and settlement', 'Four financial nodes contribute scoped proof evidence to conditional settlement. Independent native-chain transactions are not rolled back.', 639, out)


def agent():
    out = heading('Persistent financial agent', 'A continuous conversation. A bounded working context.', 'Accepted work outlives the mobile request; owner approval remains separate.')
    out += card(48, 190, 272, 141, 'One conversation', ['Text + streaming responses', 'Voice + saved transcripts'], 'orange', 'chat')
    out += b.path('M328,260 H379', 'orange', start=True)
    out += card(385, 190, 432, 141, 'Durable service', ['Messages · memory · tasks · outbox', 'Idempotent submission + saved tool results'], 'orange', 'db')
    out += b.path('M825,260 H879', 'orange', start=True)
    out += card(885, 190, 339, 141, 'Model + tools', ['Wallet reads + supported proposals', 'Owner-scoped session events'], 'orange', 'code')
    out += b.frame(48, 389, 1176, 183, 'Selected context for each turn', 'ink', title_size=20)
    for x, title, detail in [(73, 'Fresh observations', 'Environment + freshness'), (365, '8 preferences', 'Editable owner memory'), (657, '3 history excerpts', 'Owner-scoped history'), (949, '4 upcoming tasks', 'Requested follow-ups')]:
        out += card(x, 425, 260, 111, title, [detail], 'grey')
    out += line(48, 620, 'The agent proposes and observes. The phone reviews and signs financial authority.', 20, b.SLATE)
    canvas('agent', 'Persistent agent and bounded context', 'Full owner-scoped history is stored durably. Each turn selects limited preferences, related excerpts, tasks and wallet observations.', 662, out)


def security():
    out = heading('Security and privacy', 'Useful intelligence. Explicit financial authority.', 'A proposal, an authorization, an observation and a proof are different capabilities.')
    entries=[('Phone', 'Review + sign', 'Owner keys', 'blue', 'key'), ('Agent', 'Propose + observe', 'No wallet keys', 'orange', 'chat'), ('Gateway', 'Authenticate + route', 'Scoped requests', 'blue', 'code'), ('Engine', 'Execute + account', 'Durable identities', 'blue', 'graph'), ('Workers', 'Prove + verify', 'Scoped witnesses', 'purple', 'shield')]
    for i,(title,first,second,color,icon) in enumerate(entries):
        x=48+i*239
        out+=card(x,196,219,153,title,[first,second],color,icon)
        if i<4:out+=b.path(f'M{x+225},268 H{x+234}',color)
    for x,title,lines,color in [
        (48,'Authorization',['Exact plan · amount · recipient','Dependencies · deadlines · fees'],'blue'),
        (449,'Disclosure',['Witness visibility follows the task','Native transfers remain public'],'purple'),
        (850,'Recovery',['Reconcile the accepted operation','Lost reply ≠ permission to repay'],'green')]:
        out+=card(x,416,374,137,title,lines,color)
    canvas('security','Lianum authority and disclosure boundaries','The phone owns financial signatures. The agent, gateway, engine and proof workers have separate capabilities and trust assumptions.',595,out)


def evidence():
    out=b.label(48,38,'Recorded evidence · 20 October 2026',size=13)
    for i,(value,title,scope,color) in enumerate([
        ('3','Public testnets','ETH · BTC · SOL native transfers','blue'),
        ('6','Verified transactions','Public receipts + pool lifecycle','green'),
        ('21','Genuine proofs','Four-node local integration','purple'),
        ('491','Repository checks','Recorded bounded host suite','orange')]):
        x=48+i*300
        out+=b.box(x,70,278,150,color,tinted=True)
        out+=line(x+20,126,value,44,b.PALETTE[color][0],weight=500)
        out+=line(x+20,164,title,20,b.INK)
        out+=line(x+20,195,scope,14)
    canvas('evidence','Recorded public and local validation','Three public testnets, six verified transactions, twenty-one genuine local integration proofs and 491 recorded repository checks have separate scopes.',252,out)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--render',action='store_true',help='Render PNG fallbacks with local Chrome')
    args=parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True)
    for build in [hero,system,paeg,agent,security,evidence]:build()
    (OUT/'lianum.svg').write_text(b.logo(96)+'\n')
    (OUT/'mark.svg').write_text(b.mark(96).replace('<svg','<svg role="img" aria-label="Lianum mark"',1)+'\n')
    if args.render:
        subprocess.run([str(ROOT/'dev'),'node',str(Path(__file__).with_name('render.mjs'))],check=True,cwd=ROOT)
    print(json.dumps({'assets':len(list(OUT.glob('*.svg'))),'pngRendering':args.render}))


if __name__=='__main__':main()
