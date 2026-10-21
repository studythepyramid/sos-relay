"""Extract source-coded site candidates from supported public report tables.

Supported report extraction includes rounded locations and citations for direct
map storage. No independent factual review or victim identities are produced.
"""
from pathlib import Path
import re
import subprocess

ADAPTER = 'amnesty-kh-2026'
FIRST_PAGE = 159
LAST_PAGE = 176
CODE = re.compile(r'^\s*(?:[0-9]+\s+)?([A-Z]{2,3}[0-9]{2}[A-Z]?)\b')
COORDINATES = re.compile(r'\b\d{1,3}\.\d{3,}(?:\s*,\s*|\s+)\d{1,3}\.\d{3,}\b')


def parse_tables(text, first_page=FIRST_PAGE, include_locations=False):
    """Use Annex II/III headings and coordinate-bearing rows, not narrative mentions."""
    result = {}
    section = None
    for offset, page in enumerate(text.split('\f')):
        flat = ' '.join(page.upper().split())
        if re.search(r'^\s*ANNEX II\s*$', page, re.M) and 'INTERVENTIONS LIST' in flat:
            section = 'source_documented'
        if re.search(r'^\s*ANNEX III\s*$', page, re.M) and 'SUSPICIOUS LOCATIONS' in flat:
            section = 'source_suspected'
        if section is None:
            continue
        lines = page.splitlines()
        for index, line in enumerate(lines):
            match = CODE.match(line)
            if not match:
                continue
            # Private collection uses coordinate text only to recognize table rows.
            # Location output requires the separate operator projection flag.
            row = line
            for following in lines[index + 1:index + 3]:
                if CODE.match(following):
                    break
                row += ' ' + following
            if not COORDINATES.search(row):
                continue
            code = match.group(1)
            item = {'case_key': f'amnesty:KH:{code}', 'site_code': code,
                    'country': 'Cambodia', 'evidence_level': section,
                    'pdf_page': first_page + offset,
                    'section': 'Annex II' if section == 'source_documented' else 'Annex III'}
            if include_locations:
                coordinates = re.findall(r'\d{1,3}\.\d{3,}', COORDINATES.search(row).group())
                latitude, longitude = map(float, coordinates)
                if not (9 <= latitude <= 15 and 102 <= longitude <= 108):
                    raise ValueError('Report coordinate outside Cambodia; review extraction')
                item['location'] = {'latitude': round(latitude, 2),
                                    'longitude': round(longitude, 2), 'radius_m': 2000}
            if code in result and result[code]['evidence_level'] != section:
                raise ValueError('A site appears in conflicting source sections; review extraction')
            result.setdefault(code, item)
    return list(result.values())


def extract_profiles(pdf_path, adapter):
    if adapter != ADAPTER:
        raise ValueError('Unsupported report profile adapter')
    response = subprocess.run(['pdftotext', '-layout', '-enc', 'UTF-8',
                               '-f', str(FIRST_PAGE), '-l', str(LAST_PAGE),
                               str(Path(pdf_path)), '-'],
                              capture_output=True, timeout=45, check=True)
    if len(response.stdout) > 4 * 1024 * 1024:
        raise ValueError('PDF text exceeds adapter limit')
    text = response.stdout.decode('utf-8', 'replace')
    cases = parse_tables(text, include_locations=True)
    counts = {kind: sum(row['evidence_level'] == kind for row in cases)
              for kind in ('source_documented', 'source_suspected')}
    # These are published table totals, not a mechanism to manufacture rows.
    if counts != {'source_documented': 86, 'source_suspected': 36}:
        raise ValueError(f'Report table count check failed: {counts}; no site candidates imported')
    return cases, text


def save_cases(db, document_id, cases):
    added = 0
    for item in cases:
        before = db.total_changes
        db.execute('''INSERT OR IGNORE INTO crawl_site_cases
            (case_key,site_code,country,evidence_level) VALUES(?,?,?,?)''',
                   (item['case_key'], item['site_code'], item['country'], item['evidence_level']))
        added += db.total_changes - before
        db.execute('''INSERT OR IGNORE INTO crawl_site_evidence
            (case_key,document_id,pdf_page,section,source_classification)
            VALUES(?,?,?,?,?)''',
                   (item['case_key'], document_id, item['pdf_page'], item['section'], item['evidence_level']))
    return added
