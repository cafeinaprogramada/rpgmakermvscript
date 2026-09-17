/*:
 * @plugindesc Galv Actor Duel MV - Stage 3 Compatibility Fix v1.3
 * @author OpenAI / Lucas
 *
 * @help
 * Load AFTER Galv_ActorDuel_MV_Stage3_MatchFlow.js.
 *
 * Fixes:
 * 1. Stage 3 cinematic camera must not access the core plugin's private CFG.
 * 2. Fighting AI must not launch basic attacks outside the real attack range.
 * 3. Cinematic camera moves/scales the battleback together with the fighters.
 * 4. Cinematic camera preserves the core shadow's ground offset.
 * 5. Cinematic camera now reads the actual Ground Y configured in the core
 *    plugin instead of using a hardcoded 310px value.
 *
 * IMPORTANT:
 * The core plugin's CFG is private, so this module reads the public Plugin
 * Manager parameter directly. This keeps the cinematic camera synchronized
 * with any custom Ground Y value used by the project.
 */
(function() {
    'use strict';

    // ---------------------------------------------------------------------
    // Read the public core parameter instead of duplicating/hardcoding it.
    // ---------------------------------------------------------------------
    var CORE_PARAMS = PluginManager.parameters('Galv_ActorDuel_MV');
    var GROUND_Y = Number(CORE_PARAMS['Ground Y'] || 310);
    var SHADOW_GROUND_OFFSET = 5;

    // ---------------------------------------------------------------------
    // Fix 3 support: remember the original battleback transform.
    // ---------------------------------------------------------------------
    if (typeof Scene_ActorDuel !== 'undefined') {
        var _stage3CreateCinematicLayer =
            Scene_ActorDuel.prototype._stage3CreateCinematicLayer;

        Scene_ActorDuel.prototype._stage3CreateCinematicLayer = function() {
            if (_stage3CreateCinematicLayer) {
                _stage3CreateCinematicLayer.call(this);
            }

            this._stage3Back1BaseX = this._backSprite1 ? this._backSprite1.x : 0;
            this._stage3Back1BaseY = this._backSprite1 ? this._backSprite1.y : 0;
            this._stage3Back1ScaleX = this._backSprite1 ? this._backSprite1.scale.x : 1;
            this._stage3Back1ScaleY = this._backSprite1 ? this._backSprite1.scale.y : 1;

            this._stage3Back2BaseX = this._backSprite2 ? this._backSprite2.x : 0;
            this._stage3Back2BaseY = this._backSprite2 ? this._backSprite2.y : 0;
            this._stage3Back2ScaleX = this._backSprite2 ? this._backSprite2.scale.x : 1;
            this._stage3Back2ScaleY = this._backSprite2 ? this._backSprite2.scale.y : 1;
        };
    }

    // ---------------------------------------------------------------------
    // Fix 1 + 3 + 4 + 5: cinematic camera for fighters, shadows and battleback.
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
            var centerY = Graphics.height * 0.5;
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

                // The core shadow sits at Ground Y + 5. Use the same Ground Y
                // configured by the core plugin, so custom arenas remain
                // aligned with the cinematic camera.
                var shadowGroundY = GROUND_Y + SHADOW_GROUND_OFFSET;
                var shadowY = Math.round(
                    shadowGroundY * zoom +
                    (Graphics.height * (1 - zoom)) + shakeY
                );
                this._shadow1.y = shadowY;
                this._shadow2.y = shadowY;

                // Keep the shadow's current airborne/ground scale, but apply
                // the same cinematic zoom factor to it.
                var shadowScaleX1 = Number(this._shadow1.scale.x || 1);
                var shadowScaleY1 = Number(this._shadow1.scale.y || 1);
                var shadowScaleX2 = Number(this._shadow2.scale.x || 1);
                var shadowScaleY2 = Number(this._shadow2.scale.y || 1);
                this._shadow1.scale.x = shadowScaleX1 * zoom;
                this._shadow1.scale.y = shadowScaleY1 * zoom;
                this._shadow2.scale.x = shadowScaleX2 * zoom;
                this._shadow2.scale.y = shadowScaleY2 * zoom;
            }

            // Move the two battleback layers as part of the same virtual
            // camera. The background is transformed around the screen center
            // instead of simply being shifted, so the zoom feels coherent.
            this._stage3ApplyBackCamera(
                this._backSprite1,
                this._stage3Back1BaseX,
                this._stage3Back1BaseY,
                this._stage3Back1ScaleX,
                this._stage3Back1ScaleY,
                zoom,
                centerX,
                centerY,
                shakeX,
                shakeY
            );

            this._stage3ApplyBackCamera(
                this._backSprite2,
                this._stage3Back2BaseX,
                this._stage3Back2BaseY,
                this._stage3Back2ScaleX,
                this._stage3Back2ScaleY,
                zoom,
                centerX,
                centerY,
                shakeX,
                shakeY
            );
        };

        Scene_ActorDuel.prototype._stage3ApplyBackCamera = function(
            sprite, baseX, baseY, baseScaleX, baseScaleY,
            zoom, centerX, centerY, shakeX, shakeY
        ) {
            if (!sprite) return;

            baseX = Number(baseX || 0);
            baseY = Number(baseY || 0);
            baseScaleX = Number(baseScaleX || 1);
            baseScaleY = Number(baseScaleY || 1);

            sprite.x = Math.round(
                centerX + (baseX - centerX) * zoom + shakeX
            );
            sprite.y = Math.round(
                centerY + (baseY - centerY) * zoom + shakeY
            );
            sprite.scale.x = baseScaleX * zoom;
            sprite.scale.y = baseScaleY * zoom;
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