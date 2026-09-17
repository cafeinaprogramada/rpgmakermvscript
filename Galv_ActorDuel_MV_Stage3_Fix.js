/*:
 * @plugindesc Galv Actor Duel MV - Stage 3 Compatibility Fix v1.0
 * @author OpenAI / Lucas
 *
 * @help
 * Load AFTER Galv_ActorDuel_MV_Stage3_MatchFlow.js.
 *
 * Fixes:
 * 1. Stage 3 cinematic camera referenced the core plugin's private CFG
 *    object. CFG is not visible outside Galv_ActorDuel_MV.js, causing
 *    "ReferenceError: CFG is not defined" during the KO cinematic.
 *
 * 2. The Fighting AI could start a basic attack slightly outside the
 *    actual basic attack range (its decision window was larger than the
 *    core hit range). This could make it swing repeatedly without closing
 *    the remaining distance. The fix cancels an AI attack when it is truly
 *    out of range and makes the AI approach instead.
 */
(function() {
    'use strict';

    var GROUND_Y = 310;

    // ---------------------------------------------------------------------
    // Fix 1: Stage 3 camera must not access the core plugin's private CFG.
    // ---------------------------------------------------------------------
    if (typeof Scene_ActorDuel !== 'undefined') {
        Scene_ActorDuel.prototype._stage3ApplyCamera = function() {
            if (!this._sprite1 || !this._sprite2 ||
                !this._actor1 || !this._actor2) return;

            var zoom = Number(this._stage3Zoom || 1);
            var shakeX = Number(this._stage3ShakeX || 0);
            var shakeY = Number(this._stage3ShakeY || 0);

            var cx = (this._actor1._duelX + this._actor2._duelX) * 0.5;
            var centerX = Graphics.width * 0.5;
            var shift = (centerX - cx) * (zoom - 1);

            this._sprite1.x = Math.round(
                this._actor1._duelX * zoom + shift + shakeX
            );
            this._sprite2.x = Math.round(
                this._actor2._duelX * zoom + shift + shakeX
            );

            this._sprite1.y = Math.round(
                this._actor1._duelY * zoom +
                (Graphics.height * (1 - zoom)) + shakeY
            );
            this._sprite2.y = Math.round(
                this._actor2._duelY * zoom +
                (Graphics.height * (1 - zoom)) + shakeY
            );

            var baseX1 = Number(this._stage3BaseScale1 || 2);
            var baseX2 = Number(this._stage3BaseScale2 || -2);
            var baseY1 = Number(this._stage3BaseScaleY1 || 2);
            var baseY2 = Number(this._stage3BaseScaleY2 || 2);

            var sx1 = Math.abs(baseX1) * zoom;
            var sx2 = Math.abs(baseX2) * zoom;

            this._sprite1.scale.x =
                (this._actor1._duelFacing >= 0 ? 1 : -1) * sx1;
            this._sprite2.scale.x =
                (this._actor2._duelFacing >= 0 ? 1 : -1) * sx2;
            this._sprite1.scale.y = baseY1 * zoom;
            this._sprite2.scale.y = baseY2 * zoom;

            if (this._shadow1 && this._shadow2) {
                this._shadow1.x = Math.round(
                    this._actor1._duelX * zoom + shift + shakeX
                );
                this._shadow2.x = Math.round(
                    this._actor2._duelX * zoom + shift + shakeX
                );

                var shadowY = Math.round(
                    GROUND_Y * zoom +
                    (Graphics.height * (1 - zoom)) + shakeY
                );
                this._shadow1.y = shadowY;
                this._shadow2.y = shadowY;
            }
        };
    }

    // ---------------------------------------------------------------------
    // Fix 2: keep AI basic attacks inside the real hit range.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_updateFight =
        Scene_ActorDuel.prototype._updateFight;

    Scene_ActorDuel.prototype._updateFight = function() {
        _Scene_ActorDuel_updateFight.call(this);

        // Stage 3 ending is already frozen. Do not touch its cinematic.
        if (this._stage3Ending) return;
        if (!this._ai || !this._ai.actor || !this._ai.opponent) return;

        var actor = this._ai.actor;
        var opponent = this._ai.opponent;
        if (actor._duelDead || opponent._duelDead) return;

        // The actual core attack uses duelData().range. The AI's old
        // decision window allowed +20 pixels, which is useful for deciding
        // when to approach but is too large for actually launching a hit.
        var duelData = actor.duelData ? actor.duelData() : null;
        var realRange = Number(duelData && duelData.range || 45);
        var distance = Math.abs(actor._duelX - opponent._duelX);

        if (actor._duelAttackTimer > 0 && distance > realRange) {
            actor._duelAttackTimer = 0;
            actor._duelAttackHit = false;

            if (!actor._duelHitTimer && !actor._duelGuarding) {
                var direction = opponent._duelX >= actor._duelX ? 1 : -1;
                actor._duelFacing = direction;
                actor.duelMove(direction);
            }
        }
    };
})();
