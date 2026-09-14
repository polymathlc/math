import { tcgSignature, tcgSignatureReady, tcgSignatureActions, tcgSignatureDamage } from './tcg-combat-identity.js';

// Adapters supplied by the actual modes keep shields, death/reward bookkeeping,
// target immunity and turn rules in the original combat engines.
export function resolveTcgSignature(mode, actor, allies, foes, api, path = '') {
  if (!tcgSignatureReady(actor, actor.card, mode, path)) return false;
  const signature = tcgSignature(actor.card);
  const atk = actor.atk || actor.p?.atk || actor.base?.dmg || 1;
  let performed = false;
  for (const effect of tcgSignatureActions(actor.card, actor, allies, foes, path)) {
    const { kind, target, power } = effect;
    if (target.hp <= 0 || target.dead) continue;
    if (['hit','pierce','siphon','consume','rend','shatter'].includes(kind)) {
      if (kind === 'shatter') api.shatter(target);
      const before = target.hp;
      api.hit(target, tcgSignatureDamage(kind, atk, target, power), kind === 'pierce' || kind === 'rend');
      const removed = Math.max(0, Math.min(before, before - target.hp));
      if ((kind === 'siphon' || kind === 'consume') && removed > 0) {
        const receiver = kind === 'consume' ? actor : allies.filter(x => x.hp > 0 && !x.dead).sort((a,b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        if (receiver?.hp > 0) api.heal(receiver, removed);
      }
    } else if (kind === 'mend') api.heal(target, Math.max(1, target.maxHp * power));
    else if (kind === 'ward') api.ward(target, Math.max(1, target.maxHp * power));
    else if (kind === 'burn') api.burn(target, Math.max(1, atk * power));
    else api[kind]?.(target, power);
    performed = true;
  }
  if (performed) api.present(signature, actor);
  return performed;
}

// Short-lived visual effects are strictly bounded and removed on pause/exit.
export function createTcgEffects() {
  const nodes = new Set();
  function stop() { for (const node of nodes) node.remove(); nodes.clear(); }
  function pulse(host, actorNode, signature, element) {
    if (!host?.isConnected || nodes.size >= 12 || globalThis.document?.hidden) return;
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const node = document.createElement('span');
    node.className = 'tcg-signature-fx sig-' + signature.shape;
    node.setAttribute('aria-hidden','true');
    node.style.setProperty('--signature-color', element || '#8ee8ff');
    const hb = host.getBoundingClientRect(), ab = actorNode?.getBoundingClientRect();
    node.style.left = (ab ? ab.left - hb.left + ab.width / 2 : hb.width / 2) + 'px';
    node.style.top = (ab ? ab.top - hb.top + ab.height / 2 : hb.height / 2) + 'px';
    host.appendChild(node); nodes.add(node);
    const animation = node.animate(reduced ? [{opacity:.7},{opacity:0}] : [{opacity:0,transform:'translate(-50%,-50%) scale(.3) rotate(-25deg)'},{opacity:.9,offset:.3},{opacity:0,transform:'translate(-50%,-50%) scale(1.9) rotate(45deg)'}],{duration:reduced ? 140 : 650,easing:'ease-out'});
    animation.finished.catch(() => {}).finally(() => { node.remove(); nodes.delete(node); });
  }
  return {pulse,stop,get size(){return nodes.size;}};
}
