/*:
 * @plugindesc Galv Actor Duel MV - Stage 3 Timer / configurable round clock
 * @author OpenAI / Lucas
 *
 * @param Default Time
 * @type number
 * @min 0
 * @default 60
 * @desc Default round time in seconds. 0 = infinite.
 *
 * @param Show During Intro
 * @type boolean
 * @default true
 * @desc Shows the configured timer during READY/FIGHT intro, but does not count down until the fight begins.
 *
 * @param Timer X
 * @type number
 * @min -9999
 * @default 0
 * @desc Horizontal position. 0 = automatically center the timer.
 *
 * @param Timer Y
 * @type number
 * @min -9999
 * @default 12
 * @desc Vertical position of the timer.
 *
 * @param Timer Width
 * @type number
 * @min 40
 * @default 140
 *
 * @param Timer Height
 * @type number
 * @min 20
 * @default 70
 *
 * @param Font Size
 * @type number
 * @min 8
 * @default 52
 *
 * @param Font Face
 * @default Arial
 *
 * @param Text Color
 * @default #ffffff
 *
 * @param Outline Color
 * @default #000000
 *
 * @param Outline Width
 * @type number
 * @min 0
 * @default 8
 *
 * @param Alignment
 * @type select
 * @option left
 * @option center
 * @option right
 * @default center
 *
 * @param Leading Zero
 * @type boolean
 * @default false
 * @desc If true, 9 becomes 09. Values below 100 are padded to 2 digits.
 *
 * @param Infinite Text
 * @default ∞
 *
 * @param Expired Text
 * @default 00
 *
 * @param Show Label
 * @type boolean
 * @default false
 *
 * @param Label Text
 * @default TIME
 *
 * @param Label Font Size
 * @type number
 * @min 8
 * @default 14
 *
 * @param Label Offset Y
 * @type number
 * @default -8
 *
 * @help
 * Galv Actor Duel MV - Stage 3 Timer
 * -----------------------------------
 * Load AFTER:
 *   Galv_ActorDuel_MV.js
 *   Galv_ActorDuel_MV_Stage3_MatchFlow.js
 *   and the other Actor Duel modules.
 *
 * The timer is deliberately modular: it controls time and its own display,
 * while the match-flow plugin remains responsible for KO/result presentation.
 *
 * DEFAULT:
 *   60 seconds.
 *
 * IMPORTANT:
 *   - The clock is displayed during the READY/FIGHT intro if enabled.
 *   - The countdown starts only when Scene_ActorDuel enters phase 1 (fight).
 *   - It stops at 00 and DOES NOT decide the winner yet. Time Over result
 *     handling will be added in the next timer stage.
 *   - The timer pauses during Stage 3 cinematic ending/fade.
 *   - 0 seconds means INFINITE time.
 *
 * PLUGIN COMMANDS (RPG Maker MV):
 *
 *   ActorDuel set_timer 30
 *       Sets the timer for the next/current duel to 30 seconds.
 *
 *   ActorDuel set_timer 60
 *       Sets it to 60 seconds.
 *
 *   ActorDuel set_timer infinite
 *       Sets an infinite timer.
 *
 *   ActorDuel set_timer 0
 *       Also sets an infinite timer.
 *
 *   ActorDuel timer 30
 *       Alias of set_timer.
 *
 *   ActorDuel timer infinite
 *       Alias of set_timer infinite.
 *
 *   ActorDuel reset_timer
 *       Removes the per-duel override and returns to the Plugin Manager
 *       Default Time for the next duel.
 *
 *   ActorDuel pause_timer
 *       Pauses the countdown.
 *
 *   ActorDuel resume_timer
 *       Resumes the countdown.
 *
 *   ActorDuel add_timer 10
 *       Adds 10 seconds to the current finite timer.
 *
 *   ActorDuel add_timer -10
 *       Removes 10 seconds from the current timer, stopping at 00.
 *
 *   ActorDuel timer_set 30
 *       Immediately changes the current timer to 30 seconds as well as
 *       storing that value as the current duel timer.
 *
 *   ActorDuel timer_status
 *       Logs the current timer state to the developer console.
 *
 * Examples:
 *
 *   ◆ Plugin Command: ActorDuel set_timer 30
 *   ◆ Plugin Command: ActorDuel start 25
 *
 *   -> 30-second duel.
 *
 *   ◆ Plugin Command: ActorDuel set_timer infinite
 *   ◆ Plugin Command: ActorDuel start 25
 *
 *   -> Infinite duel.
 *
 *   ◆ Plugin Command: ActorDuel reset_timer
 *   ◆ Plugin Command: ActorDuel start 25
 *
 *   -> Uses the Plugin Manager Default Time (60 by default).
 *
 * The timer is exposed on Scene_ActorDuel as:
 *   scene._duelTimerSeconds
 *   scene._duelTimerFrames
 *   scene._duelTimerInfinite
 *   scene._duelTimerExpired
 *   scene._duelTimerPaused
 *
 * This API is intentionally simple so a future Time Over module can use it
 * without replacing this timer plugin.
 */

