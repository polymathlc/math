// Combat-only identities keyed to the permanent roster IDs. No save/economy changes.
// Normalised actors expose hp/maxHp/atk; adapters resolve through each game's rules.
const identity = (name, shape, every, effects, desc) => Object.freeze({ name, shape, every, effects, desc });
export const TCG_SIGNATURES = Object.freeze({
  c043: identity('Dyson Reservoir', 'halo', 3, [['mend','weakAlly',.12],['ward','weakAlly',.08]], 'Restore the weakest ally, then store a small solar barrier around them.'),
  c044: identity('Last Line Relay', 'hex', 3, [['cleanse','weakAlly'],['ward','weakAlly',.17]], 'Cleanse the most wounded ally and project a strong barrier around them.'),
  c045: identity('Two Ends of Infinity', 'gate', 3, [['hit','strongFoe',.42],['hit','weakFoe',.42]], 'Open paired wormholes: strike the strongest foe and the most wounded foe.'),
  c046: identity('Neural Concord', 'prism', 3, [['cleanse','allAllies'],['charge','weakAlly',1]], 'Cleanse your team, then advance the weakest ally’s next skill.'),
  c047: identity('Three-Step Proof', 'lance', 3, [['hit','strongFoe',.22],['hit','strongFoe',.22],['pierce','strongFoe',.35]], 'Calculate three strikes against the strongest foe; the final strike pierces armour.'),
  c048: identity('Mercy Transfer', 'crescent', 3, [['siphon','strongFoe',.62]], 'Drain the strongest foe and transfer the health actually lost to your weakest ally.'),
  c049: identity('Reaper’s Census', 'orbit', 4, [['brand','allFoes',2],['hit','weakFoe',.35]], 'Brand up to three foes to amplify later hits, then reap the most wounded.'),
  c050: identity('Tomorrow Rewritten', 'hourglass', 4, [['delay','allFoes',1],['ward','self',.12],['charge','self',1]], 'Delay up to three enemy skills, shield yourself, and advance your next skill. In Paragon Run, delays slow enemy attacks and movement.'),
  c051: identity('Hunger Beyond Worlds', 'void', 4, [['consume','weakFoe',.65]], 'Consume the most wounded foe for attack damage plus a capped share of missing health, restoring health actually consumed.'),
  c094: identity('Rootbound Sanctuary', 'root', 3, [['root','strongFoe',1],['ward','allAllies',.06]], 'Root the strongest foe and shelter up to three allies behind living bark.'),
  c095: identity('Falling Constellation', 'star', 4, [['hit','allFoes',.32],['pierce','strongFoe',.3]], 'Drop a three-star constellation, then pierce the strongest foe with its final star.'),
  c096: identity('Oathbreaker’s Challenge', 'blade', 3, [['brand','strongFoe',2],['charge','self',1]], 'Challenge the strongest foe with a damage-amplifying brand while readying your own skill.'),
  c097: identity('Eclipse Tithe', 'crescent', 4, [['shatter','strongFoe',.42],['ward','self',.1]], 'Break the strongest foe’s barrier, strike them, and gather an eclipse shield.'),
  c098: identity('Borrowed Name', 'gate', 4, [['delay','strongFoe',2],['charge','allAllies',1]], 'Steal time from the strongest enemy’s skill and advance up to three allied skills.'),
  c099: identity('Phoenix Crucible', 'flame', 4, [['cleanse','self'],['mend','self',.13],['burn','allFoes',.22]], 'Cleanse and mend yourself, then leave a short burning trail on up to three foes.'),
  c100: identity('Worldroot Covenant', 'root', 4, [['mend','allAllies',.08],['root','allFoes',1],['ward','weakAlly',.09]], 'Mend up to three allies, root up to three foes, and protect the ally who needs it most.'),
  c101: identity('Last Dawn Dive', 'comet', 4, [['rend','strongFoe',.72],['burn','strongFoe',.3]], 'Dive at the strongest foe, carve away a capped share of maximum health, and leave heart-flame burning.')
});
const basic = {
  bloom: ['mend','weakAlly',.06], aurora: ['mend','weakAlly',.06], rain: ['mend','weakAlly',.06], chorus: ['cleanse','weakAlly'],
  aegis: ['ward','weakAlly',.07], bark: ['ward','self',.07], venomf: ['burn','weakFoe',.18], spores: ['burn','strongFoe',.18],
  freeze: ['root','strongFoe',.6], jolt: ['delay','strongFoe',1], warcry: ['charge','weakAlly',1], roar: ['charge','self',1],
  drain: ['siphon','weakFoe',.3], eclipse: ['shatter','weakFoe',.3], chrono: ['delay','strongFoe',1]
};
export function tcgSignature(card) {
  if (!card?.id) return null;
  if (TCG_SIGNATURES[card.id] && card.stars >= 6) return TCG_SIGNATURES[card.id];
  const action = basic[card.skillId] || ['hit', Number(card.num || 0) % 2 ? 'strongFoe' : 'weakFoe', .35];
  return identity(card.skillName || 'Resonance', ['comet','prism','blade'][Number(card.num || 0) % 3], 5,
    [action], `${({mend:'Mend an ally',cleanse:'Cleanse an ally',ward:'Create a small barrier',burn:'Leave lingering damage',root:'Briefly stop the strongest foe',delay:'Delay an enemy skill',charge:'Advance an allied skill',siphon:'Drain health to an ally',shatter:'Break a barrier',hit:'Deliver a follow-up strike'})[action[0]]} after five actions.`);
}
export function tcgSignatureReady(actor, card, mode = 'arena', path = '') {
  const s = tcgSignature(card); if (!s || !actor || actor.hp <= 0 || actor.dead) return false;
  const step = mode === 'duel' ? Math.max(2, s.every - 1) : s.every;
  const need = Math.max(2, step - (path === 'focus' ? 1 : 0));
  actor.signatureCharge = (actor.signatureCharge || 0) + 1;
  if (actor.signatureCharge < need) return false;
  actor.signatureCharge = 0;
  return true;
}
export function tcgSignatureActions(card, actor, allies, foes, path = '') {
  const sig = tcgSignature(card); if (!sig || !actor || actor.hp <= 0 || actor.dead) return [];
  const live = rows => rows.filter(x => x && x.hp > 0 && !x.dead);
  const aa = live(allies), ff = live(foes);
  const healthOrder = (a,b) => a.hp / a.maxHp - b.hp / b.maxHp;
  const selections = {
    self: [actor], weakAlly: aa.slice().sort(healthOrder).slice(0,1), allAllies: aa.slice().sort(healthOrder).slice(0,3),
    weakFoe: ff.slice().sort(healthOrder).slice(0,1), strongFoe: ff.slice().sort((a,b) => (b.maxHp || b.hp) - (a.maxHp || a.hp)).slice(0,1),
    allFoes: ff.slice().sort((a,b) => (b.maxHp || b.hp) - (a.maxHp || a.hp)).slice(0,3)
  };
  const result = sig.effects.flatMap(([kind, group, power = 0]) => selections[group].map(target => ({kind,target,power})));
  if (path === 'shelter') result.push({kind:'ward',target:actor,power:.08});
  return result;
}
export function tcgSignatureDamage(kind, atk, target, power) {
  const base = Math.max(1, Number(atk) || 1);
  let damage = base * power;
  if (kind === 'consume') damage += Math.min(base * .6, Math.max(0,target.maxHp-target.hp) * .12);
  if (kind === 'rend') damage += Math.min(base * .6, target.maxHp * .025);
  return Math.max(1, Math.round(damage));
}
