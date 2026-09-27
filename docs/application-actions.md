# Application action indicators

The application phase and the next action are independent. A received acknowledgment can stay **Antwort erhalten** while its action indicator is **Warten**.

In **Bewerbungen**, open an institution, select **Handlungsbedarf**, then save:

- **Aktion nötig**: a reply, document, appointment or another task is still due.
- **Warten – nichts zu tun**: receipt confirmed, or the institution asked you to wait.
- **Erledigt**: no open step remains.
- **Automatisch**: the newest received email shows **Zu prüfen**; the latest sent email shows **Warten**. No email content is classified automatically.

The indicator appears in institution cards, their details and the application list. Notes can describe the concrete next step.

A genuinely new latest incoming email resets an explicit decision to review. Duplicate and older imports preserve it. Notes and the application phase are preserved. Sending a message does not automatically resolve an explicitly marked task. Existing replies initially need review; set receipt confirmations to waiting once.

ChatGPT can pass optional `nextAction` (`automatic`, `action_required`, `waiting`, `done`) to `update_application` alongside the existing status, notes and expected revision. Omitting it preserves the current choice. Read the conversation before choosing: acknowledgments are not automatically actionable, and an acknowledgment must not hide an earlier unresolved task. The website's **Mit ChatGPT aktualisieren** prompt includes this workflow. Neither this indicator nor its tools send email.

No extra Gmail permissions are needed to edit indicators. Gmail imports still happen through the connected ChatGPT workflow; this feature does not read the mailbox on its own.
