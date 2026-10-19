# Crit 10 reflection

## What was the breakthrough that moved the work forward?

The breakthrough was realising that multi-user support was already there. The visitor cookie already distinguished browsers, and the database already enforced the one-change rule. What I had not explained clearly was why Theseus treats one browser as one anonymous visitor. This gives people a persistent identity without introducing accounts, names or other public user information, so I documented that decision in `docs/decisions/0002-pseudonymous-visitor-and-logging.md`.

For Crit 10, I set out the logging contract and had the agent write a failing test first. We then added logs for requests, new and returning visitors, replacement outcomes, and how many open streams received an update.

I also decided what should not be logged. Visitors are represented by a one-way hash of the cookie, never the cookie itself, an IP address or browser details. Rejected words are logged only by reason because they never became public.

Later, while testing the redesign branch over plain HTTP, a valid word was rejected. The log showed `v=none`, which helped trace the problem to the secure cookie not being sent over HTTP. The application rule was correct; the test setup was wrong.

## What did this work change about who I want to be as a software developer?

I want to rely more on evidence and less on guessing. When one test failed and then passed, I asked for its measurements to be printed and for repeated runs without retries or weaker checks. That exposed leftover headless Chrome processes rather than an application bug.

I learned that a passing test is not always enough: I want to understand why it failed before I trust it. I also want logging to explain system behaviour without collecting unnecessary information about users.
