/*:
 * @plugindesc Galv Actor Duel MV - Dedicated Skill Key + MV Animation test module
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * ---------------------------------------------------------------------------
 * DEDICATED SKILL TEST MODULE
 * ---------------------------------------------------------------------------
 *
 * This module intentionally does NOT depend on the Stage 2 projectile modules.
 * It gives Player 1 a dedicated skill button:
 *
 *     X = use skill
 *
 * The normal basic attack remains on the existing attack key (Z/OK).
 *
 * The skill graphic comes exclusively from the RPG Maker MV Database
 * Animation assigned to the configured skill.
 *
 * Recommended first test:
 *   Skill ID       = 2
 *   Skill Cost     = 100
 *   Animation ID   = 115 (or any valid MV database animation)
 *   Skill Pose     = 6
 *
 * The configured skill's database animation is displayed on the opponent.
 * Damage is calculated through Game_Action using the selected skill, so the
 * skill uses the normal RPG Maker MV damage formula.
 *
 * The module deliberately avoids FightSkills.png and projectile sprites.
 * It is intended as a clean foundation for the next Stage 2 implementation.
 *
 * IMPORTANT:
 * Disable these older Stage 2 plugins while testing this module:
 *   - Galv_ActorDuel_MV_Stage2_Skills_V3.js
 *   - Galv_ActorDuel_MV_Stage2_Skills_V3_Bridge.js
 *   - Galv_ActorDuel_MV_Stage2_EmissionFX.js
 *
 * Plugin order:
 *   1. Galv_ActorDuel_MV.js
 *   2. Galv_ActorDuel_MV_Stage1_Fix.js
 *   3. Galv_ActorDuel_MV_Stage1_HUD.js
 *   4. Galv_ActorDuel_MV_Stage1_CombatFX.js
 *   5. Galv_ActorDuel_MV_Stage2_SkillKey_MVAnimation.js
 *
 * ---------------------------------------------------------------------------
 *
 * @param Skill ID
 * @type skill
 * @default 2
 *
 * @param Skill Cost
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
 * @param Skill Animation
 * @type animation
 * @default 115
 *
 * @param Skill Duration
 * @type number
 * @min 1
 * @default 22
 *
 * @param X Key Code
 * @type number
 * @default 88
 * @desc Keyboard key code for X. 88 = X.
 *
 * @param Allow P2
 * @type boolean
 * @default false
 * @desc If true, P2 can also use the skill with the same mapped key.
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_SkillKey_MVAnimation';
    var params = PluginManager.parameters(pluginName);

    var SKILL_ID = Number(params['Skill ID'] || 2);
    var SKILL_COST = Number(params['Skill Cost'] || 100);
    var SKILL_POSE = Number(params['Skill Pose'] || 6);
    var SKILL_ANIMATION = Number(params['Skill Animation'] || 115);
    var SKILL_DURATION = Number(params['Skill Duration'] || 22);
    var X_KEY_CODE = Number(params['X Key Code'] || 88);
    var ALLOW_P2 = String(params['Allow P2'] || 'false') === 'true';

    // ---------------------------------------------------------------------
    // Dedicated X key.
    // ---------------------------------------------------------------------
    Input.keyMapper[X_KEY_CODE] = 'duelSkill';

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------
    function validSkill() {
        return $dataSkills && $dataSkills[SKILL_ID];
    }

    function fighterSpriteFor(actor) {
        var scene = SceneManager._scene;
        if (!scene || !(scene instanceof Scene_ActorDuel)) return null;

        if (scene._actor1 === actor) return scene._sprite1;
        if (scene._actor2 === actor) return scene._sprite2;
        return null;
    }

    function opponentFor(actor) {
        var scene = SceneManager._scene;
        if (!scene || !(scene instanceof Scene_ActorDuel)) return null;

        if (scene._actor1 === actor) return scene._actor2;
        if (scene._actor2 === actor) return scene._actor1;
        return null;
    }

    function playSkillAnimation(target, animationId) {
        if (!target || animationId <= 0) return;
        if (!$dataAnimations || !$dataAnimations[animationId]) return;

        target.startAnimation($dataAnimations[animationId], false, 0);
    }

    // ---------------------------------------------------------------------
    // Game_Actor
    // ---------------------------------------------------------------------
    Game_Actor.prototype.duelUseDedicatedSkill = function() {
        if (this._duelDead) return false;
        if (this._duelHitTimer > 0) return false;
        if (this._duelAttackTimer > 0) return false;
        if (this._duelGuarding) return false;
        if (this._duelSkillTimer > 0) return false;

        var skill = validSkill();
        if (!skill) return false;

        var cost = SKILL_COST;
        if (!this.duelSpendStamina(cost)) return false;

        this._duelSkillTimer = SKILL_DURATION;
        this._duelPose = SKILL_POSE;
        this._duelSkillUsed = true;

        // Skill sound: use the database skill's normal MP/TP sound if one is
        // configured by the database action; otherwise leave audio untouched.
        if (skill.message1 || skill.message2) {
            // No message is displayed in the duel. This branch intentionally
            // does nothing; it simply documents that database messages are
            // not part of this action.
        }

        var target = opponentFor(this);
        var animationId = SKILL_ANIMATION > 0 ? SKILL_ANIMATION : Number(skill.animationId || 0);

        // Play the configured MV animation directly on the opponent.
        // This is the only visual representation of the test skill.
        var targetSprite = fighterSpriteFor(target);
        if (targetSprite) {
            playSkillAnimation(targetSprite, animationId);
        }

        // Apply normal RPG Maker MV skill damage immediately. This keeps the
        // test module independent from projectile logic while still making
        // the selected database skill a real combat action.
        if (target && !target._duelDead) {
            var action = new Game_Action(this);
            action.setSkill(skill.id);

            var damage = action.makeDamageValue(target, false);

            if (target._duelGuarding) {
                damage = Math.floor(damage * 0.25);
            }

            if (damage < 0) damage = 0;
            target.duelTakeDamage(damage, this);
        }

        return true;
    };

    // ---------------------------------------------------------------------
    // Keep the skill timer separate from the normal attack timer.
    // ---------------------------------------------------------------------
    var _duelReset = Game_Actor.prototype.duelReset;
    Game_Actor.prototype.duelReset = function() {
        _duelReset.call(this);
        this._duelSkillTimer = 0;
        this._duelSkillUsed = false;
    };

    var _duelCanMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        if (this._duelSkillTimer > 0) return false;
        return _duelCanMove.call(this);
    };

    // Update the dedicated skill timer without touching the main attack logic.
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
    // Scene input: X only controls Player 1 by default.
    // ---------------------------------------------------------------------
    var _sceneUpdate = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _sceneUpdate.call(this);

        if (Input.isTriggered('duelSkill')) {
            if (this._actor1) {
                this._actor1.duelUseDedicatedSkill();
            }

            if (ALLOW_P2 && this._actor2) {
                this._actor2.duelUseDedicatedSkill();
            }
        }
    };

})();
