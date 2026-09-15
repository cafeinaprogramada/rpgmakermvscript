/*:
 * @plugindesc Galv Actor Duel MV - Fighting AI Decision Engine (MUGEN-style weighted decisions) v2
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * AI de luta baseada em máquina de decisão com pesos, condições e memória
 * curta de movimento. Funciona como uma camada sobre o sistema de duelo.
 *
 * ATIVAÇÃO NO ATOR:
 *   <fai>
 *
 * PARÂMETROS (1..100):
 *   <fai_aggression: 70>
 *   <fai_defense: 45>
 *   <fai_skill: 60>
 *   <fai_retreat: 20>
 *   <fai_jump: 25>
 *   <fai_movement: 80>
 *   <fai_reaction: 60>
 *   <fai_spacing: 50>
 *
 * MOVIMENTO AÉREO:
 *   <fai_air: 35>
 *   <fai_air_approach: 70>
 *   <fai_air_retreat: 30>
 *
 * Quanto maior o valor, maior a tendência daquele comportamento.
 * Os parâmetros não são comandos absolutos: primeiro são avaliadas as
 * condições da situação e somente depois os pesos entram no sorteio.
 *
 * O movimento é contínuo. A IA mantém uma direção entre decisões, como se
 * estivesse segurando a tecla, evitando o efeito de pequenos cliques.
 *
 * O salto usa o mesmo duelJump() do sistema principal. Durante o salto,
 * esquerda/direita continuam funcionando, permitindo salto diagonal.
 *
 * Skills continuam usando as informações do Stage2 MultiSkills:
 *   <fskills: 2,3,4,5>
 *   <fhitbox: 80,40,60,30>
 *   <fcost: 100>
 *   <ai_priority: 80>
 *   <ai_range: 250>
 */
