# Crawler proposal for /belt-road/

Research checked 2026-10-20. This document describes the intended architecture.
A bounded discovery pilot now exists in crawl.py; see OPERATIONS.md for its
implemented subset and Lightsail test commands. No automatic schedule is configured.

## Start with report sources and use Wikipedia for discovery

Initial curated source registry:

- Amnesty International, 2025 Cambodia report and its annexes, followed by
  newer reports/corrections rather than assuming its observations remain current:
  https://www.amnesty.org/en/documents/asa23/9447/2025/en/
- Amnesty, June 2026 follow-up:
  https://www.amnesty.org/en/latest/news/2026/06/cambodia-evidence-suggests-scamming-compounds-bypassed-despite-high-profile-crackdown/
- OHCHR, February 2026 report on trafficking into scam operations:
  https://www.bangkok.ohchr.org/reports/wicked-problem-seeking-human-rights-based-solutions-trafficking-cyber-scam-operations
- GI-TOC's Compound Crime report, available through ASEAN–Australia Counter
  Trafficking: https://www.aseanact.org/resources/compound-crime-cyber-scam/
- Humanity Research Consultancy's specialist publication library (a consultancy,
  not presented here as an NGO):
  https://www.humanity-consultancy.com/areas-of-focus/publications-scamming-compounds
- Wikipedia topic pages, such as scam centers in Cambodia/Myanmar, as discovery
  indexes. Search the MediaWiki API and follow citations to original reporting:
  https://www.mediawiki.org/wiki/API:Search

These are relevant starting sources, not endorsements of every assertion or
proof of a Belt and Road relationship. Discover sites from evidence of abuse,
then research project links separately. Search terms limited to Belt and Road
would miss cases and bias the result.

## Important evidence distinction

A report documenting abuse at 53 sites does not establish 53 publicly leaked
victim communications. Extract each claim and source type separately:

- public_distress_message: original communication intentionally public;
- reported_distress_message: a publication describes a victim's communication;
- survivor_testimony: later interview/account, not automatically a leaked plea;
- institutional_finding: an NGO/UN/enforcement finding, not a victim message.

The existing skull-marker criterion is a public report of a victim communication.
The first two kinds can be considered for that layer after review. Other kinds
stay in the research queue unless the product scope is explicitly expanded.
Never label an interview as a leaked message to pass the current importer.
Do not collect victims' private contact information, identify anonymous survivors,
or expose shelters/unpublished rescue locations.

## Proposed architecture

Use Python in py/belt_road/, root-level uv, and bounded publisher-specific Scrapy
spiders. The current standard-library catalogue remains the publication boundary.
Scrapy has built-in throttling, robots handling, retries and export support; a
browser is unnecessary for the initial HTML/PDF source set. Fetch-only workers
must not receive the catalogue's publication privileges.

Discovery → fetch → extract → research candidates → review → catalogue draft
import → publication snapshot → static export → normal site build/deploy.

Proposed modules, not existing commands:

- sources.toml: allowed hosts, listing/report URLs, topic terms, maximum depth,
  schedule and per-host limits. Registry reviewed before adding arbitrary domains.
- spiders/: one adapter per publisher plus Wikipedia API discovery.
- documents.py: document metadata, hashes, bounded HTML/PDF text extraction;
  OCR only for selected scanned documents with confidence retained.
- extract.py: structured proposals with original supporting paragraph/page.
- candidates.py: persistent queue supporting unknown places and incomplete facts.
- match.py: canonical URLs, alias matching and duplicate-source grouping.
- review.py: show proposed case, source context, geography and uncertainty;
  emit only approved, complete candidate JSON for catalog.py import.

Models, if later used, propose extraction with citations. They cannot invent
locations, infer guilt, treat fetched instructions as commands or publish records.
Store the parser/model version and preserve the original language alongside any
translation. A missing fact stays unknown.

## SQLite extensions needed before the first real spider

The current importer requires complete coordinates and source fields. It is not
suitable for raw research discoveries. Add a separate private queue first:

- crawl_sources: publisher, allowed hosts/paths, seed URLs, enabled/schedule.
- crawl_jobs: URL, discovered-from, source ID, status, attempts, next-attempt time.
- crawl_documents: canonical/final URL, fetch status/time, content hash, MIME type,
  ETag/Last-Modified, private artifact reference, parser version and extraction state.
- crawl_candidates: stable candidate ID, document ID, claim kind, site aliases,
  place text, optional proposed geometry, evidence locator, original supporting
  text, dates and review status. Missing location/date is permitted here.
- candidate_links: same-site suggestions, supporting/contradicting/context sources,
  independent-source groups, reviewer decision and eventual catalogue case ID.

Deduplicate document content by hash, but preserve distinct publisher URLs and
versions. Do not merge cases solely on matching compound names or coordinates.
One source republished on ten sites is still one origin, not ten confirmations.
No public map marker should result directly from queue insertion.

Store bounded private artifacts outside docs/ and git; respect reuse permissions,
define retention and avoid archiving unnecessary personal information. On changed
content retain a new observation rather than rewriting prior evidence silently.
Unknown publication dates remain unknown in research; do not substitute fetch time.

## Bounded first run and incremental operation

First run: Amnesty's 2025 report plus a current follow-up, one HRC listing and
one GI-TOC report; cap the whole run at 100 documents and review 5–10 candidate
cases. This is a collection pilot, not an open-ended web crawl.

Start with one concurrent request per host and a conservative delay. Respect
robots/access rules, Retry-After, caching and publisher limits. Use a descriptive
User-Agent. Bound redirects, body size, PDF pages, decompression, timeouts and
retries; prevent private-network fetches and validate redirects/DNS destinations.
Do not bypass login, paywalls, CAPTCHAs or API blocks. Run document parsing in a
restricted worker. Log fetch failures without dumping source content or victim
information into operational logs.

Use conditional requests and hashes to skip unchanged documents. Poll chosen
report indexes daily at most initially; revisit stable report files less often.
Scheduling is proposed only. Wikipedia access uses its API, page/revision IDs,
continuation and backoff/maxlag behavior; citations are separately fetched under
approved-source rules. Do not scrape search-engine result pages for a production
crawler; add a supported search API only when targeted discovery needs it.

Test stale/changed reports, duplicate syndication, city-only locations, ambiguous
names, source-language variants, inaccessible PDFs, partial imports, private
locations and the distinction between victim messages and survivor interviews.

## Relevant technical documentation

- MediaWiki search: https://www.mediawiki.org/wiki/API:Search
- MediaWiki maxlag: https://www.mediawiki.org/wiki/Manual:Maxlag_parameter
- Scrapy throttling: https://docs.scrapy.org/en/latest/topics/autothrottle.html
- Scrapy robots settings: https://docs.scrapy.org/en/latest/topics/settings.html#robotstxt-obey
- Scrapy export: https://docs.scrapy.org/en/latest/topics/feed-exports.html
