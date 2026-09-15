/*:
 * @plugindesc Galv Actor Duel MV - Multi-Skill System with directional X skills, hitboxes, knockback and AI
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * Player 1 skill controls:
 *   X = Skill 1
 *   UP + X = Skill 2
 *   DOWN + X = Skill 3
 *   LEFT/RIGHT + X = Skill 4
 *
 * Actor notetag:
 *   <fskills: 2,3,4,5>
 *
 * Skill notetags:
 *   <fcost: 100>
 *   <fhitbox: 80,40,60,30>
 *
 * fhitbox = width, height, distance, knockback.
 * The distance is measured forward from the fighter. Facing is handled
 * automatically. The third and fourth values may be omitted and default to 0.
 * Knockback is horizontal force applied away from the attacker.
 *
 * AI skill notetags:
 *   <ai_priority: 80>
 *   <ai_range: 250>
 *   <ai_type: projectile>
 *
 * @param AI Skill Chance
 * @type number
 * @min 0
 * @max 100
 * @default 70
 *
 * @param AI Decision Interval
 * @type number
 * @min 1
 * @default 30
 *
 * @param AI Minimum Stamina
 * @type number
 * @min 0
 * @default 100
 *
 * @param Skill Pose
 * @type number
 * @min 0
 * @max 13
 * @default 6
 *
 * @param Skill Duration
 * @type number
 * @min 1
 * @default 22
 *
 * @param Skill Cost Mode
 * @type select
 * @option Database MP Cost
 * @value mp
 * @option Database TP Cost
 * @value tp
 * @option Notetag Cost
 * @value note
 * @default note
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_MultiSkills';
    var params = PluginManager.parameters(pluginName);

    var AI_SKILL_CHANCE = Number(params['AI Skill Chance'] || 70);
    var AI_DECISION_INTERVAL = Number(params['AI Decision Interval'] || 30);
    var AI_MIN_STAMINA = Number(params['AI Minimum Stamina'] || 100);
    var SKILL_POSE = Number(params['Skill Pose'] || 6);
    var SKILL_DURATION = Number(params['Skill Duration'] || 22);
    var COST_MODE = String(params['Skill Cost Mode'] || 'note');

    // X key: keyCode 88.
    Input.keyMapper[88] = 'duelSkill';

    function noteValue(note, tag, fallback) {
        var regex = new RegExp('<' + tag + ':\\s*([^>]+)>', 'i');
        var match = String(note || '').match(regex);
        return match ? match[1].trim() : fallback;
    }

    function actorSkillSlots(actor) {
        var value = noteValue(actor ? actor.note : '', 'fskills', '0,0,0,0');
        var values = value.split(',').map(function(v) {
            return Number(v.trim()) || 0;
        });
        while (values.length < 4) values.push(0);
        return values.slice(0, 4);
    }

    function skillAiData(skill) {
        var note = skill ? skill.note : '';
        return {
            priority: Number(noteValue(note, 'ai_priority', '50')) || 50,
            range: Number(noteValue(note, 'ai_range', '9999')) || 9999,
            type: String(noteValue(note, 'ai_type', 'normal')).toLowerCase()
        };
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

    function duelScene() {
        return SceneManager._scene instanceof Scene_ActorDuel ? SceneManager._scene : null;
    }

    function opponentFor(actor) {
        var scene = duelScene();
        if (!scene) return null;
        if (scene._actor1 === actor) return scene._actor2;
        if (scene._actor2 === actor) return scene._actor1;
        return null;
    }

    function fighterSpriteFor(actor) {
        var scene = duelScene();
        if (!scene) return null;
        if (scene._actor1 === actor) return scene._sprite1;
        if (scene._actor2 === actor) return scene._sprite2;
        return null;
    }

    function playSkillAnimation(actor, target, skill) {
        if (!target || !skill) return;
        var animationId = Number(skill.animationId || 0);
        if (animationId <= 0 || !$dataAnimations || !$dataAnimations[animationId]) return;

        var targetSprite = fighterSpriteFor(target);
        if (targetSprite && targetSprite.startAnimation) {
            targetSprite.startAnimation($dataAnimations[animationId], false, 0);
        }
    }

    function skillCost(skill) {
        if (!skill) return 0;
        var noteCost = noteValue(skill.note, 'fcost', null);
        if (COST_MODE === 'note' && noteCost !== null) {
            return Math.max(0, Number(noteCost) || 0);
        }
        if (COST_MODE === 'mp') return Math.max(0, Number(skill.mpCost || 0));
        if (COST_MODE === 'tp') return Math.max(0, Number(skill.tpCost || 0));
        return Math.max(0, Number(skill.mpCost || 0));
    }

    // ---------------------------------------------------------------------
    // Hitbox test
    // ---------------------------------------------------------------------
    function skillHitboxHits(attacker, target, skill) {
        var box = skillHitbox(skill);

        // A skill without <fhitbox> keeps the old behavior: it hits directly.
        if (!box) return true;
        if (!attacker || !target) return false;

        var facing = Number(attacker._duelFacing || 1);
        if (facing >= 0) facing = 1;
        else facing = -1;

        var attackerX = Number(attacker._duelX || 0);
        var attackerY = Number(attacker._duelY || 0);
        var targetX = Number(target._duelX || 0);
        var targetY = Number(target._duelY || 0);

        var centerX = attackerX + facing * (box.distance + box.width / 2);
        var centerY = attackerY - box.height / 2;

        var left = centerX - box.width / 2;
        var right = centerX + box.width / 2;
        var top = centerY - box.height / 2;
        var bottom = centerY + box.height / 2;

        // The target has a simple collision body. The 20px half-width means
        // the target can overlap the edge of the skill hitbox naturally.
        var targetHalfWidth = 20;
        var targetHeight = 80;
        var targetLeft = targetX - targetHalfWidth;
        var targetRight = targetX + targetHalfWidth;
        var targetTop = targetY - targetHeight;
        var targetBottom = targetY;

        return right >= targetLeft &&
               left <= targetRight &&
               bottom >= targetTop &&
               top <= targetBottom;
    }

    // ---------------------------------------------------------------------
    // Knockback
    // ---------------------------------------------------------------------
    function applySkillKnockback(attacker, target, skill) {
        var box = skillHitbox(skill);
        if (!box || box.knockback <= 0 || !attacker || !target) return;

        var facing = Number(attacker._duelFacing || 1);
        facing = facing >= 0 ? 1 : -1;

        // The core duel system already has a knockback physics variable.
        // We feed the skill's custom force into that system instead of moving
        // _duelX directly. This prevents normal physics/AI movement from
        // immediately cancelling the effect.
        target._duelKnockback = facing * box.knockback;
    }

    // ---------------------------------------------------------------------
    // Game_Actor - skill state
    // ---------------------------------------------------------------------
    var _duelReset = Game_Actor.prototype.duelReset;
    Game_Actor.prototype.duelReset = function() {
        _duelReset.call(this);
        this._duelSkillTimer = 0;
        this._duelSkillUsed = false;
        this._duelAiSkillTimer = 0;
        this._duelLastSkillId = 0;
    };

    Game_Actor.prototype.duelSkillSlots = function() {
        return actorSkillSlots(this.actor());
    };

    Game_Actor.prototype.duelSkillForSlot = function(slot) {
        var slots = this.duelSkillSlots();
        return Number(slots[slot] || 0);
    };

    Game_Actor.prototype.duelCanUseSkill = function(skillId) {
        if (this._duelDead) return false;
        if (this._duelHitTimer > 0) return false;
        if (this._duelAttackTimer > 0) return false;
        if (this._duelSkillTimer > 0) return false;
        if (this._duelGuarding) return false;
        if (!$dataSkills || !$dataSkills[skillId]) return false;

        var cost = skillCost($dataSkills[skillId]);
        if (this._duelStamina < cost) return false;
        return true;
    };

    Game_Actor.prototype.duelUseSkill = function(skillId) {
        skillId = Number(skillId || 0);
        if (!this.duelCanUseSkill(skillId)) return false;

        var skill = $dataSkills[skillId];
        var target = opponentFor(this);
        if (!target || target._duelDead) return false;

        var cost = skillCost(skill);
        if (!this.duelSpendStamina(cost)) return false;

        this._duelSkillTimer = SKILL_DURATION;
        this._duelSkillUsed = true;
        this._duelLastSkillId = skillId;
        this._duelPose = SKILL_POSE;

        playSkillAnimation(this, target, skill);

        // A configured hitbox determines whether the skill connects.
        if (!skillHitboxHits(this, target, skill)) {
            return true;
        }

        var action = new Game_Action(this);
        action.setSkill(skillId);
        var damage = action.makeDamageValue(target, false);

        if (target._duelGuarding) {
            damage = Math.floor(damage * 0.25);
        }
        if (damage < 0) damage = 0;
        target.duelTakeDamage(damage, this);

        // duelTakeDamage establishes the normal 8px knockback. Override it
        // AFTER the damage call so the custom skill value is not overwritten.
        applySkillKnockback(this, target, skill);
        return true;
    };

    var _duelCanMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        if (this._duelSkillTimer > 0) return false;
        return _duelCanMove.call(this);
    };

    var _duelUpdatePhysics = Game_Actor.prototype.duelUpdatePhysics;
    Game_Actor.prototype.duelUpdatePhysics = function() {
        _duelUpdatePhysics.call(this);

        if (this._duelSkillTimer > 0) {
            this._duelSkillTimer--;
            if (this._duelSkillTimer <= 0 &&
                !this._duelDead &&
                this._duelHitTimer <= 0 &&
                this._duelAttackTimer <= 0 &&
                !this._duelGuarding) {
                this._duelPose = 0;
                this._duelSkillUsed = false;
            }
        }
    };

    function playerSkillSlot() {
        if (Input.isPressed('up')) return 1;
        if (Input.isPressed('down')) return 2;
        if (Input.isPressed('left') || Input.isPressed('right')) return 3;
        return 0;
    }

    var _sceneUpdate = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _sceneUpdate.call(this);
        if (!this._actor1) return;

        if (Input.isTriggered('duelSkill')) {
            var slot = playerSkillSlot();
            var skillId = this._actor1.duelSkillForSlot(slot);
            if (skillId > 0) {
                this._actor1.duelUseSkill(skillId);
            }
        }
    };

    function aiSkillCandidates(actor, opponent) {
        var slots = actor.duelSkillSlots();
        var candidates = [];
        var distance = Math.abs(actor._duelX - opponent._duelX);

        for (var i = 0; i < slots.length; i++) {
            var skillId = Number(slots[i] || 0);
            if (skillId <= 0 || !$dataSkills[skillId]) continue;
            if (!actor.duelCanUseSkill(skillId)) continue;

            var skill = $dataSkills[skillId];
            var ai = skillAiData(skill);
            if (distance > ai.range) continue;

            candidates.push({
                skillId: skillId,
                priority: ai.priority,
                distance: distance,
                range: ai.range,
                type: ai.type,
                slot: i
            });
        }
        return candidates;
    }

    function chooseAiSkill(actor, opponent) {
        var candidates = aiSkillCandidates(actor, opponent);
        if (!candidates.length) return 0;

        var total = 0;
        candidates.forEach(function(c) {
            total += Math.max(1, c.priority);
        });

        var roll = Math.random() * total;
        var accumulated = 0;
        for (var i = 0; i < candidates.length; i++) {
            accumulated += Math.max(1, candidates[i].priority);
            if (roll <= accumulated) return candidates[i].skillId;
        }
        return candidates[candidates.length - 1].skillId;
    }

    if (typeof ActorDuelAI !== 'undefined') {
        var _aiUpdate = ActorDuelAI.prototype.update;
        ActorDuelAI.prototype.update = function() {
            if (!this.actor || !this.opponent) {
                _aiUpdate.call(this);
                return;
            }

            if (this.actor._duelAiSkillTimer > 0) {
                this.actor._duelAiSkillTimer--;
            }

            if (!this.actor._duelDead &&
                !this.opponent._duelDead &&
                this.actor._duelHitTimer <= 0 &&
                this.actor._duelAttackTimer <= 0 &&
                this.actor._duelSkillTimer <= 0 &&
                this.actor._duelAiSkillTimer <= 0 &&
                this.actor._duelStamina >= AI_MIN_STAMINA) {

                this.actor._duelAiSkillTimer = AI_DECISION_INTERVAL;

                if (Math.random() * 100 < AI_SKILL_CHANCE) {
                    var skillId = chooseAiSkill(this.actor, this.opponent);
                    if (skillId > 0 && this.actor.duelUseSkill(skillId)) {
                        return;
                    }
                }
            }

            _aiUpdate.call(this);
        };
    }
})();