(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_FightingAI';
    var params = PluginManager.parameters(pluginName);

    var CFG = {
        decisionInterval: Number(params['Decision Interval'] || 10),
        minDecisionInterval: Number(params['Minimum Decision Interval'] || 5),
        airJumpMultiplier: Number(params['Air Jump Multiplier'] || 1.0),
        airDecisionChance: Number(params['Air Decision Chance'] || 35),
        airApproachBias: Number(params['Air Approach Bias'] || 70),
        airRetreatBias: Number(params['Air Retreat Bias'] || 30),
        jumpCooldown: Number(params['Jump Cooldown'] || 65),
        movementCommit: Number(params['Movement Commit'] || 18)
    };

    function noteNumber(note, tag, fallback) {
        var regex = new RegExp('<' + tag + ':\\s*([0-9]+)>', 'i');
        var m = String(note || '').match(regex);
        if (!m) return fallback;
        return Math.max(1, Math.min(100, Number(m[1])));
    }

    function hasTag(note, tag) {
        return new RegExp('<' + tag + '>','i').test(String(note || ''));
    }

    function aiData(actor) {
        var note = actor && actor.actor ? actor.actor().note : '';
        return {
            enabled: hasTag(note, 'fai'),
            aggression: noteNumber(note, 'fai_aggression', 70),
            defense: noteNumber(note, 'fai_defense', 45),
            skill: noteNumber(note, 'fai_skill', 60),
            retreat: noteNumber(note, 'fai_retreat', 20),
            jump: noteNumber(note, 'fai_jump', 25),
            movement: noteNumber(note, 'fai_movement', 80),
            reaction: noteNumber(note, 'fai_reaction', 60),
            spacing: noteNumber(note, 'fai_spacing', 50),
            air: noteNumber(note, 'fai_air', 35),
            airApproach: noteNumber(note, 'fai_air_approach', 70),
            airRetreat: noteNumber(note, 'fai_air_retreat', 30)
        };
    }

    function clamp100(value) {
        return Math.max(0, Math.min(100, value));
    }

    function weightedPick(items) {
        var total = 0;
        items.forEach(function(item) {
            item.weight = Math.max(0, item.weight || 0);
            total += item.weight;
        });
        if (total <= 0) return null;
        var roll = Math.random() * total;
        for (var i = 0; i < items.length; i++) {
            roll -= items[i].weight;
            if (roll <= 0) return items[i].action;
        }
        return items[items.length - 1].action;
    }

    // ---------------------------------------------------------------------
    // Hitbox / skill helpers. We deliberately read the existing MultiSkills
    // notetags instead of creating a second combat system.
    // ---------------------------------------------------------------------
    function noteValue(note, tag, fallback) {
        var regex = new RegExp('<' + tag + ':\\s*([^>]+)>', 'i');
        var m = String(note || '').match(regex);
        return m ? m[1].trim() : fallback;
    }

    function skillHitbox(skill) {
        if (!skill) return null;
        var raw = noteValue(skill.note, 'fhitbox', '');
        if (!raw) return null;
        var values = raw.split(',').map(function(v) { return Number(v.trim()); });
        return {
            width: Math.max(0, values[0] || 0),
            height: Math.max(0, values[1] || 0),
            distance: Math.max(0, values[2] || 0)
        };
    }

    function skillCost(skill) {
        if (!skill) return 0;
        var raw = noteValue(skill.note, 'fcost', '');
        if (raw !== '') return Math.max(0, Number(raw));
        return Math.max(0, Number(skill.mpCost || 0) + Number(skill.tpCost || 0));
    }

    function skillRange(skill) {
        if (!skill) return 0;
        var raw = noteValue(skill.note, 'ai_range', '');
        if (raw !== '') return Math.max(0, Number(raw));
        var box = skillHitbox(skill);
        if (box) return box.distance + box.width;
        return 0;
    }

    function skillPriority(skill) {
        if (!skill) return 50;
        return noteNumber(skill.note, 'ai_priority', 50);
    }

    function configuredSkills(actor) {
        var note = actor.actor().note || '';
        var raw = noteValue(note, 'fskills', '');
        if (!raw) return [];
        return raw.split(',').map(function(v) { return Number(v.trim()); }).filter(function(id) {
            return id > 0 && $dataSkills[id];
        });
    }

    function bestUsableSkill(actor, distance) {
        var ids = configuredSkills(actor);
        var best = null;
        var bestScore = -1;

        ids.forEach(function(id) {
            var skill = $dataSkills[id];
            if (!skill) return;
            var cost = skillCost(skill);
            if (actor._duelStamina < cost) return;
            if (typeof actor.duelCanUseSkill === 'function' && !actor.duelCanUseSkill(id)) return;

            var range = skillRange(skill);
            if (range > 0 && distance > range + 40) return;

            var score = skillPriority(skill);
            if (range > 0) {
                var distanceFit = 100 - Math.min(100, Math.abs(distance - range) / Math.max(1, range) * 100);
                score += distanceFit * 0.35;
            }
            if (score > bestScore) {
                bestScore = score;
                best = skill;
            }
        });
        return best;
    }

    function basicAttackReach(actor) {
        if (!actor) return 45;
        var data = actor.duelData ? actor.duelData() : null;
        return Math.max(1, Number(data && data.range || 45));
    }

    function maxRelevantReach(actor) {
        var reach = basicAttackReach(actor);
        configuredSkills(actor).forEach(function(id) {
            var skill = $dataSkills[id];
            reach = Math.max(reach, skillRange(skill));
        });
        return reach;
    }

    // ---------------------------------------------------------------------
    // Continuous movement: the AI commits to a direction for a short period
    // instead of deciding every few frames whether to press the key again.
    // ---------------------------------------------------------------------
    function ensureState(ai) {
        if (ai._movementDirection === undefined) ai._movementDirection = 0;
        if (ai._movementTimer === undefined) ai._movementTimer = 0;
        if (ai._decisionTimer === undefined) ai._decisionTimer = 0;
        if (ai._jumpCooldown === undefined) ai._jumpCooldown = 0;
        if (ai._airDecisionTimer === undefined) ai._airDecisionTimer = 0;
    }

    function setMovement(ai, direction, duration) {
        ai._movementDirection = direction;
        ai._movementTimer = Math.max(CFG.minDecisionInterval, duration || CFG.movementCommit);
    }

    function continueMovement(ai) {
        var actor = ai.actor;
        if (!actor || actor._duelDead) return false;
        if (actor._duelHitTimer > 0 || actor._duelAttackTimer > 0) return false;
        if (!ai._movementDirection) return false;
        actor.duelMove(ai._movementDirection);
        return true;
    }

    function clearMovement(ai) {
        ai._movementDirection = 0;
        ai._movementTimer = 0;
    }

    // ---------------------------------------------------------------------
    // Air movement / diagonal jumps
    // ---------------------------------------------------------------------
    function tryAirMovement(ai, data, directionToOpponent, distance) {
        var actor = ai.actor;
        if (!actor._duelJumping) return false;
        if (actor._duelHitTimer > 0 || actor._duelAttackTimer > 0) return false;

        // During a jump, horizontal movement remains active every frame.
        // This produces the equivalent of holding Left/Right while jumping.
        var airDirection = directionToOpponent;
        if (Math.random() * 100 < data.airRetreat && distance < basicAttackReach(actor) * 1.15) {
            airDirection = -directionToOpponent;
        }
        if (Math.random() * 100 < data.airApproach && distance > basicAttackReach(actor)) {
            airDirection = directionToOpponent;
        }
        actor.duelMove(airDirection);
        return true;
    }

    function canJump(actor) {
        return actor && !actor._duelJumping && !actor._duelDead &&
               actor._duelY >= 309 && actor._duelHitTimer <= 0 &&
               actor._duelAttackTimer <= 0 && !actor._duelGuarding;
    }

    // ---------------------------------------------------------------------
    // Decision engine
    // ---------------------------------------------------------------------
    function ActorDuelAI(actor, opponent) {
        this.actor = actor;
        this.opponent = opponent;
        this.actionTimer = 0;
        this.jumpTimer = 0;
        this._movementDirection = 0;
        this._movementTimer = 0;
        this._decisionTimer = 0;
        this._jumpCooldown = 0;
        this._airDecisionTimer = 0;
    }

    ActorDuelAI.prototype.update = function() {
        var actor = this.actor;
        var opponent = this.opponent;
        if (!actor || !opponent) return;
        if (actor._duelDead || opponent._duelDead) return;

        var data = aiData(actor);
        if (!data.enabled) return;
        ensureState(this);

        if (this._jumpCooldown > 0) this._jumpCooldown--;
        if (this._movementTimer > 0) this._movementTimer--;
        if (this._decisionTimer > 0) this._decisionTimer--;
        if (this._airDecisionTimer > 0) this._airDecisionTimer--;

        var delta = opponent._duelX - actor._duelX;
        var distance = Math.abs(delta);
        var direction = delta >= 0 ? 1 : -1;
        actor._duelFacing = direction;

        // Continuous horizontal movement during a jump.
        if (actor._duelJumping) {
            tryAirMovement(this, data, direction, distance);
            return;
        }

        // Hit/attack states have priority over AI decisions.
        if (actor._duelHitTimer > 0 || actor._duelAttackTimer > 0) {
            clearMovement(this);
            return;
        }

        // Keep holding the chosen movement direction until its commitment
        // expires. This is what restores smooth keyboard-like movement.
        if (this._movementTimer > 0 && this._movementDirection !== 0) {
            continueMovement(this);
        }

        // A higher reaction value means shorter decision intervals.
        if (this._decisionTimer > 0) return;
        var reactionFactor = data.reaction / 100;
        var interval = Math.max(
            CFG.minDecisionInterval,
            Math.round(CFG.decisionInterval * (1.5 - reactionFactor))
        );
        this._decisionTimer = interval;

        var basicReach = basicAttackReach(actor);
        var usableSkill = bestUsableSkill(actor, distance);
        var skillReach = usableSkill ? skillRange(usableSkill) : 0;
        var preferredReach = Math.max(basicReach, skillReach);

        var threat = opponent._duelAttackTimer > 0 || opponent._duelJumping;
        var veryClose = distance <= Math.max(20, basicReach * 0.55);
        var inBasicRange = distance <= basicReach + 20;
        var inSkillRange = usableSkill && distance <= skillReach + 30;
        var tooFar = distance > preferredReach + 35;
        var lowHp = actor.mhp > 0 && actor.hp / actor.mhp <= 0.30;

        var choices = [];

        // GUARD: only meaningful when a threat is present or the enemy is close.
        if (threat && (inBasicRange || veryClose)) {
            choices.push({
                action: 'guard',
                weight: data.defense * (opponent._duelAttackTimer > 0 ? 1.35 : 0.75)
            });
        }

        // SKILL: only if a real configured skill can currently be used.
        if (usableSkill && inSkillRange) {
            var skillWeight = data.skill * (skillPriority(usableSkill) / 50);
            if (distance > basicReach) skillWeight *= 1.25;
            if (lowHp) skillWeight *= 0.9;
            choices.push({ action: 'skill', weight: clamp100(skillWeight) });
        }

        // BASIC ATTACK: only if its actual normal range is reached.
        if (inBasicRange) {
            var attackWeight = data.aggression;
            if (opponent._duelHitTimer > 0) attackWeight *= 1.25;
            if (tooFar) attackWeight = 0;
            choices.push({ action: 'attack', weight: clamp100(attackWeight) });
        }

        // RETREAT: stronger when too close, threatened or low HP.
        if (veryClose || threat || lowHp) {
            var retreatWeight = data.retreat;
            if (veryClose) retreatWeight *= 1.35;
            if (lowHp) retreatWeight *= 1.5;
            if (threat) retreatWeight *= 1.15;
            choices.push({ action: 'retreat', weight: clamp100(retreatWeight) });
        }

        // JUMP: controlled approach/escape tool, not a constant action.
        if (canJump(actor) && this._jumpCooldown <= 0) {
            var jumpWeight = data.jump;
            if (tooFar) jumpWeight *= 1.55;
            if (threat) jumpWeight *= 1.2;
            if (distance > basicReach * 1.5) jumpWeight *= 1.25;
            choices.push({ action: 'jump', weight: clamp100(jumpWeight) });
        }

        // APPROACH: the default when no attack/skill can reach.
        if (tooFar) {
            var approachWeight = data.movement;
            if (distance > preferredReach * 1.75) approachWeight *= 1.35;
            choices.push({ action: 'approach', weight: clamp100(approachWeight) });
        }

        // SPACING / WAIT: prevents constant movement and creates breathing room.
        var spacingWeight = Math.max(1, 100 - data.movement);
        if (distance > preferredReach * 0.75 && distance < preferredReach * 1.15) {
            spacingWeight += data.spacing * 0.5;
        }
        choices.push({ action: 'wait', weight: clamp100(spacingWeight) });

        var action = weightedPick(choices);
        this.execute(action, direction, distance, preferredReach);
    };

    ActorDuelAI.prototype.execute = function(action, direction, distance, preferredReach) {
        var actor = this.actor;
        var opponent = this.opponent;
        var data = aiData(actor);

        if (!action) return;

        if (action === 'guard') {
            clearMovement(this);
            actor.duelStartGuard(true);
            return;
        }

        if (action === 'attack') {
            clearMovement(this);
            actor.duelStartGuard(false);
            actor.duelStartAttack();
            return;
        }

        if (action === 'skill') {
            clearMovement(this);
            actor.duelStartGuard(false);
            var skill = bestUsableSkill(actor, distance);
            if (skill && typeof actor.duelUseSkill === 'function') {
                actor.duelUseSkill(skill.id);
            }
            return;
        }

        if (action === 'jump') {
            clearMovement(this);
            actor.duelStartGuard(false);
            actor.duelJump();
            this._jumpCooldown = CFG.jumpCooldown;
            this._airDecisionTimer = Math.max(8, Math.round(20 * (1 - data.air / 100)));
            // Choose approach/retreat after takeoff. Horizontal movement is
            // applied every frame by update(), so this becomes a true diagonal jump.
            return;
        }

        if (action === 'retreat') {
            actor.duelStartGuard(false);
            setMovement(this, -direction, CFG.movementCommit);
            actor.duelMove(-direction);
            return;
        }

        if (action === 'approach') {
            actor.duelStartGuard(false);
            setMovement(this, direction, CFG.movementCommit);
            actor.duelMove(direction);
            return;
        }

        // WAIT: stop movement, but keep facing the opponent.
        if (action === 'wait') {
            clearMovement(this);
            actor.duelStartGuard(false);
        }
    };

    // ---------------------------------------------------------------------
    // Replace the original AI instance with the new engine when the scene
    // creates the CPU fighter. Player vs Player remains untouched.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_createActors = Scene_ActorDuel.prototype._createActors;
    Scene_ActorDuel.prototype._createActors = function() {
        _Scene_ActorDuel_createActors.call(this);
        if (this._finished) return;
        if (this._ai && this._ai.actor) {
            var data = aiData(this._ai.actor);
            if (data.enabled) {
                this._ai = new ActorDuelAI(this._actor2, this._actor1);
            }
        }
    };

    // ---------------------------------------------------------------------
    // Player diagonal jump support.
    // The base duelJump() already handles vertical physics; this wrapper
    // remembers the held horizontal direction and the scene update keeps
    // moving while airborne. Existing ground controls remain unchanged.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_updateFight = Scene_ActorDuel.prototype._updateFight;
    Scene_ActorDuel.prototype._updateFight = function() {
        if (_Scene_ActorDuel_updateFight) {
            _Scene_ActorDuel_updateFight.call(this);
        }

        var actor = this._actor1;
        if (!actor || actor._duelDead || !actor._duelJumping) return;
        if (actor._duelHitTimer > 0 || actor._duelAttackTimer > 0) return;

        var horizontal = 0;
        if (Input.isPressed('left')) horizontal = -1;
        if (Input.isPressed('right')) horizontal = 1;
        if (horizontal !== 0) {
            actor.duelMove(horizontal);
        }
    };

})();
