/*:
 * @plugindesc Galv Actor Duel MV - Stage 2 Skill Emission FX
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 * @help
 * Plays the projectile's database animation at the fighter when the skill
 * is emitted. This reproduces the original VX Ace behavior:
 * self.animation_id = sk.fproj[2]
 *
 * The animation ID comes from:
 * <fp: pose,speed,animationId,lifetime,reach>
 *
 * Example:
 * <fp: 6,8,115,60,32>
 *
 * Plugin order:
 * 1. Galv_ActorDuel_MV.js
 * 2. Stage 1 plugins
 * 3. Galv_ActorDuel_MV_Stage2_Skills_V3.js
 * 4. Galv_ActorDuel_MV_Stage2_EmissionFX.js
 */
(function() {
    'use strict';

    var PLUGIN = 'Galv_ActorDuel_MV_Stage2_EmissionFX';

    function readProjectileAnimation(skill) {
        if (!skill || !skill.note) return 0;

        var match = String(skill.note).match(/<fp:\s*([^>]+)>/i);
        if (!match) return 0;

        var values = match[1].split(',').map(function(value) {
            return Number(String(value).trim());
        });

        return Number(values[2] || 0);
    }

    var _spawn = Scene_ActorDuel.prototype._spawnStage2ProjectileV3;
    Scene_ActorDuel.prototype._spawnStage2ProjectileV3 = function(owner, skill, data) {
        // First let V3 create the actual projectile exactly as before.
        _spawn.call(this, owner, skill, data);

        var animationId = Number(data && data.animationId || 0);
        if (!animationId) animationId = readProjectileAnimation(skill);
        if (!animationId || !$dataAnimations[animationId]) return;

        // Reproduce the original: the emission animation belongs to the owner,
        // not to the travelling projectile.
        var fighterSprite = null;

        if (this._actor1 === owner && this._sprite1) {
            fighterSprite = this._sprite1;
        } else if (this._actor2 === owner && this._sprite2) {
            fighterSprite = this._sprite2;
        }

        if (fighterSprite && fighterSprite.startAnimation) {
            fighterSprite.startAnimation($dataAnimations[animationId], false, 0);
        }
    };
})();
