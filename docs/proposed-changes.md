# Proposed changes to the model (40 items, none applied yet)

Status of every item: **proposed**. The user has not yet accepted, rejected or deferred any. The user's standing rule: discuss before changing the model. Evidence IDs (E##) refer to `../data/evidence.json`. "(new)" = raised after the first review.

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