(function() {
    'use strict';

    if (typeof Scene_ActorDuel === 'undefined') {
        console.warn('[ActorDuel Timer] Galv_ActorDuel_MV.js must load first.');
        return;
    }

    var pluginName = 'Galv_ActorDuel_MV_Stage3_Timer';
    var params = PluginManager.parameters(pluginName);

    var CFGT = {
        defaultTime: Math.max(0, Number(params['Default Time'] || 60)),
        showDuringIntro: String(params['Show During Intro'] || 'true') === 'true',
        x: Number(params['Timer X'] || 0),
        y: Number(params['Timer Y'] || 12),
        width: Math.max(40, Number(params['Timer Width'] || 140)),
        height: Math.max(20, Number(params['Timer Height'] || 70)),
        fontSize: Math.max(8, Number(params['Font Size'] || 52)),
        fontFace: String(params['Font Face'] || 'Arial'),
        textColor: String(params['Text Color'] || '#ffffff'),
        outlineColor: String(params['Outline Color'] || '#000000'),
        outlineWidth: Math.max(0, Number(params['Outline Width'] || 8)),
        alignment: String(params['Alignment'] || 'center'),
        leadingZero: String(params['Leading Zero'] || 'false') === 'true',
        infiniteText: String(params['Infinite Text'] || '∞'),
        expiredText: String(params['Expired Text'] || '00'),
        showLabel: String(params['Show Label'] || 'false') === 'true',
        labelText: String(params['Label Text'] || 'TIME'),
        labelFontSize: Math.max(8, Number(params['Label Font Size'] || 14)),
        labelOffsetY: Number(params['Label Offset Y'] || -8)
    };

    function duelSystem() {
        if (!$gameSystem) return null;

        if (!$gameSystem.actorDuel) {
            if ($gameSystem._defaultDuelData) {
                $gameSystem.actorDuel = $gameSystem._defaultDuelData();
            } else {
                $gameSystem.actorDuel = {};
            }
        }

        return $gameSystem.actorDuel;
    }

    function parseTime(value) {
        var text = String(value === undefined || value === null ? '' : value).toLowerCase();

        if (text === 'infinite' || text === 'infinity' || text === 'inf' || text === '∞') {
            return 0;
        }

        var number = Number(text);
        if (!isFinite(number)) return null;
        return Math.max(0, number);
    }

    function setStoredTimer(value) {
        var data = duelSystem();
        if (!data) return;
        data.timerSeconds = Math.max(0, Number(value || 0));
        data.timerConfigured = true;
    }

    function clearStoredTimer() {
        var data = duelSystem();
        if (!data) return;
        data.timerConfigured = false;
        delete data.timerSeconds;
    }

    function configuredTime() {
        var data = duelSystem();
        if (data && data.timerConfigured) {
            return Math.max(0, Number(data.timerSeconds || 0));
        }
        return CFGT.defaultTime;
    }

    // ---------------------------------------------------------------------
    // MV plugin commands
    // ---------------------------------------------------------------------
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (String(command).toLowerCase() !== 'actorduel') return;
        args = args || [];

        var sub = String(args[0] || '').toLowerCase();
        var value;

        if (sub === 'set_timer' || sub === 'timer') {
            value = parseTime(args[1]);
            if (value === null) {
                console.warn('[ActorDuel Timer] Invalid timer value: ' + args[1]);
                return;
            }
            setStoredTimer(value);
            return;
        }

        if (sub === 'reset_timer') {
            clearStoredTimer();
            return;
        }

        if (sub === 'pause_timer') {
            if (SceneManager._scene instanceof Scene_ActorDuel) {
                SceneManager._scene._duelTimerPaused = true;
            }
            return;
        }

        if (sub === 'resume_timer') {
            if (SceneManager._scene instanceof Scene_ActorDuel) {
                SceneManager._scene._duelTimerPaused = false;
            }
            return;
        }

        if (sub === 'add_timer') {
            if (!(SceneManager._scene instanceof Scene_ActorDuel)) return;
            var scene = SceneManager._scene;
            var amount = Number(args[1] || 0);
            if (!isFinite(amount) || scene._duelTimerInfinite) return;

            scene._duelTimerFrames = Math.max(
                0,
                scene._duelTimerFrames + Math.round(amount * 60)
            );
            scene._duelTimerSeconds = scene._duelTimerFrames / 60;
            scene._duelTimerExpired = scene._duelTimerFrames <= 0;
            return;
        }

        if (sub === 'timer_set') {
            value = parseTime(args[1]);
            if (value === null) {
                console.warn('[ActorDuel Timer] Invalid timer value: ' + args[1]);
                return;
            }
            setStoredTimer(value);

            if (SceneManager._scene instanceof Scene_ActorDuel) {
                SceneManager._scene._duelTimerInfinite = value <= 0;
                SceneManager._scene._duelTimerFrames = Math.round(value * 60);
                SceneManager._scene._duelTimerSeconds = value;
                SceneManager._scene._duelTimerExpired = false;
            }
            return;
        }

        if (sub === 'timer_status') {
            if (!(SceneManager._scene instanceof Scene_ActorDuel)) {
                console.log('[ActorDuel Timer] No active duel scene.');
                return;
            }

            var activeScene = SceneManager._scene;
            console.log('[ActorDuel Timer] ' + JSON.stringify({
                seconds: activeScene._duelTimerSeconds,
                frames: activeScene._duelTimerFrames,
                infinite: activeScene._duelTimerInfinite,
                expired: activeScene._duelTimerExpired,
                paused: activeScene._duelTimerPaused,
                phase: activeScene._phase
            }));
        }
    };

    // ---------------------------------------------------------------------
    // Scene timer state
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_initialize = Scene_ActorDuel.prototype.initialize;
    Scene_ActorDuel.prototype.initialize = function() {
        _Scene_ActorDuel_initialize.call(this);

        this._duelTimerSeconds = configuredTime();
        this._duelTimerFrames = Math.round(this._duelTimerSeconds * 60);
        this._duelTimerInfinite = this._duelTimerSeconds <= 0;
        this._duelTimerExpired = false;
        this._duelTimerPaused = false;
        this._duelTimerStarted = false;
        this._duelTimerLastDisplay = '';
    };

    var _Scene_ActorDuel_create = Scene_ActorDuel.prototype.create;
    Scene_ActorDuel.prototype.create = function() {
        _Scene_ActorDuel_create.call(this);
        if (this._finished) return;
        this._createActorDuelTimer();
    };

    Scene_ActorDuel.prototype._createActorDuelTimer = function() {
        this._duelTimerSprite = new Sprite(new Bitmap(CFGT.width, CFGT.height));
        this._duelTimerSprite.z = 1100;

        var x = CFGT.x === 0
            ? Math.floor((Graphics.width - CFGT.width) / 2)
            : CFGT.x;

        this._duelTimerSprite.x = x;
        this._duelTimerSprite.y = CFGT.y;

        this.addChild(this._duelTimerSprite);
        this._refreshActorDuelTimer(true);
    };

    Scene_ActorDuel.prototype._actorDuelTimerDisplay = function() {
        if (this._duelTimerInfinite) return CFGT.infiniteText;
        if (this._duelTimerExpired || this._duelTimerFrames <= 0) return CFGT.expiredText;

        var seconds = Math.ceil(this._duelTimerFrames / 60);
        var text = String(seconds);

        if (CFGT.leadingZero && seconds < 100) {
            text = seconds < 10 ? '0' + seconds : text;
        }

        return text;
    };

    Scene_ActorDuel.prototype._refreshActorDuelTimer = function(force) {
        if (!this._duelTimerSprite || !this._duelTimerSprite.bitmap) return;

        var text = this._actorDuelTimerDisplay();
        var signature = text + '|' + this._duelTimerPaused;
        if (!force && signature === this._duelTimerLastDisplay) return;
        this._duelTimerLastDisplay = signature;

        var bitmap = this._duelTimerSprite.bitmap;
        bitmap.clear();
        bitmap.fontFace = CFGT.fontFace;
        bitmap.fontSize = CFGT.fontSize;
        bitmap.fontBold = true;
        bitmap.textColor = CFGT.textColor;
        bitmap.outlineColor = CFGT.outlineColor;
        bitmap.outlineWidth = CFGT.outlineWidth;

        var labelOffset = CFGT.showLabel ? CFGT.labelFontSize + 2 : 0;
        bitmap.drawText(
            text,
            0,
            labelOffset,
            CFGT.width,
            CFGT.height - labelOffset,
            CFGT.alignment
        );

        if (CFGT.showLabel) {
            bitmap.fontFace = CFGT.fontFace;
            bitmap.fontSize = CFGT.labelFontSize;
            bitmap.fontBold = true;
            bitmap.textColor = CFGT.textColor;
            bitmap.outlineColor = CFGT.outlineColor;
            bitmap.outlineWidth = Math.max(2, Math.floor(CFGT.outlineWidth * 0.5));
            bitmap.drawText(
                CFGT.labelText,
                0,
                CFGT.labelOffsetY,
                CFGT.width,
                CFGT.labelFontSize + 10,
                CFGT.alignment
            );
        }
    };

    // ---------------------------------------------------------------------
    // Countdown: only phase 1 counts. This intentionally leaves time-over
    // result handling to the next module.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_update = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _Scene_ActorDuel_update.call(this);

        if (this._finished) return;
        this._updateActorDuelTimer();
    };

    Scene_ActorDuel.prototype._updateActorDuelTimer = function() {
        if (this._duelTimerInfinite) {
            this._refreshActorDuelTimer(false);
            return;
        }

        // The timer starts exactly when the core changes from READY/FIGHT
        // intro (phase 0) into the actual combat phase (phase 1).
        if (this._phase === 1 && !this._duelTimerStarted) {
            this._duelTimerStarted = true;
        }

        // Stage 3 ending freezes the combat and therefore freezes the timer.
        if (this._phase !== 1 || !this._duelTimerStarted || this._duelTimerPaused) {
            if (!CFGT.showDuringIntro && this._phase === 0 && this._duelTimerSprite) {
                this._duelTimerSprite.opacity = 0;
            } else if (this._duelTimerSprite) {
                this._duelTimerSprite.opacity = 255;
            }
            this._refreshActorDuelTimer(false);
            return;
        }

        if (this._stage3Ending || this._stage3Freeze) {
            this._refreshActorDuelTimer(false);
            return;
        }

        if (this._duelTimerFrames > 0) {
            this._duelTimerFrames--;
            this._duelTimerSeconds = this._duelTimerFrames / 60;
        }

        if (this._duelTimerFrames <= 0) {
            this._duelTimerFrames = 0;
            this._duelTimerSeconds = 0;
            this._duelTimerExpired = true;
        }

        if (this._duelTimerSprite) this._duelTimerSprite.opacity = 255;
        this._refreshActorDuelTimer(false);
    };

})();
