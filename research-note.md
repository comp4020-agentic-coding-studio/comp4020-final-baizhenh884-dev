# A green check is not necessarily evidence

Code has become cheaper, but confidence has not. Simon Willison argues that coding agents reduce the cost of typing code without removing the harder work of deciding what to build and knowing whether it works. Adding instructions and tests is an obvious response, yet their number says little about what they prove. A useful harness must make each check observe the promise it claims to protect, while a person remains responsible for the theory connecting check and system. If an agent can satisfy a check without protecting the underlying behaviour, a green result becomes an easily optimised signal.

## Why harnesses help

Böckeler divides a harness into guides, which direct an agent, and sensors, which report what its work has done. Jain's experiment shows their possible value: a less capable model went from three successful runs out of ten to ten out of ten with a harness, at a lower cost per run than the stronger baseline model. Because Jain added guides and sensors together, the experiment cannot identify which caused the improvement. The result suggests that timely feedback may help stop plausible code from being accepted before its behaviour is checked.

## When checks become targets

Strathern warns that a measure loses meaning when it becomes the target of improvement. Jain's experiment also shows why the observer matters. His stronger model passed every run unaided, while adding the harness used 10.5 times as many tokens and cost roughly seven times more. The harness was unnecessary here. Both conditions still faced the same 178 external acceptance tests, whose answer key the inner harness never saw. This allowed the evaluation to challenge the work instead of echoing it.

Böckeler's small TDD study shows what happens when that separation collapses. Some agent-written tests calculated their expected answer with the same logic as the implementation, and test-first did not reliably prevent the tautology. These tests could turn green by mirroring the code rather than challenging it.

I saw a simpler version in my project. A classmate found that “Back to the harbour” did not bring the camera back. I had accepted a green check that proved only that the button existed. Replaying her steps showed that the camera stayed displaced, so I changed the check to move the camera, press the renamed “Reset view” control, and use the page's labels to read where the camera actually returned. That experience made the difference between checking an object and checking its promise concrete for me.

Independent evaluation matters for people too. In METR's study, 16 experienced developers took 19% longer with AI tools while estimating they were 20% faster. A developer's feeling of success is useful context, but it cannot serve as the final measure.

## Why a person still needs the theory

Naur's account of programming as theory building explains what a harness cannot contain. Code and documents capture only part of a program; developers also need an understanding of why its parts fit and which changes are appropriate. Storey updates this argument for agentic development: AI may reduce technical debt while increasing cognitive debt, the loss of shared understanding, and intent debt, the loss of rationale. A harness can preserve parts of a theory, yet it cannot decide whether a proxy still represents the intended behaviour.

Morris calls the human position “on the loop.” Instead of inspecting every generated line, a person manages the loop and improves its harness. This requires judgement about what the loop should promise. Galster and colleagues found that agent configuration in 2,853 repositories was dominated by context files, while Skills and Subagents were uncommon. Their study covers configuration rather than test quality, so it cannot show whether repositories lack good sensors. It does suggest that visible effort still concentrates on written guides, leaving the quality of observations open.

A serious counter-case is that comprehensive, independent acceptance tests may be the theory written down. Jain's 178 tests make this plausible, although his evidence covers only ten paired runs per model, one greenfield service and an unusually detailed brief. People still had to choose the promises represented by those tests, and those promises can change. When I reproduced a kept-ship failure in my project, I saw that the page had correctly advanced to the next ship. My check had encoded the wrong assumption about which ship would remain visible. Tests externalise theory, but someone must still recognise when that theory is incomplete or stale.

I now start with a practical question: what did this check actually see? I want a check to follow the promised behaviour, an evaluation the agent cannot edit, and enough understanding to revisit both when real use disagrees. That is how I can explain why a result deserves trust, rather than pointing only to a green run.

## References

- Becker, J., Rush, N., Barnes, E., & Rein, D. (2025). [“Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity.”](https://arxiv.org/abs/2507.09089)
- Böckeler, B. (2026, April 2). [“Harness engineering for coding agent users.”](https://martinfowler.com/articles/harness-engineering.html)
- Böckeler, B. (2026, August 10). [“TDD inside the agent loop—theater or actual value?”](https://martinfowler.com/articles/exploring-gen-ai/tdd-in-the-agent-loop.html)
- Galster, M. et al. (2026). [“Harness Engineering for Agentic AI Coding Tools: An Exploratory Study.”](https://arxiv.org/abs/2602.14690)
- Jain, N. (2026, October 13). [“Are Harnesses Worth the Cost?”](https://martinfowler.com/articles/are-harnesses-worth-the-cost.html)
- Morris, K. (2026, March 4). [“Humans and Agents in Software Engineering Loops.”](https://martinfowler.com/articles/exploring-gen-ai/humans-and-agents.html)
- Naur, P. (1985). [“Programming as Theory Building.”](https://doi.org/10.1016/0165-6074(85)90032-8) *Microprocessing and Microprogramming, 15*(5), 253–261.
- Storey, M.-A. (2026). [“From Technical Debt to Cognitive and Intent Debt: Rethinking Software Health in the Age of AI.”](https://arxiv.org/abs/2603.22106)
- Strathern, M. (1997). [“‘Improving Ratings’: Audit in the British University System.”](https://doi.org/10.1002/%28SICI%291234-981X%28199707%295%3A3%3C305%3A%3AAID-EURO184%3E3.0.CO%3B2-4) *European Review, 5*(3), 305–321.
- Willison, S. (n.d.). [“Writing code is cheap now.”](https://simonwillison.net/guides/agentic-engineering-patterns/code-is-cheap/)
