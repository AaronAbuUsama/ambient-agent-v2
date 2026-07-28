# Domain language

Use these terms in code, documentation, prompts, and operator surfaces.

## Coworker

The whole product-level colleague: one identity, one memory, and one point of view across
every Surface. No individual internal agent is “the coworker.”

## Brain

The single global mind for one tenant. It owns judgment, the Graph's interpretation, open
work, and the choice of whether and where to communicate. It is not bound to a chat.

## Surface

One authorized place where the Coworker can listen and speak, such as a WhatsApp group or
direct message. A Surface has stable application identity independent of its provider address.

## Surface Binding

The current mapping between a stable Surface and an authenticated provider account plus
provider conversation identity.

## Speaker

The fast conversational agent bound to one Surface. It owns local expression and transient
conversation context. It escalates global judgment as an Intent.

## Conversation Archive

The append-only journal of normalized provider events observed or sent by the runtime. It is
authoritative source evidence, not a copy of provider envelopes or model memory.

## Conversation Event

An immutable normalized observation such as message arrival, edit, revocation, reaction, or
delivery receipt.

## Intent

An immutable, evidence-backed escalation from a Speaker requesting Brain judgment. It does
not choose its own action.

## Attention

Durable processing state identifying source events, Surface Delivery failures/uncertainty,
Intents, work results, and scheduled wakes that require Brain judgment. Settling attention
never deletes its underlying evidence.

## Brain Batch

The immutable set of attention inputs claimed for one Brain decision. Recovery must preserve
the same membership until settlement.

## Graph

The Coworker's derived cross-source memory: an append-only Attestation log plus a
deterministic Belief Projection. Raw sources remain authoritative.

## Attestation

An immutable claim by an identified author with Confidence and a non-empty Evidence Set.
Corrections append another Attestation.

## Evidence Set

Immutable references to source observations supporting an Attestation.

## Belief Projection

The current deterministic interpretation folded from Attestations. It can be rebuilt and is
not an independent source of truth.

## Scribe

The global ingestion role that turns source observations into proposed Attestations. It has no
authority to decide or communicate.

## Scribe Batch

A bounded, cross-Surface set of source observations and relevant Graph context presented to one
stateless Scribe attempt.

## Directive

An authoritative Brain instruction for a chosen Speaker to communicate an objective. The
Brain owns substance and target; the Speaker owns expression.

## Brain Effect

One typed semantic consequence of a Brain decision. Trusted application code assigns stable
identity, validates it, records it before asynchronous execution, and stores its outcome.

## Surface Delivery

The durable lifecycle of one logical Say across a provider boundary: pending, attempting, sent
with provider evidence, failed, or uncertain. An uncertain delivery is not retried blindly.

## Scheduled Wake

A durable future attention input asking the Brain to reconsider a named concern. It is not an
in-memory timer.

## Capability

A cohesive kind of work the Coworker can perform. Capabilities own their domain behavior and
effect types; they are not arbitrary plugins or generic commands.
