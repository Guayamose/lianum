"""Check active Markdown links, anchors and self-contained documentation SVGs.

Uses only Python's standard library and Git. Frozen protocol documentation is
retained provenance, not part of the active documentation surface.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import html
import json
import re
import subprocess
import unicodedata
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]


def without_code(text):
    output=[]
    fence=None
    for line in text.splitlines():
        match=re.match(r'^\s{0,3}(`{3,}|~{3,})',line)
        if match:
            token=match.group(1)
            if fence is None:fence=token
            elif token[0]==fence[0] and len(token)>=len(fence):fence=None
            continue
        if fence is None:output.append(line)
    return re.sub(r'(`+)[^`\n]*?\1','', '\n'.join(output))


def closing(text,start,left,right):
    depth=0
    for i in range(start,len(text)):
        if i and text[i-1]=='\\':continue
        if text[i]==left:depth+=1
        elif text[i]==right:
            depth-=1
            if depth==0:return i
    return None


class HTMLLinks(HTMLParser):
    def __init__(self):
        super().__init__();self.links=[];self.ids=set()
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        for key in ['href','src']:
            if key in attrs:self.links.append(attrs[key])
        if attrs.get('id'):self.ids.add(attrs['id'])
        if tag=='a' and attrs.get('name'):self.ids.add(attrs['name'])


def links(text):
    text=without_code(text)
    found=[]
    for i,char in enumerate(text):
        if char!='[':continue
        end=closing(text,i,'[',']')
        if end is None or end+1>=len(text) or text[end+1]!='(':continue
        finish=closing(text,end+1,'(',')')
        if finish is None:continue
        target=text[end+2:finish].strip()
        if target.startswith('<'):target=target[1:target.index('>')]
        else:target=re.split(r'\s+[\"\']',target,maxsplit=1)[0]
        if target:found.append(target)
    for match in re.finditer(r'^\s{0,3}\[[^\]]+\]:\s*(\S+)',text,re.M):found.append(match.group(1).strip('<>'))
    parser=HTMLLinks();parser.feed(text);found.extend(parser.links)
    return found


def heading_ids(path):
    text=path.read_text()
    parser=HTMLLinks();parser.feed(without_code(text));ids=parser.ids
    counts={}
    for match in re.finditer(r'^#{1,6}\s+(.+?)\s*#*$',text,re.M):
        value=re.sub(r'<[^>]*>','',match.group(1)).lower()
        value=re.sub(r'\[([^\]]+)\]\([^)]*\)',r'\1',value)
        value=''.join(c for c in value if c in ' -_' or unicodedata.category(c)[0] in 'LN')
        slug=value.replace(' ','-')
        n=counts.get(slug,0);counts[slug]=n+1;ids.add(slug if n==0 else f'{slug}-{n}')
    return ids


def main():
    names=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
    markdown=sorted({ROOT/n for n in names if n.endswith('.md') and not n.startswith('packages/protocol/') and (ROOT/n).is_file()})
    errors=[];checked=0;anchors={}
    for source in markdown:
        for target in links(source.read_text()):
            target=html.unescape(target)
            url=urlsplit(target)
            if url.scheme or url.netloc:continue
            path=unquote(url.path).replace('\\ ',' ')
            destination=(source.parent/path).resolve() if path else source
            checked+=1
            if not destination.is_relative_to(ROOT):
                errors.append(f'{source.relative_to(ROOT)}: link leaves repository: {target}')
            elif not destination.exists():
                errors.append(f'{source.relative_to(ROOT)}: missing target: {target}')
            elif url.fragment and destination.suffix=='.md':
                ids=anchors.setdefault(destination,heading_ids(destination))
                if unquote(url.fragment) not in ids:errors.append(f'{source.relative_to(ROOT)}: missing anchor: {target}')
    drawings=list((ROOT/'docs/assets').glob('*.svg'))
    for path in drawings:
        try:
            svg=ET.fromstring(path.read_bytes())
            for element in svg.iter():
                tag=element.tag.split('}')[-1]
                if tag in {'script','foreignObject'}:errors.append(f'{path.relative_to(ROOT)}: unsupported SVG element {tag}')
                for key,value in element.attrib.items():
                    if key.split('}')[-1]=='href' and not value.startswith('#'):errors.append(f'{path.relative_to(ROOT)}: external SVG resource')
            if svg.find('{http://www.w3.org/2000/svg}title') is None and not svg.get('aria-label'):
                errors.append(f'{path.relative_to(ROOT)}: missing accessible title')
        except ET.ParseError as exc:errors.append(f'{path.relative_to(ROOT)}: invalid SVG: {exc}')
    print(json.dumps({'markdownFiles':len(markdown),'localLinksChecked':checked,'svgFiles':len(drawings),'errors':errors},indent=2))
    return int(bool(errors))


if __name__=='__main__':raise SystemExit(main())
