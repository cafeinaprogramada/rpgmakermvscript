/*:
 * @plugindesc Galv Actor Duel MV - Fighting AI Decision Engine (MUGEN-style weighted decisions)
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * MUGEN-style AI decision system for Actor Duel MV.
 *
 * This plugin does NOT replace the combat system. It replaces the decision
 * making of the CPU fighter when the actor contains <fai> in its Notes.
 * The AI evaluates conditions and chooses between the same commands already
 * available to the duel engine: approach, retreat, attack, guard, skill,
 * jump and wait.
 *
 * Actor activation:
 *   <fai>
 *
 * Actor AI parameters (all 1..100):
 *   <fai_aggression: 70>
 *   <fai_defense: 45>
 *   <fai_skill: 60>
 *   <fai_retreat: 20>
 *   <fai_jump: 10>
 *   <fai_movement: 80>
 *   <fai_reaction: 60>
 *   <fai_spacing: 50>
 *
 * Meaning:
 *   aggression = tendency to attack with the basic attack
 *   defense    = tendency to guard when threatened
 *   skill      = tendency to use configured skills
 *   retreat    = tendency to create distance
 *   jump       = tendency to jump
 *   movement   = willingness to reposition instead of waiting
 *   reaction   = decision frequency; higher reacts sooner
 *   spacing    = preferred distance bias; higher prefers more space
 *
 * Skill notetags already supported by Stage2 MultiSkills are respected:
 *   <fskills: 2,3,4,5>
 *   <fhitbox: 80,40,60,30>
 *   <fcost: 100>
 *   <ai_priority: 80>
 *   <ai_range: 250>
 *   <ai_type: projectile>
 *
 * The AI derives skill reach from <fhitbox> when available, so changing a
 * skill's hitbox automatically changes where the AI wants to stand.
 *
 * Notes:
 *   - AI decisions are weighted, not perfectly deterministic.
 *   - Only one decision is made at each decision window.
 *   - The AI never attacks outside the actual basic attack range.
 *   - The AI never selects a skill that cannot reach the opponent.
 *   - The AI uses the existing duel commands instead of directly changing
 *     combat values, keeping it synchronized with the main duel system.
 *
 * Plugin order:
 *   Galv_ActorDuel_MV.js
 *   Galv_ActorDuel_MV_Stage1_Fix.js
 *   Galv_ActorDuel_MV_Stage1_HUD.js
 *   Galv_ActorDuel_MV_Stage1_CombatFX.js
 *   Galv_ActorDuel_MV_Stage2_MultiSkills.js
 *   Galv_ActorDuel_MV_Stage2_SoundFX.js
 *   Galv_ActorDuel_MV_Stage2_FightingAI.js   <-- this plugin
 *
 * @param Decision Interval
 * @type number
 * @min 1
 * @default 18
 *
 * @param Minimum Decision Interval
 * @type number
 * @min 1
 * @default 5
 *
 * @param Guard Reaction Range
 * @type number
 * @min 1
 * @default 120
 *
 * @param Target Half Width
 * @type number
 * @min 1
 * @default 20
 *
 * @param Skill Range Padding
 * @type number
 * @min 0
 * @default 20
 *
 * @param Low HP Threshold
 * @type number
 * @min 1
 * @max 100
 * @default 30
 *
 * @param Debug Log
 * @type boolean
 * @on ON
 * @off OFF
 * @default false
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_FightingAI';
    var params = PluginManager.parameters(pluginName);

    var BASE_INTERVAL = Math.max(1, Number(params['Decision Interval'] || 18));
    var MIN_INTERVAL = Math.max(1, Number(params['Minimum Decision Interval'] || 5));
    var GUARD_RANGE = Math.max(1, Number(params['Guard Reaction Range'] || 120));
    var TARGET_HALF_WIDTH = Math.max(1, Number(params['Target Half Width'] || 20));
    var SKILL_PADDING = Math.max(0, Number(params['Skill Range Padding'] || 20));
    var LOW_HP_THRESHOLD = Math.max(1, Number(params['Low HP Threshold'] || 30)) / 100;
    var DEBUG = String(params['Debug Log'] || 'false').toLowerCase() === 'true';

    function noteValue(note, tag, fallback) {
        var regex = new RegExp('<' + tag + ':\\s*([^>]+)>', 'i');
        var match = String(note || '').match(regex);
        return match ? match[1].trim() : fallback;
    }

    function hasNote(note, tag) {
        return new RegExp('<' + tag + '(?:\\s|>|:)', 'i').test(String(note || ''));
    }

    function clamp100(value, fallback) {
        var n = Number(value);
        if (!isFinite(n)) n = fallback;
        return Math.max(1, Math.min(100, n));
    }

    function aiProfile(actor) {
        var note = actor && actor.actor ? actor.actor().note : '';
        return {
            enabled: hasNote(note, 'fai'),
            aggression: clamp100(noteValue(note, 'fai_aggression', '70'), 70),
            defense: clamp100(noteValue(note, 'fai_defense', '45'), 45),
            skill: clamp100(noteValue(note, 'fai_skill', '60'), 60),
            retreat: clamp100(noteValue(note, 'fai_retreat', '20'), 20),
            jump: clamp100(noteValue(note, 'fai_jump', '10'), 10),
            movement: clamp100(noteValue(note, 'fai_movement', '80'), 80),
            reaction: clamp100(noteValue(note, 'fai_reaction', '60'), 60),
            spacing: clamp100(noteValue(note, 'fai_spacing', '50'), 50)
        };
    }

    function slotsFor(actor) {
        if (!actor || !actor.actor) return [];
        var value = noteValue(actor.actor().note, 'fskills', '0,0,0,0');
        var values = value.split(',').map(function(v) {
            return Number(v.trim()) || 0;
        });
        while (values.length < 4) values.push(0);
        return values.slice(0, 4);
    }

    function skillCost(skill) {
        if (!skill) return 0;
        var noteCost = noteValue(skill.note, 'fcost', null);
        if (noteCost !== null) return Math.max(0, Number(noteCost) || 0);
        return Math.max(0, Number(skill.mpCost || 0));
    }

    function skillHitbox(skill) {
        if (!skill) return null;
        var value = noteValue(skill.note, 'fhitbox', null);
        if (value === null) return null;
        var values = value.split(',').map(function(v) {
            return Number(v.trim()) || 0;
        });
        if (values.length < 2) return null;
        return {
            width: Math.max(1, values[0]),
            height: Math.max(1, values[1]),
            distance: Math.max(0, values.length >= 3 ? values[2] : 0),
            knockback: Math.max(0, values.length >= 4 ? values[3] : 0)
        };
    }

    function skillAiData(skill) {
        return {
            priority: Math.max(1, Number(noteValue(skill ? skill.note : '', 'ai_priority', '50')) || 50),
            range: Math.max(1, Number(noteValue(skill ? skill.note : '', 'ai_range', '9999')) || 9999),
            type: String(noteValue(skill ? skill.note : '', 'ai_type', 'normal')).toLowerCase()
        };
    }

    function skillRange(skill) {
        var ai = skillAiData(skill);
        var box = skillHitbox(skill);

        if (!box) {
            return {
                min: 0,
                max: ai.range,
                center: Math.min(ai.range, 60),
                hasHitbox: false
            };
        }

        // Same horizontal approximation used by MultiSkills hitbox collision:
        // the opponent's body contributes TARGET_HALF_WIDTH at either edge.
        var min = Math.max(0, box.distance - TARGET_HALF_WIDTH);
        var max = box.distance + box.width + TARGET_HALF_WIDTH;

        // ai_range acts as an intentional upper restriction when supplied.
        if (ai.range < 9999) max = Math.min(max, ai.range + SKILL_PADDING);

        return {
            min: min,
            max: Math.max(min, max),
            center: (min + Math.max(min, max)) / 2,
            hasHitbox: true
        };
    }

    function canUseSkill(actor, skillId) {
        if (!actor || !skillId || !$dataSkills || !$dataSkills[skillId]) return false;
        if (typeof actor.duelCanUseSkill === 'function' && !actor.duelCanUseSkill(skillId)) return false;
        return actor._duelStamina >= skillCost($dataSkills[skillId]);
    }

    function skillCandidates(actor, distance) {
        var result = [];
        var slots = slotsFor(actor);

        for (var i = 0; i < slots.length; i++) {
            var skillId = Number(slots[i] || 0);
            if (skillId <= 0 || !$dataSkills[skillId]) continue;
            if (!canUseSkill(actor, skillId)) continue;

            var skill = $dataSkills[skillId];
            var range = skillRange(skill);
            var ai = skillAiData(skill);

            result.push({
                id: skillId,
                priority: ai.priority,
                range: range,
                type: ai.type,
                inRange: distance >= range.min && distance <= range.max
            });
        }

        return result;
    }

    function weightedPick(actions) {
        var total = 0;
        actions.forEach(function(action) {
            total += Math.max(0, action.weight || 0);
        });
        if (total <= 0) return null;

        var roll = Math.random() * total;
        var sum = 0;
        for (var i = 0; i < actions.length; i++) {
            sum += Math.max(0, actions[i].weight || 0);
            if (roll <= sum) return actions[i];
        }
        return actions[actions.length - 1];
    }

    function distanceToOpponent(actor, opponent) {
        return Math.abs(Number(opponent._duelX || 0) - Number(actor._duelX || 0));
    }

    function reactionInterval(profile) {
        // 1 = slow and human-like. 100 = frequent decisions.
        var factor = 1 - (profile.reaction - 1) / 120;
        return Math.max(MIN_INTERVAL, Math.round(BASE_INTERVAL * factor));
    }

    function nearestSkillRange(candidates, distance) {
        var best = null;
        candidates.forEach(function(c) {
            if (!best) {
                best = c;
                return;
            }
            var d1 = Math.abs(distance - c.range.center);
            var d2 = Math.abs(distance - best.range.center);
            if (d1 < d2) best = c;
        });
        return best;
    }

    function logDecision(actor, decision, distance) {
        if (!DEBUG || !actor) return;
        console.log('[ActorDuel AI] ' + actor.name() +
            ' -> ' + decision.type +
            ' | distance=' + Math.round(distance) +
            ' | skill=' + (decision.skillId || 0));
    }

    function executeDecision(ai, decision, context) {
        var actor = ai.actor;
        var opponent = ai.opponent;
        if (!actor || !opponent || !decision) return;

        switch (decision.type) {
        case 'guard':
            actor.duelStartGuard(true);
            break;

        case 'attack':
            actor.duelStartGuard(false);
            actor.duelStartAttack();
            break;

        case 'skill':
            actor.duelStartGuard(false);
            if (typeof actor.duelUseSkill === 'function') {
                actor.duelUseSkill(decision.skillId);
            }
            break;

        case 'approach':
            actor.duelStartGuard(false);
            actor.duelMove(context.direction);
            break;

        case 'retreat':
            actor.duelStartGuard(false);
            actor.duelMove(-context.direction);
            break;

        case 'jump':
            actor.duelStartGuard(false);
            actor.duelJump();
            break;

        case 'wait':
        default:
            actor.duelStartGuard(false);
            break;
        }
    }

    function decide(ai) {
        var actor = ai.actor;
        var opponent = ai.opponent;
        if (!actor || !opponent) return;

        var profile = ai._faiProfile || aiProfile(actor);
        var distance = distanceToOpponent(actor, opponent);
        var horizontal = Number(opponent._duelX || 0) - Number(actor._duelX || 0);
        var direction = horizontal >= 0 ? 1 : -1;
        var attackRange = Number(actor.duelData && actor.duelData().range || 45);
        var skills = skillCandidates(actor, distance);
        var usableSkills = skills.filter(function(s) { return s.inRange; });
        var hpRate = actor.mhp > 0 ? actor.hp / actor.mhp : 1;
        var opponentHpRate = opponent.mhp > 0 ? opponent.hp / opponent.mhp : 1;
        var opponentAttacking = opponent._duelAttackTimer > 0;
        var opponentHit = opponent._duelHitTimer > 0;
        var closeThreat = distance <= Math.max(attackRange, GUARD_RANGE);
        var lowHp = hpRate <= LOW_HP_THRESHOLD;

        actor._duelFacing = direction;

        // -------------------------------------------------------------
        // Build MUGEN-style weighted choices.
        // Each condition gates a command; the final choice is weighted.
        // -------------------------------------------------------------
        var actions = [];

        // Defense has priority when the opponent is actively attacking.
        if (opponentAttacking && closeThreat) {
            var guardThreat = profile.defense * 2;
            if (opponentHit) guardThreat *= 0.35;
            actions.push({ type: 'guard', weight: guardThreat });
        } else if (closeThreat && profile.defense >= 50 && Math.random() * 100 < profile.defense * 0.25) {
            actions.push({ type: 'guard', weight: profile.defense * 0.35 });
        }

        // Skills are evaluated by their own actual reach and priority.
        if (usableSkills.length && !opponentHit) {
            usableSkills.forEach(function(skill) {
                var weight = profile.skill * skill.priority / 50;
                if (opponentAttacking) weight *= 0.35;
                if (lowHp) weight *= 1.10;
                actions.push({ type: 'skill', skillId: skill.id, weight: weight });
            });
        }

        // Basic attack is only considered when its real duel range is met.
        if (distance <= attackRange && !opponentAttacking) {
            var attackWeight = profile.aggression;
            if (opponentHit) attackWeight *= 1.35;
            if (opponentHpRate <= LOW_HP_THRESHOLD) attackWeight *= 1.15;
            actions.push({ type: 'attack', weight: attackWeight });
        }

        // Retreat becomes more attractive at low HP and when the opponent
        // is already threatening at close range.
        if ((lowHp || opponentAttacking) && closeThreat) {
            var retreatWeight = profile.retreat;
            if (lowHp) retreatWeight *= 2.0;
            if (opponentAttacking) retreatWeight *= 1.25;
            actions.push({ type: 'retreat', weight: retreatWeight });
        }

        // If there is a useful skill farther away, approach its range rather
        // than blindly walking into the opponent's face.
        var nearestSkill = nearestSkillRange(skills, distance);
        var preferredRange = attackRange;
        if (nearestSkill && profile.skill >= profile.aggression && nearestSkill.range.max > attackRange) {
            preferredRange = nearestSkill.range.center;
        }

        if (distance > preferredRange + 4) {
            actions.push({
                type: 'approach',
                weight: profile.movement * (distance > preferredRange + 40 ? 1.25 : 1.0)
            });
        }

        // If the fighter is substantially inside its preferred spacing,
        // allow a controlled retreat instead of face-hugging.
        var spacingBias = (profile.spacing - 50) * 0.5;
        if (distance < Math.max(15, preferredRange - spacingBias) && distance > attackRange * 0.65) {
            actions.push({ type: 'retreat', weight: profile.retreat * 0.75 + Math.max(0, spacingBias) });
        }

        // Jump remains intentionally conservative. It is a movement option,
        // not an acrobatic randomizer.
        if (!actor._duelJumping && distance <= GUARD_RANGE * 1.5) {
            var jumpWeight = profile.jump;
            if (opponentAttacking) jumpWeight *= 1.25;
            if (lowHp) jumpWeight *= 1.10;
            actions.push({ type: 'jump', weight: jumpWeight });
        }

        // If there is no valid attack/skill and movement is required, force
        // the appropriate basic repositioning instead of idling in place.
        if (!actions.length) {
            if (distance > preferredRange + 4) {
                actions.push({ type: 'approach', weight: 100 });
            } else if (distance < Math.max(12, preferredRange - 10)) {
                actions.push({ type: 'retreat', weight: profile.retreat || 10 });
            } else {
                actions.push({ type: 'wait', weight: 100 });
            }
        }

        var chosen = weightedPick(actions) || { type: 'wait', weight: 1 };
        executeDecision(ai, chosen, {
            direction: direction,
            distance: distance,
            attackRange: attackRange,
            preferredRange: preferredRange
        });
        logDecision(actor, chosen, distance);

        ai._faiLastDecision = chosen.type;
        ai._faiLastSkill = chosen.skillId || 0;
        ai._faiTimer = reactionInterval(profile);
    }

    function installForScene(scene) {
        if (!scene || !scene._ai || !scene._ai.actor) return;

        var ai = scene._ai;
        var profile = aiProfile(ai.actor);

        // Actors without <fai> keep the original Stage 1 AI untouched.
        if (!profile.enabled) return;

        ai._faiProfile = profile;
        ai._faiTimer = 0;
        ai._faiLastDecision = 'wait';
        ai._faiLastSkill = 0;
        ai._faiInstalled = true;

        ai.update = function() {
            var actor = this.actor;
            var opponent = this.opponent;
            if (!actor || !opponent) return;
            if (actor._duelDead || opponent._duelDead) return;

            this._faiProfile = aiProfile(actor);

            if (actor._duelHitTimer > 0 || actor._duelAttackTimer > 0 || actor._duelSkillTimer > 0) {
                return;
            }

            if (this._faiTimer > 0) {
                this._faiTimer--;

                // Keep facing and avoid freezing far away while waiting for
                // the next formal decision window.
                var dx = opponent._duelX - actor._duelX;
                var dir = dx >= 0 ? 1 : -1;
                actor._duelFacing = dir;
                return;
            }

            decide(this);
        };
    }

    // Scene_ActorDuel creates the original ActorDuelAI inside its private
    // implementation. We intercept the completed creation and replace only
    // the update method of AI-enabled actors. This keeps the core duel and
    // MultiSkills systems intact.
    var _Scene_ActorDuel_createActors = Scene_ActorDuel.prototype._createActors;
    Scene_ActorDuel.prototype._createActors = function() {
        _Scene_ActorDuel_createActors.call(this);
        installForScene(this);
    };

})();
