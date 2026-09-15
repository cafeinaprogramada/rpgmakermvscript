/*:
 * @plugindesc Galv Actor Duel MV - Multi-Skill System with directional X skills and AI
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * ============================================================================
 * GALV ACTOR DUEL MV - MULTI SKILLS
 * ============================================================================
 *
 * Player 1 skill controls:
 *
 *   X       = Skill 1 (neutral)
 *   UP + X  = Skill 2
 *   DOWN + X = Skill 3
 *   LEFT/RIGHT + X = Skill 4
 *
 * Each actor can define fewer than four skills. Use 0 for an empty slot.
 *
 * Actor notetag:
 *   <fskills: 2,3,4,5>
 *
 * Order:
 *   1 = neutral + X
 *   2 = UP + X
 *   3 = DOWN + X
 *   4 = LEFT/RIGHT + X
 *
 * Example:
 *   <fskills: 2,0,5,7>
 *
 * The actor has Skill 2 on X, no upward skill, Skill 5 on DOWN+X,
 * and Skill 7 on horizontal+X.
 *
 * ---------------------------------------------------------------------------
 * SKILL NOTETAGS
 * ---------------------------------------------------------------------------
 *
 * Optional skill AI data:
 *
 *   <ai_priority: 80>
 *   <ai_range: 250>
 *   <ai_type: projectile>
 *
 * ai_priority = preference for this skill. Default 50.
 * ai_range    = maximum useful distance. Default 9999.
 * ai_type     = free text category. Default normal.
 *
 * Current AI uses priority and range directly. ai_type is stored for future
 * behavior expansion (projectile, melee, heal, guardbreak, etc.).
 *
 * ---------------------------------------------------------------------------
 * AI BEHAVIOR
 * ---------------------------------------------------------------------------
 *
 * Plugin Manager parameters:
 *
 *   AI Skill Chance       = percentage chance of attempting a skill when the
 *                           AI reaches a decision point.
 *   AI Decision Interval  = minimum frames between AI skill decisions.
 *   AI Minimum Stamina    = minimum stamina required before the AI considers
 *                           using a skill.
 *
 * The AI uses the exact same duelUseSkill(skillId) function as the player.
 * It does not simulate keyboard input.
 *
 * ---------------------------------------------------------------------------
 * IMPORTANT
 * ---------------------------------------------------------------------------
 *
 * This module replaces the old dedicated test module for multi-skill use.
 * Disable while testing this module:
 *   - Galv_ActorDuel_MV_Stage2_SkillKey_MVAnimation.js
 *   - Galv_ActorDuel_MV_Stage2_Skills_V3.js
 *   - Galv_ActorDuel_MV_Stage2_Skills_V3_Bridge.js
 *   - Galv_ActorDuel_MV_Stage2_EmissionFX.js
 *
 * The actual skill visual comes from the RPG Maker MV Database Animation.
 * No FightSkills.png projectile system is used by this module.
 *
 * @param AI Skill Chance
 * @type number
 * @min 0
 * @max 100
 * @default 70
 * @desc Global chance (0-100) for AI to attempt a skill.
 *
 * @param AI Decision Interval
 * @type number
 * @min 1
 * @default 30
 * @desc Minimum frames between AI skill decisions.
 *
 * @param AI Minimum Stamina
 * @type number
 * @min 0
 * @default 100
 * @desc AI will not consider skills below this stamina value.
 *
 * @param Skill Pose
 * @type number
 * @min 0
 * @max 13
 * @default 6
 * @desc Holder pose used while a skill is being executed.
 *
 * @param Skill Duration
 * @type number
 * @min 1
 * @default 22
 * @desc Duration of the skill action in frames.
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
 * @desc Which cost source is used by duel skills.
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

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
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

        // Fallback when note mode has no <fcost>.
        return Math.max(0, Number(skill.mpCost || 0));
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

    // ---------------------------------------------------------------------
    // The single skill execution entry point shared by PLAYER and AI.
    // ---------------------------------------------------------------------
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

        var action = new Game_Action(this);
        action.setSkill(skillId);

        var damage = action.makeDamageValue(target, false);

        if (target._duelGuarding) {
            damage = Math.floor(damage * 0.25);
        }

        if (damage < 0) damage = 0;
        target.duelTakeDamage(damage, this);

        return true;
    };

    // Keep the skill action separate from the basic attack timer.
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

    // ---------------------------------------------------------------------
    // Player input: direction + X selects one of four actor skill slots.
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // AI skill selection.
    // ---------------------------------------------------------------------
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

        // Weighted random selection. Higher priority makes a skill more likely
        // without making the AI perfectly deterministic.
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

    var _aiUpdate = ActorDuelAI.prototype.update;
    ActorDuelAI.prototype.update = function() {
        if (!this.actor || !this.opponent) {
            _aiUpdate.call(this);
            return;
        }

        if (this.actor._duelAiSkillTimer > 0) {
            this.actor._duelAiSkillTimer--;
        }

        // Do not interrupt hit/attack/dead states.
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

})();
