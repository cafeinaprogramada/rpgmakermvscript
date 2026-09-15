/*:
 * @plugindesc Galv Actor Duel MV - Dedicated Jump + Air Movement
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @param Jump Key
 * @type number
 * @default 32
 * @desc Keyboard key code. 32 = Space.
 *
 * @param Air Speed Multiplier
 * @type number
 * @decimals 2
 * @default 1.00
 *
 * @help
 * Dedicated jump and aerial movement layer for Actor Duel MV.
 *
 * CONTROLS:
 *   Space       = Jump
 *   Left/Right  = Horizontal movement
 *   Space+Left  = Diagonal jump left
 *   Space+Right = Diagonal jump right
 *
 * Up is no longer used as the P1 jump button.
 *
 * The plugin creates a shared duelAirMove() state/method. While
 * _duelJumping is true, horizontal movement is allowed every frame.
 * Vertical movement remains controlled by the core duel physics.
 *
 * The AI Fighting plugin may use its own air controller, but it shares
 * the same _duelJumping state and the same horizontal speed.
 */
(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_AirMovement';
    var params = PluginManager.parameters(pluginName);

    var JUMP_KEY = Number(params['Jump Key'] || 32);
    var AIR_SPEED_MULTIPLIER = Number(params['Air Speed Multiplier'] || 1.0);

    // Space becomes a dedicated duel jump input instead of MV's generic OK.
    Input.keyMapper[JUMP_KEY] = 'duelJump';

    // -------------------------------------------------------------
    // Shared aerial movement method
    // -------------------------------------------------------------
    Game_Actor.prototype.duelAirMove = function(direction) {
        if (this._duelDead) return;
        if (!this._duelJumping) return;
        if (this._duelHitTimer > 0) return;
        if (this._duelAttackTimer > 0) return;
        if (this._duelGuarding) return;

        var speed = Number(this._duelSpeed || 4) * AIR_SPEED_MULTIPLIER;
        this._duelX += direction * speed;

        // Keep the fighter inside the same arena boundaries as the duel.
        var minX = 40;
        var maxX = Graphics.boxWidth - 40;
        if (this._duelX < minX) this._duelX = minX;
        if (this._duelX > maxX) this._duelX = maxX;
    };

    // -------------------------------------------------------------
    // P1 controls
    // -------------------------------------------------------------
    Scene_ActorDuel.prototype._updatePlayer1 = function() {
        var actor = this._actor1;
        if (!actor || actor._duelDead) return;

        // Space starts the jump. Up is deliberately ignored here.
        if (Input.isTriggered('duelJump')) {
            actor.duelJump();
        }

        // Ground guard only. Airborne fighters are free to move.
        if (!actor._duelJumping && Input.isPressed('down')) {
            actor.duelStartGuard(true);
        } else {
            actor.duelStartGuard(false);
        }

        // Ground movement.
        if (!actor._duelJumping && actor.duelCanMove()) {
            if (Input.isPressed('left')) actor.duelMove(-1);
            else if (Input.isPressed('right')) actor.duelMove(1);
        }

        // Air movement: held Left/Right acts like a horizontal air velocity.
        if (actor._duelJumping) {
            if (Input.isPressed('left')) actor.duelAirMove(-1);
            else if (Input.isPressed('right')) actor.duelAirMove(1);
        }

        // Z remains the normal attack button.
        if (Input.isTriggered('ok')) actor.duelStartAttack();
    };

    // -------------------------------------------------------------
    // P2 controls, if 2-player mode is used.
    // R remains the P2 jump button for compatibility.
    // -------------------------------------------------------------
    Scene_ActorDuel.prototype._updatePlayer2 = function() {
        var data = duelSystem();
        if (data.mode !== 1) return;

        var actor = this._actor2;
        if (!actor || actor._duelDead) return;

        if (Input.isTriggered('r')) {
            actor.duelJump();
        }

        if (!actor._duelJumping && Input.isPressed('s')) {
            actor.duelStartGuard(true);
        } else {
            actor.duelStartGuard(false);
        }

        if (!actor._duelJumping && actor.duelCanMove()) {
            if (Input.isPressed('a')) actor.duelMove(-1);
            else if (Input.isPressed('d')) actor.duelMove(1);
        }

        if (actor._duelJumping) {
            if (Input.isPressed('a')) actor.duelAirMove(-1);
            else if (Input.isPressed('d')) actor.duelAirMove(1);
        }

        if (Input.isTriggered('control')) actor.duelStartAttack();
    };

})();