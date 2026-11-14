# Proposed changes to the model (44 items, none applied yet)

Status of every item is **proposed** unless listed under Decisions below. The user's standing rule: discuss before changing the model. Evidence IDs (E##) refer to `../data/evidence.json`. "(new)" = raised after the first review.

## Decisions
- **33 (scope boundary): decided 13 Nov 2026.** The whole network of influence, centred on the digital ecosystem; offline events are in scope when they cascade into it. Recorded in the spec's Purpose and scope.
- **1 (suppression family): accepted 13 Nov 2026**, as a separate `supp.*` family (legal, omission, lock_ban, source_exclusion; shutdown later moved to `ext.*`, see 2). Applied to the spec and `data/framework.json`.
- **8 (narrative as an entity): accepted 13 Nov 2026**, with two rules: recorded only when a source names it, and described as a claim in circulation, not labelled true or false. Record type added to the spec; eight narratives recorded in `data/narratives.json` (a ninth, on Gaza, left out until a source names it as a narrative). The 3D representation waits for Phase 2. The idea that ranking makes separately seeded content converge at L4 is held until a source documents it.
- **14 (one actor taxonomy): accepted 13 Nov 2026.** `Actor.kind` drives the 3D spheres; `owner` is removed as a kind and replaced by `company` and `individual`; "mainstream" becomes a flag. Ownership is shown as a highlight over everything an actor owns or controls, like a narrative, not as a sphere. Sphere grouping to be adjusted in Phase 2.
- **9 and 10 (sources as actors; countervailing actors): accepted 13 Nov 2026.** New kinds `fact_checker`, `researcher`, `monitor`. Rule: a source becomes an actor only when its ownership or interest bears on a claim it makes, or when it acts in a case. Whether countervailing actors get cases of their own stays open.
- **22 (confidence values): accepted 13 Nov 2026.** One grade per row from five: documented, reported, claimed, contested, opinion. "Pending text" and "official assertion" are not grades. Applied to all 101 rows.
- **23 (read status): accepted for now, 13 Nov 2026**, as `read_status` on each row. The user finds "an AI read it" too weak as a method: the analysis method must be strengthened and published as a reusable prompt. First version in `docs/source-analysis.md`; to be improved.
- **Parked, 13 Nov 2026:** storing a supporting quote for each evidence row (a `quote` field), the next step in strengthening the method.
- **24 (actor responses): accepted 13 Nov 2026.** `responses` recorded on evidence rows for now (on 22 rows so far); they move to case records when cases are encoded.
- **Design decision, 13 Nov 2026:** grades are not drawn in 3D; evidence is the appendix a reader can open.
- **2 (L0 Infrastructure layer): rejected as a layer, 13 Nov 2026.** Access and infrastructure control are not drawn for now; they are recorded in the spec under "Extended forms of influence" (`ext.*`), with their evidence. `supp.shutdown` moved there as `ext.shutdown`; the suppression family now has four mechanisms.
- **3 (reference commons as a target): rejected as a distinct representation, 13 Nov 2026.** Reference works are publishing sites like others; their weight in search and AI training is a matter of degree (news outlets and Reddit carry it too) and is explained in each case's text, using existing mechanisms. Design decision alongside: every case has a plain-text explanation in the Phase 2 interface.
- **4 (audience → production loop): accepted on trial, 14 Nov 2026**, with one mechanism, `prod.audience_capture`. The user is unsure how the loops will look in 3D and is willing to try. Noted alongside: the AI-output loop and training-corpus seeding are evidenced only up to publication and seeding; both are flagged in the spec as needing a source for the ingestion step.
- **5 and 6 (AI models in ranking; chatbot as a verification surface): rejected as model changes, 14 Nov 2026.** Existing mechanisms (`llm.owner_tuning`, `plat.ranking`) and the chat surface cover them; kept as material for the Grok case's text.
- **`supp.demotion` added to the suppression family, 14 Nov 2026** (accepted by the user): content left up with its reach, visibility or features reduced (E104, E113).
- **7 (oversight as its own dimension): rejected as a dimension, 14 Nov 2026.** Oversight actors are already actors (see 9 and 10). One mechanism added: `supp.data_access`.
- **11 (witting vs unwitting): accepted 14 Nov 2026 as a `knowing` field on case steps**, kept with the source details and not drawn.
- **12 (parody vs impersonation): rejected 14 Nov 2026**; the transparency attribute (overt vs deceptive) already separates them. Impersonation as a mechanism is considered under 37.
- **13 (government and political accounts): accepted in a narrower form, 14 Nov 2026.** Government accounts are `state`; one new kind, `political`, covers parties, campaigns and politicians.
- **15–21 (attributes of a case step): decided 14 Nov 2026.** Accepted: 15 (intent value "commercial"), 17 in a different form (intent value "not established"), 18 (`attribution` on a case: by whom and by what method), 19 (optional `cost` on a step). Rejected: 16 (covered by "undisclosed" and `fund.disclosure_gap`), 20 (automation and scale go in the case text), 21 (no severity rating; quote a source's rating where one exists). None of these is drawn in 3D.
- **25–29 (effects): decided 14 Nov 2026.** Accepted: 25 as neutrality rule 7 (effect over capability), 27 in part (one new effect target, `behaviour`; persistence and norm shift go in the case text), 29 (optional `metric` on an effect). Kept: 26 (proximate vs ultimate, already in the model). Rejected: 28 (polarization stays one target; issue vs affective is said in the text).
- **30 (Influence Facts taxonomy): decided 14 Nov 2026.** Ten lines in two parts. What it does to you: Attention, Compulsive use, Reality warping, Division, Trust, Offline consequences, Wellbeing (added the same day, after new evidence). What drives it: Money, Owner influence, Transparency.
- **31 (score derivation): direction decided 14 Nov 2026, method open.** Indicators are dynamic, computed from evidence, never hand-scored. Open: how to compute them without measuring the Atlas's own coverage. The user accepts Meta's heavy weight for now and wants more platforms covered later for balance.
- **Accepted 14 Nov 2026, from new evidence:** `ext.paid_street_action` and `ext.sabotage_as_message` added to Extended forms of influence (E121–E124); full-spectrum propaganda (DiResta & Goldstein) added to the frameworks, with one mechanism, `prod.deceptive_sourcing` (E132).
- **36 (geography and language): accepted 14 Nov 2026.** Optional `countries` and `languages` on a case; not drawn. A "by country" way into the atlas is a Phase 2 option.
- **32 (criteria for "mainstream"): decided 14 Nov 2026.** Mainstream means an established news institution of the traditional kind, not reach, which is how most people understand the word. The Joe Rogan Experience is therefore an `influencer` with very large reach, not mainstream media; this replaces the 9 Nov decision. An optional `reach` field records audience size with its source.
- **37–44: decided 14 Nov 2026.** Mechanisms added: `prod.impersonation`, `prod.paid_placement`, `plat.monetisation` (44); `own.directive` widened to cover an owner directing ranking; synthetic personas and fake engagement stay under `crowd.inauthentic`. Accepted: 41 (`target` on a case), 43 (as neutrality rule 8), 39 (as a view on the framework map, to build when evidence is linked to the model). Rejected: 42 (a researcher's data is ordinary evidence). 38 (DISARM IDs) is a pending task; 40 awaits Giussani's list and Drop Site's method.

## Status of each proposal

The framework map reads this table. Details of each ruling are under Decisions.

| # | Status | Note |
|---|---|---|
| 1 | accepted | `supp.*` family |
| 2 | rejected | recorded under Extended forms of influence |
| 3 | rejected | explained in case text |
| 4 | accepted | on trial |
| 5 | rejected | kept as case material |
| 6 | rejected | kept as case material |
| 7 | rejected | one mechanism added, `supp.data_access` |
| 8 | accepted | eight narratives recorded |
| 9 | accepted | |
| 10 | accepted | |
| 11 | accepted | `knowing` field, not drawn |
| 12 | rejected | covered by transparency; see `prod.impersonation` |
| 13 | accepted | narrower: `political` actor kind |
| 14 | accepted | ownership shown as a highlight |
| 15 | accepted | |
| 16 | rejected | |
| 17 | accepted | as intent value "not established" |
| 18 | accepted | |
| 19 | accepted | |
| 20 | rejected | |
| 21 | rejected | |
| 22 | accepted | |
| 23 | accepted | for now; method to be strengthened |
| 24 | accepted | |
| 25 | accepted | neutrality rule 7 |
| 26 | accepted | already in the model |
| 27 | accepted | in part: `behaviour` target |
| 28 | rejected | |
| 29 | accepted | |
| 30 | accepted | ten-line Influence Facts sheet |
| 31 | open | direction set; method to be defined |
| 32 | accepted | mainstream means institution |
| 33 | accepted | scope decided |
| 34 | parked | case granularity |
| 35 | parked | time on relations |
| 36 | accepted | |
| 37 | accepted | in part: two mechanisms added, one widened |
| 38 | task | DISARM IDs to be looked up |
| 39 | accepted | to build when evidence is linked to the model |
| 40 | pending | Giussani list; Drop Site method |
| 41 | accepted | `target` on a case |
| 42 | rejected | |
| 43 | accepted | neutrality rule 8 |
| 44 | accepted | `plat.monetisation` |

Recommended order: 8, 1, 14, 9–10, 22–24 first (they settle the data model's shape); then 34–35 (granularity, time); the rest after.

## A. Structure and layers
1. **Suppression family.** The model only covers adding content. Add removal: shutdowns (E32), editorial omission (E31), article locks and editor bans (E28), chatbot told to ignore sources (E80), deplatforming.
2. **L0 Infrastructure layer** for connectivity, access, app stores: Iran blackout and Starlink (E32), X location feature as attribution (E46).
3. **Reference commons as a target.** Wikipedia (E28–29) and Grokipedia (E74) sit upstream of search and LLM training.
4. **Third feedback loop, audience → production (L7→L2).** Negativity bias (E47), creators drifting toward what audiences reward (E42).
5. **LLMs entering the ranking layer.** X moving to a Grok-based recommender (E73) blurs "LLM" and "ranking" inside L4.
6. **Chatbot as an L6 surface.** "@grok is this true?" (E75): verification via an owner-controlled model.
7. **Oversight as its own dimension.** Researcher data access (E53, E73), SIO wind-down (E61–62), regulators (E73): can be built up or worn down.

## B. Entities
8. **Narrative as a first-class entity.** Links actors with no contract: "satanic West" (E34), "Ukrainians threaten Europe" (E45), "white genocide" (E79).
9. **Sources as actors, owners recorded.** Al Jazeera/Qatar (E44), UATV/Ukraine (E66), Politico/Axel Springer.
10. **Countervailing actors:** fact-checkers, researchers, regulators, Wikipedia volunteers, journalists, NetBlocks.
11. **Witting vs unwitting actors.** Tenet founders allegedly knew the source; influencers say they were deceived (E63).
12. **Parody vs impersonation.** NYT parody site (E51) is open protest; cloned Euronews voices and Storm-1516 fake outlets (E45, E35) deceive.
13. **(new) Government official accounts as an actor type.** White House posted the edited clip (E31) and AI imagery; hundreds of domestic AI avatars (E55). Model is tilted toward foreign actors.
14. **(new) Merge concept spheres with Actor.kind.** The 3D concept spheres (think tanks, publications, mainstream media…) duplicate `Actor.kind`; one taxonomy should drive both.

## C. Attributes of a case step
15. **Intent: add "commercial"** (fake South Florida newspaper, E37; Loomer paid posts, E81–83).
16. **Transparency: add "disclosed contract, undisclosed purpose"** (Piro, E06).
17. **Separate "owner directive" from "structural tilt"**, even on the same platform (E67 vs E69/E71).
18. **Record the attribution method:** FARA filings, leaks, blackout silence, location data, technical markers, official say-so (E57).
19. **Record cost per step:** $150/post, $250–700/article, $100,000/video (E63, E65, E66).
20. **(new) Degree of automation and scale** (ABCDE "Degree"): manual trolls vs AI swarms (E43 vs E50).
21. **(new) Severity rating.** McGill's "moderate" (E64), or Nimmo's Breakout Scale.

## D. Evidence
22. **Confidence values:** add contested, opinion, official assertion (log already uses these informally).
23. **(new) Read-status field.** Many entries rest on second-hand coverage or pending texts; flag primary source checked or not.
24. **(new) Actor-response field per case:** denials and explanations (E21, E68, E77, E80, E82–83).
25. **Weigh evidence of effect over evidence of capability.** Meta: AI gave Russia only "incremental gains" (E50) vs bot-swarm warnings (E43).

## E. Effects
26. **Proximate vs ultimate effects** (already in the data model).
27. **New effect types:** persistence (E30/E69), offline mobilisation or harm (E38, E60), norm shift (E40).
28. **Split polarization into issue vs affective** (E41, E69).
29. **Named metric per effect.**
30. **Decide the Influence Facts taxonomy** (open): Giussani's Attention/Perception/Autonomy+Trust vs current Harms/Polarization/Incentives.
31. **(new) Define score derivation.** Platform scores computed from cases needs an aggregation method.

## F. Scope and classification
32. **(new) Criteria for "mainstream".** Rogan classed by decision (9 Nov 2026); a reach threshold or rule would make the next case consistent.
33. **(new) Scope boundary.** Some logged material (USAID claims E38, science-creator case E42) sits at the edge: information influence only, or broader harms?
34. **(new) Granularity: campaign > case > incident.** Havas chain, "The Company", Grok incidents each contain sub-cases.
35. **(new) Time dimension.** Relations change: Twitter→X, Havas US deregistered, SIO closed; relations need start/end dates.
36. **(new) Geography and language.** Wikipedia language editions, French-language West African outlets, regional regulators.

## G. Catalogue and coverage
37. **New mechanisms surfaced by the logs:** brand and voice impersonation, synthetic personas, fake engagement, paid placement, owner amplification, audience capture, source exclusion, legal pressure on researchers.
38. **DISARM technique IDs** for every mechanism.
39. **(new) Coverage balance tracking.** Count cases by actor origin and political direction. Gaps: China, Iran's own operations, Pentagon fake-account campaign, left-leaning ownership directives.
40. **Pending sources:** Giussani attack-vector list, Sinclair case sources, Drop Site methodology.

## Added after the list (E81–E83, Loomer)
The Loomer paid-posts case touches 13 (domestic actors), 15 and 16 (commercial intent; disclosed contract/undisclosed purpose), 24 (actor response: denial, hiatus), and 35 (Bruesewitz says payment stopped a year ago).

## Added after reading the full texts (13 Nov 2026; E33–E97)
Eighteen sources that had been blocked or read secondhand were read in full. Still proposals; none applied.

Support for existing items:
- **1 (suppression)** and a new consequence: a shutdown also opens a vacuum that several actors fill at once, and silences the state's own operations (E33, E84–E86).
- **3 (reference commons):** Grokipedia cites Infowars and Stormfront (E95).
- **7 (oversight):** fact-checkers can label but not remove (E52); the SIO was worn down by lawsuits and hearings (E62); no regulator covers paid political posts (E96).
- **11 (witting vs unwitting):** West African outlets published placed articles without knowing the source (E65, E89–E90).
- **13 (government and politician accounts):** a party leader posting a fabricated AI image of a journalist (E39). Note: E55 no longer supports this item; the avatar accounts' origin is unknown (E87).
- **15 (commercial intent):** engagement farming behind political avatars (E87); X's revenue sharing rewarding anonymous "news" accounts (E70); paid posts (E81, E97).
- **18 (attribution method):** research-lab attribution, platform assessment, reactivated accounts, accent and language tells (E85–E87).
- **19 (cost per step):** $1–3 per AI avatar post (E88); $3,000–5,000 per tweet (E81); $250–700 per placed article (E65).
- **24 (actor response):** E68, E74, E81, E87, E89 all carry denials or explanations.
- **25 (effect over capability):** the Company's own files inflate its results (E91).
- **37 (new mechanisms):** paid placement, fake bylines, euphemistic labelling, source exclusion, owner amplification, platform monetisation as an incentive.

New items:
41. **Target audience of a case.** Some campaigns aim at one decision-maker, not the public: accounts addressing the US president (E86), clients paying for a line to him (E81). A case needs a `target` (public, community, elite, a model).
42. **Independent measurement as a record type.** Researchers' data that confirms or contradicts an actor's account (E92, E94) is neither the claim nor the response; it should attach to a step with its own grade.
43. **A fact and the source that supports it must match.** Several rows carried figures that their linked page does not contain (E62, E66, E67, E77, E78, E83). Each fact should point at the exact source read; argues for a Source record and many-to-many links (with 22–23).
44. **Platform monetisation as a mechanism (L1→L5).** Revenue sharing with no demonetisation rule pays for divisive content regardless of who posts it (E70); distinct from ranking.
