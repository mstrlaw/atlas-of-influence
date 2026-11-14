# How sources are analysed

Version 0.1, 13 Nov 2026. This is a first version and is meant to be strengthened.

Every fact in the Atlas comes from a source that was read and broken down into evidence rows in `data/evidence.json`. This page describes how that is done, so that a reader can judge the result and anyone can repeat or challenge it.

## Who does the reading

Sources are read by an AI model (Claude), working with the project's maintainer, who supplies the sources and reviews the output. An AI reader can misread, over-compress or miss context. The method below is designed to make its work checkable, and the limits at the end of this page say what it does not yet guarantee.

## The method

1. **Capture.** Record the URL and the date read. Save a screenshot under `data/sources/` and, where possible, an archive link, so the source can be checked if the page changes.
2. **Read the source itself, in full.** Not a summary of it, a search excerpt or another outlet's account. If only part can be read, or it is known only through other coverage, that is recorded in `read_status` and the row says so.
3. **Extract facts one at a time.** Each evidence row holds one fact. A fact must be supported by a specific passage in the source; if no passage supports it, it is not written. Figures, dates, names and quotations are copied, not paraphrased from memory.
4. **Separate what the source knows from what it relays.** For each fact, identify its basis: a document the source saw (filing, court record, leak), its own test or data, a named person, an anonymous person, or the source's own assertion or opinion.
5. **Grade the fact by its basis**, using the table below. One grade per row. If parts of a fact have different bases, split it or grade the main fact and explain the rest in `note`.
6. **Record responses.** What the people and organisations named said in reply (denial, explanation, admission, no reply) goes in `responses`, next to the allegation.
7. **Record the source's own position.** If the source's ownership or interest bears on the claim (state funding, a party to the dispute), say so in `note`.
8. **State what is not established.** Attribution that researchers declined to make, effects that were not measured, causation that was not shown.
9. **Check the row against the source.** Reread each row against the passage it rests on. Anything the source does not contain is removed or marked as coming from elsewhere.

## Grades

| Grade | Basis |
|---|---|
| documented | Filings, court records, platform reports, peer-reviewed studies, authenticated leaks |
| reported | Investigative journalism, reproducible tests, research cited in journalism |
| claimed | An actor's or vendor's own statement, unverified |
| contested | Credible accounts conflict |
| opinion | Commentary or argument |

The grade describes the basis for the fact, not whether the Atlas believes it. A denial is graded "claimed" for the same reason an unverified accusation is.

## Read status

| Value | Meaning |
|---|---|
| full | The cited source was read in full |
| partial | Paywalled or truncated; part was read |
| secondhand | Known through other coverage of it |
| unread | Not read; the row records only that the source exists |

## A prompt you can reuse

To analyse a source the same way, give a capable AI model the full text of the source and this prompt.

```text
You are analysing one source for the Atlas of Influence, a public, sourced map of
how actors shape what people see online. Work only from the text I give you.

Source URL: <url>
Publisher, author, date: <as shown on the page>
Text: <full text>

Produce a JSON array of evidence rows. For each distinct fact in the text that
concerns who influenced what, how, through which platform, at what cost, with
what effect, or how anyone responded:

- "fact": one fact, in one or two plain sentences. Copy figures, dates and names
  exactly. Do not add anything the text does not say.
- "quote": the passage in the text that supports the fact, verbatim.
- "basis": one of document, own_test_or_data, named_person, anonymous_person,
  source_assertion, opinion.
- "confidence": one of documented (filings, court records, platform reports,
  peer-reviewed studies, authenticated leaks), reported (investigative journalism,
  reproducible tests, research cited in journalism), claimed (an actor's own
  unverified statement), contested (credible accounts conflict), opinion.
- "note": anything a reader needs to weigh the fact: a part graded differently,
  the source's own interest in the matter, a method the text does not show.
- "responses": for each person or organisation named, what they said in reply:
  {"by", "type": denial | explanation | admission | no_reply, "summary"}.
- "not_established": what the text itself says is unknown, unattributed or unproven.

Rules:
1. If you cannot quote a passage that supports a fact, leave the fact out.
2. Keep what the source saw apart from what it was told and what it argues.
3. Record allegations as allegations. Name intermediaries without implying they
   did wrong unless the text says so.
4. Do not judge whether a claim is true. Grade its basis.
5. If the text is cut off or paywalled, say so first and analyse only what is there.

Then list separately: facts in the headline or summary that the body does not
support, and anything you were unsure how to grade.
```

## Limits of this version

- **Supporting quotes are not yet stored.** The prompt asks for them, but the evidence log has no `quote` field, so a reader cannot yet see the exact passage behind each row.
- **Rows E01 to E83 predate this method.** Eighteen of them were re-read in full on 13 Nov 2026 and corrected; the rest were logged by an earlier session and have not been re-checked against step 9.
- **One reader.** There is no second, independent pass and no systematic human spot check yet.
- **The source's own accuracy is not tested.** The method records what a source says and on what basis; it does not verify the source's underlying documents.
