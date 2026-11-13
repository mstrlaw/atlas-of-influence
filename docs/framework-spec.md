# Atlas of Influence — Framework Spec

Snapshot of the living doc "Atlas of Influence — Framework Spec" (Claude Docs, main tab, rev 20, 8 Nov 2026). The doc is the source of truth while the model is being refined; this file is a copy for the code session. Evidence lives in `../data/evidence.json` (E01–E83).

## Purpose and scope

The Atlas of Influence traces how actors, institutions and machines shape what content reaches a phone screen, and what it does to the person reading it. It is a learning tool: every claim is a sourced path through a shared model, not an accusation.

The early sketch put everything on one "influence methods" axis. That axis mixes five independent dimensions; separating them is the core design decision:

| Dimension | Question it answers | Examples from the sketch |
|---|---|---|
| Actor | Who acts? | Murdoch, Sinclair, Bezos/WaPo, Musk/X, RT, Havas |
| Mechanism | How? | Framing, sanewashing, dataset bias, ranking, paid influencers |
| Layer | Where in the chain? | Ownership, newsroom, platform, LLM, crowd |
| Effect | What does it do to a mind? | Filter bubbles, polarization, distorted perception |
| Case | When did it really happen? | WaPo opinion overhaul, Grok tuning, Tenet Media, Hanover Institute |

A **case** recombines the other four as an ordered path: actor → mechanism → layer → … → screen → effect. That path is what the 3D atlas will animate.

## Frameworks we build on

No single framework covers the whole chain, so the Atlas borrows each for the layer it describes best, reusing their terms and IDs.

