# Aetherfall combat update · v1.80.0

Rift Arena and Fracture Depths, Convergence Duel, Manafront Siege and Paragon Run now share procedural combat sounds and character resonance. Existing card IDs, stars, training, merges, saved collections, rewards and question selection remain unchanged.

The battlefield uses existing environment paintings: a wormgate for Arena and Duel, the Worldroot path for Siege, and an observatory or forest for Paragon heroes from the two worlds. Projectile silhouettes and a short signature pulse communicate each character's weapon. The effects respect reduced motion; they are bounded and cleared on pause, question panels, hidden tabs and exit.

## Character mechanics

`tcg-combat-identity.js` maps all 17 six- and seven-star cards by permanent ID. Each has a different effect sequence: paired-target wormholes, shield relays, cleanse and recharge, three-hit armour penetration, damage-to-healing transfer, brands, time theft, capped missing-health consumption, roots, constellation strikes, shield breaking, phoenix burning, Worldroot protection and Last Dawn's capped maximum-health dive. Lower tiers receive a small resonance aligned to their existing skill.

The card's information panel explains the exact cadence and the mode translation. Arena counts completed actions, Siege successful attacks or heals, and Paragon auto-attacks. Duel counts survived attacks, one fewer than the normal cadence with a minimum of two. Per-unit charge never lives in a saved collection. Area effects target at most three living bodies; Paragon also enforces the hero's weapon range. Health scaling is capped by attack to prevent instant boss kills.

`tcg-combat-runtime.js` returns actions to the production engine. Arena keeps its normal mitigation, affinity, shields and revival handling. Duel keeps Divine Shield, damage and death resolution, with a separate numerical resonance barrier. Siege retains normal lane damage and poison. Paragon retains kill and wave accounting. A drain heals only health actually removed, never shield absorption or overkill.

Paragon's tree has two reachable, mutually exclusive specialisations. One existing skill point buys Focus (one fewer attack per signature, minimum two) or Shelter (an 8% maximum-health barrier lasting five seconds on each signature). They last only for the run and do not change the economy. The battle displays current resonance charge.

## Sound and lifecycle

`tcg-media.js` uses one lazily activated Web Audio context, persistent volume/mute and capped, throttled voices. No sound files, AI calls or network requests are needed. The former optional Duel sample-manifest/synth implementation is retired in favour of this one engine; the existing `sq_duel_sfx` mute value is migrated when no new preference exists. Duel's visual impact tiers are retained.

Pause, question reading and exit stop all queued voices and resonance effects. Old Arena continuations cannot apply late resonance to a newly opened battle. Closing or hiding the page does not save combat effects or alter rewards.

## Verification

Run `node --test tools/tcg-combat-tests.mjs tools/tcg-media-tests.mjs`, then `node tools/tcg-combat-browser-tests.mjs` with Playwright Chromium installed. The browser harness loads the entire production TCG region, its actual renderers and handlers, real bundled artwork, and the new modules; only account, question-source and remote persistence boundaries are fixtures. It checks all four games, desktop/mobile trees, real branch purchase, barrier handling, audio controls, pause/exit, reload and reduced motion. Set `TCG_SCREENSHOTS` to retain captures.

Also run the existing squad, art-store, usage-tracker, interface and practice-feeding regressions and validate the full inline module syntax. No Firebase rules or server deployment is part of this update.
