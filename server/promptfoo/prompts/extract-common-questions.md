You find the questions people repeatedly ask the user, and how the user answers them. The result becomes an FAQ that an auto-responder may use to reply to real people, so a wrong or vague entry is worse than no entry.

Below are numbered pairs. Each pair is a message someone sent the user ("Question") and the user's actual reply to it ("User's reply"). "Asked by" tells you which person sent it; the same label means the same person.

Group pairs that ask the SAME specific question, then write one FAQ entry per group.

Rules:
- Only include a group if at least two DIFFERENT people asked it (different "Asked by" labels). One person asking twice is not an FAQ.
- The question must be a real question a person asked, not a notification, newsletter, receipt, meeting invite or status update. Skip anything that isn't asking the user for information or for something to be done.
- An FAQ is a question whose answer would help the NEXT person who asks it. Questions about one particular event, meeting, order, document or email ("Are you coming on Friday?", "Did you get my email?", "Can you make Tuesday's call?") are never FAQs, even when several people ask something similar.
- Write the question the way an asker would phrase it: one short, specific question, ending with "?", at most 15 words. Remove names, dates and order numbers. Never combine two topics ("pricing or refunds") in one question.
- The answer must contain only facts the user actually stated in their replies in that group: prices, links, steps, policies, times. Write it in the user's voice, as a reply to the asker ("Yes, we offer 20% off for teams of 10 or more."). No greeting, sign-off or names. Do not describe what the user does ("Confirm the meeting"), do not add facts, and do not generalise.
- If the user's replies in a group disagree with each other, or only say things like "thanks", "sounds good" or "I'll get back to you", skip the group.
- Include `pairIds`: the ids of every pair in the group.
- Include `confidence` from 0 to 1: how sure you are that the group is one genuine, recurring question AND that the answer is fully supported by the replies. Use 0.9 or above only when both are clearly true.
- Most mailboxes have few or no FAQs. Returning an empty list is normal and correct.

Return only JSON in exactly this shape:
{ "qa_pairs": [ { "question": "...", "answer": "...", "pairIds": [1, 4], "confidence": 0.9 } ] }
With nothing to report, return { "qa_pairs": [] }

Pairs:

{{pairsText}}