| Framework | Contributes | Layers |
|---|---|---|
| [DISARM](https://www.disarm.foundation/faqs) (after MITRE ATT&CK) | Catalogue of influence-operation tactics and techniques (TTPs) with IDs, content-agnostic | L2–L5 |
| ABC → ABCDE (François; Pamment) | Actors, Behaviours, Content, Degree, Effect as axes of analysis | All |
| Information Disorder (Wardle & Derakhshan) | Phases create → produce → distribute; mis/dis/mal-information by falsity × intent | L2–L3 |
| Propaganda model (Herman & Chomsky) | Five structural filters: ownership, advertising, sourcing, flak, ideology | L1 |
| Framing (Entman) and agenda-setting (McCombs & Shaw) | How selection and salience shape interpretation | L2 |
| Invisible Rulers (DiResta) | Influencers, algorithms and crowds as one system; bespoke realities; asymmetry of passion | L4–L5 |
| Our Minds Under Siege (Giussani) | Technologies of influence targeting attention, perception and autonomy; technology as architecture | L6–L7 |
| Network Propaganda (Benkler, Faris, Roberts) | Empirical measurement of asymmetric media ecosystems | L1–L5 |
| Participatory disinformation (Starbird) | Crowds co-produce narratives with elites | L5 |
| Computational propaganda (Woolley & Howard) | Bots and automated amplification | L5 |

Giussani's chapter-level list of attack vectors is not yet mapped (open question).

## The pipeline: world to screen

The "where" dimension is a seven-layer pipeline; it becomes the depth axis of the 3D scene, from the phone (L6/L7 side) back to structure (L1). (The doc embeds a diagram widget; it is described here in text.)

- **L1 Structure**: ownership, funding, advertiser dependence, state/commercial control.
- **L2 Production**: what gets written, framed, laundered, or manufactured (articles, fake think tanks, op-eds, synthetic media).
- **L3 Entry**: how content gets into a platform: direct posting, or web publication that is later scraped (SEO/GEO).
- **L4 Mediation**: ranking, search, moderation, ads; for LLMs: training corpus, retrieval, owner tuning, output loop.
- **L5 Crowd**: users, influencers, bots, brigades re-amplifying.
- **L6 Interface**: the phone UI: feed, notifications, infinite scroll, chat answers.
- **L7 Mind**: attention, perception, autonomy, trust, polarization.

Two feedback loops are modelled: crowd engagement is a ranking input (DiResta: "if you make it trend, you make it true"), and model output posted online is re-scraped into the next model. Proposed additions: audience → production (L7 → L2) and an L0 Infrastructure layer.

How the sketch maps: the five Herman & Chomsky filters and ownership are L1; framing, op-eds and sanewashing are L2; the preference-based effects model is a demand-side theory linking L2 to L5; algorithmic editorialisation is L4. GenAI splits in two: dataset bias is L3→L4 via scraping, while ideological tuning (Grok) is an L1 owner acting directly on L4.

## Attributes: mundane vs adversarial

The same mechanism can be benign or hostile; the difference lives in four attributes attached to each *use* of a mechanism, not to the mechanism itself. A recommender optimising watch time and a state-funded GEO campaign both act on L4; their attributes differ.

| Attribute | Values |
|---|---|
| Intent | structural (incidental to a business model) · ideological/editorial · adversarial (influence operation) |
| Transparency | overt · undisclosed · deceptive (fronts, fake personas) |
| Coordination | individual · organisational · networked |
| Origin | domestic · foreign |

Example: a chatbot repeating propaganda because it is all over the web (structural) is a different case from one deliberately tuned to do so (ideological), even though both read as "LLM bias".

## Mechanism catalogue (draft)

Thirty mechanisms, each placed on a layer and tied to the framework that defines it. IDs are stable keys for the JSON; DISARM technique IDs are still to be filled in.

| ID | Mechanism | Layer | Reference |
|---|---|---|---|
| own.consolidation | Ownership consolidation | L1 | Herman & Chomsky, filter 1 |
| own.directive | Owner editorial directive (e.g. must-run segments, opinion-section mandate) | L1→L2 | Herman & Chomsky, filter 1 |
| fund.ad_dependence | Advertiser dependence | L1 | Herman & Chomsky, filter 2 |
| fund.state_overt | Overt state media funding | L1 | ABCDE: Actor |
| fund.covert | Covert funding via intermediaries or shells | L1 | DISARM; FARA |
| pressure.flak | Flak: organised pressure on outlets | L1 | Herman & Chomsky, filter 4 |
| prod.framing | Framing and selective emphasis | L2 | Entman |
| prod.agenda | Agenda-setting (what gets covered) | L2 | McCombs & Shaw |
| prod.headline | Headline editorialisation, sanewashing, innuendo | L2 | Entman |
| prod.influencer | Paid or sponsored influencer content | L2 | DiResta; DISARM |
| prod.front | Front organisations (fake think tanks, fake local news) | L2 | DISARM |
| prod.laundering | Narrative laundering via republication | L2 | DISARM |
| entry.direct | Direct posting to a platform | L3 | Wardle: distribution |
| entry.web | Publishing to the open web (later scraped) | L3 | Wardle: distribution |
| entry.seo_geo | SEO and generative-engine optimisation (GEO) | L3→L4 | Industry practice |
| plat.ranking | Engagement-optimised recommendation | L4 | Pariser; DiResta |
| plat.search | Search ranking | L4 | — |
| plat.moderation | Moderation decisions and gaps | L4 | — |
| plat.ads | Ad and micro-targeting | L4 | Zuboff |
| llm.corpus | Training-corpus seeding (slow, persistent) | L4 | ASP "LLM grooming" |
| llm.retrieval | Retrieval seeding via GEO (fast, citable) | L4 | Politico/Guardian tests |
| llm.owner_tuning | Owner fine-tuning or system-prompt steering | L1→L4 | — |
| llm.output_loop | Model output reposted and re-scraped | L4→L3 | — |
| crowd.inauthentic | Bots, sockpuppets, fake accounts | L5 | Woolley & Howard; DISARM |
| crowd.participatory | Organic re-amplification, brigading | L5 | Starbird; DiResta |
| ui.design | Infinite scroll, autoplay, notifications | L6 | Attention-economy literature |
| prod.query_mirroring | Headlines phrased as the questions users ask chatbots | L2→L4 | Guardian analysis of Hanover |
| prod.manufactured_doubt | Manufactured uncertainty ("no court has ruled", "a party to the events") | L2 | Entman; Guardian analysis |
| prod.citation_stuffing | One source repeated across unrelated topics to anchor a counter-frame | L2 | Guardian analysis |
| fund.disclosure_gap | Payments routed through a foreign intermediary so no single filing shows the campaign | L1 | FARA filings |

The four `llm.*` entries came out of the Israeli cases: Pravda targets the training corpus, while Hanover and Clock Tower X target retrieval, a distinct and faster mechanism.

## Data model

Eight record types: six describe the world, Relation connects actors, and Case is an evidenced path through all of them. This extends the current entities/concepts/links JSON rather than replacing it.

```jsonc
Layer     { id, order, name }
Actor     { id, name, kind, country, concepts[],
            authentic: bool,          // false for fronts (Hanover, Pravda sites)
            front_for?: actorId }
          // kind: state | owner | platform | publisher | outlet | influencer | think_tank
          //       | pr_firm | influence_vendor | content_farm | crowd | regulator
Mechanism { id, name, layer, family, refs[], definition }
Venue     { platform, surface: feed | search | chat | broadcast | print | notification }
Effect    { id, target: attention | perception | autonomy | trust | polarization,
            level: proximate | ultimate, criterion }
Source    { url, publisher, date, type: fara | indictment | court | academic | journalism
            | platform_report | vendor_claim }

Relation  { source, target, kind, covert: bool, weight, sources[] }
          // kind: owns | funds | pays | contracts | directs | staffs | syndicates_to
          //       | publishes_on | scraped_by | amplifies | lobbies | regulates

Case      { id, title, period, summary,
            attributes: { intent, transparency, coordination, origin },
            steps: [{ order, actor, mechanism, layer, venue?, enabled_by?, target?,
                      confidence, sources[] }],
            effects[] }
```

Three design choices matter:

- **Confidence is per step, not per case.** In the Hanover case the funding is documented in FARA filings, the mechanism by site analysis, and the effect only by journalists' retrieval tests.
- **Contract chains are first-class.** State → agency → PR firm → vendor is a chain of `contracts`/`pays` relations, so the atlas can show money flowing down to the mechanism.
- **Effects feed the Influence Facts sheet.** A platform's scores derive from the mechanisms present in its cases, not from hand scoring (aggregation method still undefined).

## Seed cases

Seven cases cover several actor origins, every layer, and the range from overt and legal to covert. They are the first `Case` records.

| Case | Actor origin | Path through layers | Key mechanism | Transparency | Evidence |
|---|---|---|---|---|---|
| Hanover Institute (2026) | Israeli state (LaPam) → Havas Media Germany → Piro ($1M) → Res | L1 funding → L2 fake think tank → L3 web + GEO → L4 retrieval → chatbot | llm.retrieval, prod.front | Deceptive | FARA; Guardian site analysis; Politico retrieval tests; not yet in Common Crawl |
| Clock Tower X (2025–26) | Israeli state (LaPam) → Havas Media Germany → Clock Tower X ($15M paid) | L1 $46.5M contract → L3 low-traffic sites + SEO → L4 retrieval and training corpus (7 sites, 294 entries in Common Crawl's July index) | llm.retrieval, llm.corpus, entry.seo_geo | Disclosed contract, undisclosed sites | FARA; Drop Site analysis; vendor claims |
| Pravda network (2022–) | Russian state-aligned | L2 laundering → L3 3.6M articles on web → L4 training corpus → chatbot | llm.corpus, prod.laundering | Deceptive | NewsGuard audit; ASP report |
| Tenet Media (2023–24) | Russian state via RT and shells | L1 covert funding → L2 influencers → L3 direct posting → L4 ranking → L5 | fund.covert, prod.influencer | Covert | DOJ indictment |
| STOIC / Zero Zeno (2024) | Israeli for-hire firm | L2 AI-generated content → L3 posting → L5 fake accounts | crowd.inauthentic | Deceptive | OpenAI and Meta reports |
| Sinclair must-runs | US owner | L1 ownership → L2 directive → local broadcast | own.directive | Overt | Public reporting (to source) |
| Grok tuning | Platform owner (X/xAI) | L1 owner → L4 system prompt or fine-tune → chatbot | llm.owner_tuning | Semi-overt | Owner's own posts (to source) |

The Tenet indictment did not allege wrongdoing by the influencers; the model records them as actors in the path, not as culpable parties.

### Hanover Institute in detail

The [Guardian's analysis](https://www.theguardian.com/world/2026/aug/26/fake-thinktank-israel-ai-propaganda) shows how one case exercises every layer of the model:

- **L1 chain.** Israel's government ad agency LaPam contracts Havas Media Germany, which pays five US firms registered under FARA, among them Clock Tower X ($15M, Oct 2025 to Mar 2026), Targeted Communications Global ($9.9M) and Piro ($1M). Havas's US arm deregistered on 31 Oct 2025, so the full campaign appears only in the contractors' separate filings (fund.disclosure_gap).
- **L2 content.** 124 reports and 560,000 words in nine days. All but one headline is phrased as a chatbot question. Framing devices recur: "no court has ruled" in 20 reports, "a party to the events" in 55, and one 2022 study cited 454 times across 88 reports.
- **L3 entry.** Built on Res, a GEO vendor, with a standard llms.txt file; Res's founder registered as Piro's subcontractor. The disclosure appears only in the site footer.
- **L4 two routes.** Retrieval (cited by ChatGPT and Perplexity in tests) and training data via Common Crawl, where Clock Tower X's sites already appear.
- **Countervailing loop.** After the reporting, ChatGPT's answers began flagging the institute's funding controversy and linking Quincy's coverage. Journalism re-enters the same retrieval layer.
- **Effect gap.** Researchers say it moves chatbot answers, but US polling on Israel kept declining. The model therefore separates the *proximate* effect (what the machine says) from the *ultimate* effect (what people believe).
- **Disclosed contract, undisclosed purpose.** Politico broke the story on 14 Aug 2026. Piro's FARA filings describe "informational materials" and do not mention LLMs, whereas Clock Tower X's contract names "GPT framing" outright. The model records this as a transparency value distinct from both overt and covert.

The same Havas chain also funded an overt social campaign (Freedom Not Terror, marked "Paid for by LAPAM"), so one funder can run deceptive and overt cases in parallel. Israel's foreign ministry says it does not run influence operations in the US. Piro says it was hired to put accurate, sourced facts on the record.

## Evidence and neutrality rules

The Atlas is credible only if every edge can be checked and the catalogue does not pick sides.

1. Every Case step carries at least one Source and a confidence grade: **documented** (filings, indictments, platform reports, peer-reviewed audits), **reported** (investigative journalism, reproducible tests), **claimed** (vendor or actor self-reports), **contested**. (The log also uses *opinion*, *pending text* and *claimed (official, evidence not released)*.)
2. Mechanisms are ideology-agnostic. Cases should span actor origins (Russian, Chinese, Iranian, Israeli, US government and private) and ownership directives across the political spectrum.
3. Distinguish layers precisely: a social-media influence operation (L5, e.g. STOIC) is not LLM poisoning (L4, e.g. Hanover).
4. Name intermediaries without implying culpability unless a source does (e.g. Tenet's influencers).
5. Prefer primary sources (FARA filings, court documents, platform transparency reports) over syndications.

## Open questions and next steps

Open questions:

- [ ] Giussani's attack vectors: share the chapter-level list so each maps to a layer and mechanism.
- [ ] Effect taxonomy: rename the Influence Facts groups to Attention / Perception / Autonomy + Trust, or keep Harms / Polarization / Incentives? (A comment is pending in the doc on this.)
- [ ] Drop Site's chatbot-query methodology, to grade Clock Tower X's effect evidence.
- [ ] Should countervailing actors (journalists, researchers, platform trust and safety, regulators) appear as cases of their own?
- [ ] Link directionality and nested concepts in the JSON (carried over from the 3D work).

Next steps:

1. Fill DISARM technique IDs into the mechanism catalogue.
2. Source the Sinclair and Grok rows, and add Chinese and Iranian cases for balance.
3. Encode the seven cases as `Case` records in the JSON.
4. 3D mapping: layers become depth bands behind the phone; mechanisms light up on edges; a selected case plays as an animated path from L1 to the screen; fronts sit inside their concept sphere but are drawn as hollow cubes.

## Sources

- The Guardian, 26 Aug 2026, fake think tank / Israel AI propaganda (text supplied by the user)
- Quincy Institute, 28 Jul 2026, "Israel is paying millions to train AI chatbots how to talk about Gaza" (summarising Drop Site News)
- Politico Influence, 14 Aug 2026, "Israeli PR wants to answer your ChatGPT questions" (text supplied by the user; also via Arab News and Calcalist)
- Gizmodo, "Israel seeds internet with articles from opaque group to influence AI chatbots"
- Truthout, Clock Tower X contract details
- NewsGuard, Pravda network audit
- NBC New York, DOJ: influencers helped spread Russian disinformation
- NBC News, Meta and OpenAI disrupt STOIC operation
- DISARM Foundation FAQ
- Invisible Rulers summary (wiki.pedrodoria.com.br)
- Our Minds Under Siege (University of Chicago Press)
