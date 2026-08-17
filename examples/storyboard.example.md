# How a Learning System Updates

## 0:00 - 0:45 — The useful mistake

**[VISUAL]** A prediction moves through a clean state-update loop.

**[EQUATION]** state(next) = update(state, observation, outcome)

**[VOICEOVER]**

A learning system is not defined by never being wrong. It is defined by what
happens after it is wrong. An observation enters, the system makes a
prediction, reality returns an outcome, and some internal state changes.

This sounds obvious until the system has one billion adjustable parameters.
Then the question becomes less “did it fail?” and more “which microscopic
number deserves the blame?” Machine learning calls this credit assignment.
Large organizations call it Thursday.

**Delivery:** Curious and conversational. Land the last sentence without a performance voice.

## 0:45 - 1:35 — Follow the gradient

**[VISUAL]** A point descends through a loss landscape while nearby alternatives remain visible.

**[EQUATION]** parameters(next) = parameters - learning_rate × gradient(loss)

**[VOICEOVER]**

The gradient describes how the loss changes when each parameter moves a small
amount. Training steps in the opposite direction. A small learning rate can
take forever. A large learning rate can launch the model across the landscape,
through the valley, and directly into a value called not-a-number.

The mathematics is optimization. The engineering is repeatedly asking whether
the computer is learning or merely expressing itself through heat.

**Delivery:** Precise through the equation, then lightly amused.
