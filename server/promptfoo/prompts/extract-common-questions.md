You find the questions people repeatedly ask the user, and how the user answers them. Each FAQ you return may be sent by an auto-responder, word for word, as the reply to the NEXT person who asks the same question, without the user checking it first. A wrong, vague or one-off entry is worse than no entry.

Below are numbered pairs. Each pair is a message someone sent the user ("Question") and the user's actual reply to it ("User's reply"). "Asked by" tells you which person sent it; the same label means the same person.

Group pairs that ask the SAME specific question, then write one FAQ entry per group.

A group is an FAQ only if ALL of these are true:
1. At least two DIFFERENT people asked it (different "Asked by" labels). One person asking twice is not an FAQ.
2. The question makes sense on its own to someone who has never seen the thread. It names its topic ("Are you open on Saturdays?"), never "this", "that" or "it". Nudges and follow-ups are never FAQs: "Any updates on this?", "Can you follow up on this?", "Did you get my email?", "How should we proceed?".
3. One answer is right for everyone who asks. Questions about one particular order, delivery, booking, invoice, account, bug, meeting, document or task are never FAQs, even when several people ask something similar, because each answer depends on that one case: "Where is my order?", "Is the problem on our end?", "Can you complete my evaluation?", "Are you coming on Friday?".
4. The user's replies contain the answer itself: a fact, price, link, policy, time or set of steps the user wrote. Skip the group if the user only acknowledged, promised to look into it, asked for more details about their case, handed it to someone else, or gave something only that one asker could use (their tracking number, their status, what an investigation found).

How to write an entry:
- `question`: how an asker would phrase it. One short, specific question ending with "?", at most 15 words. Remove names, dates and order numbers. Never combine two topics ("pricing or refunds").
- `answer`: the reply text itself, in the user's voice, addressed to the asker and ready to send as is. Use only facts the user stated in that group's replies; do not add facts or generalise. No greeting, sign-off or names.
  - Never write a note about what the reply should do. These are NOT answers: "Request a status update on the pending task", "Provide a tracking link and apologise for the delay", "Direct the team to handle the evaluation", "Instruct the user to reset their password".
  - Write the words the user actually sent instead. Steps for the asker to follow are fine: "Go to the login page, click Forgot password and follow the link we email you."
- `pairIds`: the ids of every pair in the group.
- `answerKind`: your verdict on the entry you just wrote:
  - "reusable": rules 1–4 hold and `answer` is ready-to-send reply text.
  - "thread_dependent": the question only makes sense inside its thread (rule 2).
  - "case_specific": the right answer depends on the asker's own order, account, task or problem (rules 3 and 4).
  - "describes_action": `answer` is a note about what the reply should do instead of being the reply.
  Only "reusable" entries are ever used. Be strict: when in doubt, it is not "reusable".
- `confidence` from 0 to 1: how sure you are that the group is one genuine, recurring question AND that the answer is fully supported by the replies. Use 0.9 or above only when both are clearly true.
- If the user's replies in a group disagree with each other, skip the group.
- Most mailboxes have few or no FAQs. Returning an empty list is normal and correct.

Return only JSON in exactly this shape:
{ "qa_pairs": [ { "question": "...", "answer": "...", "pairIds": [1, 4], "answerKind": "reusable", "confidence": 0.9 } ] }
With nothing to report, return { "qa_pairs": [] }

Pairs:

{{pairsText}}
