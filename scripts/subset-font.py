"""Build the site's WOFF2 subset: python scripts/subset-font.py path/to/font.ttf."""
import argparse
import json
from pathlib import Path
import re
import subprocess

from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('font', type=Path)
args = parser.parse_args()

# Import the actual dictionary so escaped characters and future translations stay covered.
dictionary = subprocess.check_output(
    ['node', '--input-type=module', '-e',
     "import {messages} from './src/i18n.js'; console.log(JSON.stringify(messages));"],
    cwd=root, encoding='utf-8',
)
messages = json.loads(dictionary)
template = (root / 'src/App.vue').read_text(encoding='utf-8').split('<template>', 1)[1]
template = re.sub(r'<!--[\s\S]*?-->|\{\{[\s\S]*?\}\}|<[^>]*>', '', template)
characters = ''.join(sorted(set(
    ''.join(chr(code) for code in range(32, 127))
    + ''.join(value for language in messages.values() for value in language.values())
    + template + '♯≈'
) - set('\n\r\t')))
font = TTFont(args.font)
missing = set(map(ord, characters)) - font.getBestCmap().keys()
if missing:
    raise ValueError(f'Source font is missing characters: {sorted(missing)}')

options = subset.Options()
options.flavor = 'woff2'
options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14]
options.name_legacy = True
options.name_languages = ['*']
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=characters)
subsetter.subset(font)
# Give the modified subset its own family name; preserve copyright and license records.
for record in font['name'].names:
    names = {1: 'Tanpura Maple', 3: 'Tanpura Maple Regular Subset',
             4: 'Tanpura Maple Regular', 6: 'TanpuraMaple-Regular'}
    if record.nameID in names:
        record.string = names[record.nameID].encode(record.getEncoding())
font.flavor = 'woff2'
destination = root / 'public/fonts'
destination.mkdir(parents=True, exist_ok=True)
output = destination / 'tanpura-maple.woff2'
font.save(output)
assert set(map(ord, characters)) <= TTFont(output).getBestCmap().keys()
manifest = dict(characters=characters, sourceBytes=args.font.stat().st_size,
                subsetBytes=output.stat().st_size)
(destination / 'subset.json').write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8',
)
print(f'{manifest["sourceBytes"]:,} -> {manifest["subsetBytes"]:,} bytes; {len(characters)} characters')
