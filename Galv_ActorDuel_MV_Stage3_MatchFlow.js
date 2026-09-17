/*:
 * @plugindesc Galv Actor Duel MV - Stage 3 Match Flow / Result / Cinematic KO
 * @author OpenAI / Lucas
 *
 * @help
 * Load AFTER Galv_ActorDuel_MV.js and after the other Actor Duel modules.
 *
 * Stage 3 makes the duel safe to use from RPG Maker events.
 *
 * Plugin command:
 *   ActorDuel start RESULT_VARIABLE
 *
 * RESULT_VARIABLE is the RPG Maker variable that receives the result of
 * THIS match. This allows every fight in the RPG to use a different variable.
 *
 * Result values:
 *   0 = no combat result / not finished
 *   1 = P1 / controlled actor won
 *   2 = P2 / opponent won
 *   3 = draw
 *
 * Examples:
 *   ActorDuel set_fighters 1 2
 *   ActorDuel set_fmode 0
 *   ActorDuel start 25
 *
 * After the duel returns to the map:
 *   Variable 25 == 1 -> player won
 *   Variable 25 == 2 -> player lost
 *   Variable 25 == 3 -> draw
 *
 * The player's HP at the end of the duel remains on the Game_Actor.
 * The actor's HP before entering the duel is also preserved as the starting
 * HP instead of being silently restored to maximum.
 *
 * Quit is intentionally separate from combat result. The existing Quit
 * Switch is still used by the core plugin.
 *
 * Ending presentation:
 *   - hit-stop
 *   - strong impact flash
 *   - screen shake
 *   - cinematic zoom/focus
 *   - KO / winner text
 *   - victory pose
 *   - Victory ME
 *   - fade to black
 *   - SceneManager.pop() back to the calling map/event
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage3_MatchFlow';
    var params = PluginManager.parameters(pluginName);

    var CFG3 = {
        defaultResultVariable: Number(params['Default Result Variable'] || 0),
        hitStopFrames: Number(params['Hit Stop Frames'] || 10),
        impactFlashFrames: Number(params['Impact Flash Frames'] || 5),
        impactShakeFrames: Number(params['Impact Shake Frames'] || 18),
        impactShakePower: Number(params['Impact Shake Power'] || 8),
        zoomFrames: Number(params['Cinematic Zoom Frames'] || 28),
        zoomScale: Number(params['Cinematic Zoom Scale'] || 1.12),
        koHoldFrames: Number(params['KO Hold Frames'] || 55),
        winnerHoldFrames: Number(params['Winner Hold Frames'] || 95),
        fadeFrames: Number(params['Fade Frames'] || 24),
        koText: String(params['KO Text'] || 'K.O.'),
        winnerText: String(params['Winner Text'] || ' WINS!')
    };

    // ---------------------------------------------------------------------
    // Per-call result variable
    // ---------------------------------------------------------------------
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (String(command).toLowerCase() !== 'actorduel') return;
        args = args || [];

        var sub = String(args[0] || '').toLowerCase();
        if (sub !== 'start') return;

        var resultVariable = Number(args[1] || 0);
        duelSystem().resultVariable = resultVariable > 0
            ? resultVariable
            : CFG3.defaultResultVariable;
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

    // Extend the duel data without changing the core save structure in a
    // destructive way. The field is simply carried in Game_System.
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        if (this.actorDuel) this.actorDuel.resultVariable = 0;
    };

    // ---------------------------------------------------------------------
    // Scene helpers
    // ---------------------------------------------------------------------
    function resultVariableFor(scene) {
        var data = duelSystem();
        if (scene && scene._duelResultVariable > 0) {
            return scene._duelResultVariable;
        }
        if (data && Number(data.resultVariable) > 0) {
            return Number(data.resultVariable);
        }
        return 0;
    }

    function setResult(scene, value) {
        var variableId = resultVariableFor(scene);
        if (variableId > 0) {
            $gameVariables.setValue(variableId, Number(value));
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    // ---------------------------------------------------------------------
    // Preserve starting HP and make final HP authoritative.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_createActors = Scene_ActorDuel.prototype._createActors;
    Scene_ActorDuel.prototype._createActors = function() {
        _Scene_ActorDuel_createActors.call(this);

        if (this._finished || !this._actor1 || !this._actor2) return;

        this._duelStartHp1 = this._actor1.hp;
        this._duelStartHp2 = this._actor2.hp;
        this._duelResultVariable = Number(duelSystem().resultVariable || 0);

        // The core reset prepares the duel, including full HP. For RPG
        // integration we restore the actor's real HP as the starting point.
        this._actor1.setHp(clamp(this._duelStartHp1, 0, this._actor1.mhp));
        this._actor2.setHp(clamp(this._duelStartHp2, 0, this._actor2.mhp));

        // A battle always starts from a live combat state unless the event
        // deliberately supplied a dead actor. Do not leave stale duel death.
        this._actor1._duelDead = false;
        this._actor2._duelDead = false;
    };

    // ---------------------------------------------------------------------
    // Cinematic ending layer
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_create = Scene_ActorDuel.prototype.create;
    Scene_ActorDuel.prototype.create = function() {
        _Scene_ActorDuel_create.call(this);
        if (this._finished) return;

        this._stage3CreateCinematicLayer();
    };

    Scene_ActorDuel.prototype._stage3CreateCinematicLayer = function() {
        this._stage3Fade = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        this._stage3Fade.bitmap.fillAll('#000000');
        this._stage3Fade.opacity = 0;
        this._stage3Fade.z = 2000;
        this.addChild(this._stage3Fade);

        this._stage3Flash = new Sprite(new Bitmap(Graphics.width, Graphics.height));
        this._stage3Flash.bitmap.fillAll('#ffffff');
        this._stage3Flash.opacity = 0;
        this._stage3Flash.z = 1900;
        this.addChild(this._stage3Flash);

        this._stage3Text = new Sprite(new Bitmap(Graphics.width, 180));
        this._stage3Text.z = 1950;
        this._stage3Text.y = Math.floor((Graphics.height - 180) / 2);
        this._stage3Text.opacity = 0;
        this.addChild(this._stage3Text);

        this._stage3BaseScale1 = this._sprite1 ? this._sprite1.scale.x : 2;
        this._stage3BaseScale2 = this._sprite2 ? this._sprite2.scale.x : -2;
        this._stage3BaseScaleY1 = this._sprite1 ? this._sprite1.scale.y : 2;
        this._stage3BaseScaleY2 = this._sprite2 ? this._sprite2.scale.y : 2;

        this._stage3ShakeX = 0;
        this._stage3ShakeY = 0;
        this._stage3Zoom = 1;
    };

    Scene_ActorDuel.prototype._stage3DrawText = function(text, size, opacity) {
        if (!this._stage3Text) return;
        this._stage3Text.bitmap.clear();
        this._stage3Text.bitmap.fontFace = 'Arial';
        this._stage3Text.bitmap.fontSize = size;
        this._stage3Text.bitmap.fontBold = true;
        this._stage3Text.bitmap.textColor = '#ffffff';
        this._stage3Text.bitmap.outlineColor = '#000000';
        this._stage3Text.bitmap.outlineWidth = 10;
        this._stage3Text.bitmap.drawText(
            text, 0, 20, Graphics.width, 120, 'center'
        );
        this._stage3Text.opacity = opacity === undefined ? 255 : opacity;
    };

    Scene_ActorDuel.prototype._stage3ClearText = function() {
        if (!this._stage3Text) return;
        this._stage3Text.bitmap.clear();
        this._stage3Text.opacity = 0;
    };

    Scene_ActorDuel.prototype._stage3ApplyCamera = function() {
        if (!this._sprite1 || !this._sprite2) return;

        var cx = (this._actor1._duelX + this._actor2._duelX) * 0.5;
        var centerX = Graphics.width * 0.5;
        var shift = (centerX - cx) * (this._stage3Zoom - 1);

        this._sprite1.x = Math.round(this._actor1._duelX * this._stage3Zoom + shift + this._stage3ShakeX);
        this._sprite2.x = Math.round(this._actor2._duelX * this._stage3Zoom + shift + this._stage3ShakeX);

        this._sprite1.y = Math.round(this._actor1._duelY * this._stage3Zoom + (Graphics.height * (1 - this._stage3Zoom)) + this._stage3ShakeY);
        this._sprite2.y = Math.round(this._actor2._duelY * this._stage3Zoom + (Graphics.height * (1 - this._stage3Zoom)) + this._stage3ShakeY);

        var sx1 = Math.abs(this._stage3BaseScale1) * this._stage3Zoom;
        var sx2 = Math.abs(this._stage3BaseScale2) * this._stage3Zoom;
        this._sprite1.scale.x = (this._actor1._duelFacing >= 0 ? 1 : -1) * sx1;
        this._sprite2.scale.x = (this._actor2._duelFacing >= 0 ? 1 : -1) * sx2;
        this._sprite1.scale.y = this._stage3BaseScaleY1 * this._stage3Zoom;
        this._sprite2.scale.y = this._stage3BaseScaleY2 * this._stage3Zoom;

        if (this._shadow1) {
            this._shadow1.x = Math.round(this._actor1._duelX * this._stage3Zoom + shift + this._stage3ShakeX);
            this._shadow2.x = Math.round(this._actor2._duelX * this._stage3Zoom + shift + this._stage3ShakeX);
            this._shadow1.y = Math.round(CFG.groundY * this._stage3Zoom + (Graphics.height * (1 - this._stage3Zoom)) + this._stage3ShakeY);
            this._shadow2.y = this._shadow1.y;
        }
    };

    Scene_ActorDuel.prototype._stage3UpdateShake = function() {
        if (this._stage3ShakeFrames > 0) {
            this._stage3ShakeFrames--;
            var power = this._stage3ShakePower * (this._stage3ShakeFrames / Math.max(1, CFG3.impactShakeFrames));
            this._stage3ShakeX = (Math.random() * 2 - 1) * power;
            this._stage3ShakeY = (Math.random() * 2 - 1) * power * 0.45;
        } else {
            this._stage3ShakeX = 0;
            this._stage3ShakeY = 0;
        }
    };

    Scene_ActorDuel.prototype._stage3UpdateZoom = function() {
        if (this._stage3ZoomFrames <= 0) return;
        var elapsed = CFG3.zoomFrames - this._stage3ZoomFrames;
        var rate = clamp(elapsed / Math.max(1, CFG3.zoomFrames), 0, 1);
        this._stage3Zoom = 1 + (CFG3.zoomScale - 1) * rate;
        this._stage3ZoomFrames--;
    };

    // ---------------------------------------------------------------------
    // Replace the core immediate result with a controlled finishing state.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_checkVictory = Scene_ActorDuel.prototype._checkVictory;
    Scene_ActorDuel.prototype._checkVictory = function() {
        if (this._stage3Ending) return;
        if (!this._actor1 || !this._actor2) return;

        if (this._actor1._duelDead) {
            this._stage3BeginFinish(2);
            return;
        }
        if (this._actor2._duelDead) {
            this._stage3BeginFinish(1);
            return;
        }

        // Preserve the core hook for unusual future conditions if neither
        // fighter is dead. Normally it does nothing in this state.
        if (_Scene_ActorDuel_checkVictory && false) {
            _Scene_ActorDuel_checkVictory.call(this);
        }
    };

    Scene_ActorDuel.prototype._stage3BeginFinish = function(winner) {
        if (this._stage3Ending || this._finished) return;

        this._stage3Ending = true;
        this._stage3EndPhase = 1;
        this._stage3EndCount = 0;
        this._stage3Winner = Number(winner || 0);
        this._winner = this._stage3Winner;

        // Result is written as soon as combat has definitively ended, so the
        // event receives a deterministic value when the scene returns.
        setResult(this, this._stage3Winner);

        // Freeze combat immediately. The fighters remain visible for the
        // cinematic instead of continuing to receive input/AI decisions.
        this._stage3Freeze = true;
        this._stage3ShakeFrames = CFG3.impactShakeFrames;
        this._stage3ShakePower = CFG3.impactShakePower;
        this._stage3ZoomFrames = CFG3.zoomFrames;
        this._stage3Zoom = 1;

        this._stage3ClearText();
        this._stage3Flash.opacity = 255;

        if (this._stage3Winner === 1) {
            this._actor1._duelPose = 10;
            this._actor2._duelPose = 12;
        } else if (this._stage3Winner === 2) {
            this._actor2._duelPose = 10;
            this._actor1._duelPose = 12;
        }
    };

    Scene_ActorDuel.prototype._stage3UpdateFinish = function() {
        this._stage3EndCount++;

        this._stage3UpdateShake();
        this._stage3UpdateZoom();
        this._stage3ApplyCamera();

        if (this._stage3Flash.opacity > 0) {
            this._stage3Flash.opacity = Math.max(0, this._stage3Flash.opacity - 255 / CFG3.impactFlashFrames);
        }

        // Phase 1: very short impact freeze.
        if (this._stage3EndPhase === 1) {
            if (this._stage3EndCount >= CFG3.hitStopFrames) {
                this._stage3EndPhase = 2;
                this._stage3EndCount = 0;
                this._stage3DrawText(CFG3.koText, 76, 255);
            }
            return;
        }

        // Phase 2: hold the KO moment.
        if (this._stage3EndPhase === 2) {
            if (this._stage3EndCount >= CFG3.koHoldFrames) {
                this._stage3EndPhase = 3;
                this._stage3EndCount = 0;
                var winnerName = this._stage3Winner === 1
                    ? this._actor1.name()
                    : this._actor2.name();
                this._stage3DrawText(winnerName + CFG3.winnerText, 44, 255);

                AudioManager.playMe({
                    name: duelSystem().victoryMe || 'Victory1',
                    volume: 90,
                    pitch: 100,
                    pan: 0
                });
            }
            return;
        }

        // Phase 3: winner presentation.
        if (this._stage3EndPhase === 3) {
            if (this._stage3EndCount >= CFG3.winnerHoldFrames) {
                this._stage3EndPhase = 4;
                this._stage3EndCount = 0;
                this._stage3ClearText();
            }
            return;
        }

        // Phase 4: fade to black and leave the scene.
        if (this._stage3EndPhase === 4) {
            this._stage3Fade.opacity = Math.min(
                255,
                Math.floor(255 * this._stage3EndCount / Math.max(1, CFG3.fadeFrames))
            );

            if (this._stage3EndCount >= CFG3.fadeFrames) {
                this._stage3EndPhase = 5;
                this._stage3FinalizeAndExit();
            }
        }
    };

    Scene_ActorDuel.prototype._stage3FinalizeAndExit = function() {
        if (this._stage3Exited) return;
        this._stage3Exited = true;

        // The Game_Actor has already been receiving real HP damage during the
        // fight. Explicitly clamp the final values so no cinematic code can
        // accidentally leave an invalid HP number behind.
        if (this._actor1) {
            this._actor1.setHp(clamp(this._actor1.hp, 0, this._actor1.mhp));
        }
        if (this._actor2) {
            this._actor2.setHp(clamp(this._actor2.hp, 0, this._actor2.mhp));
        }

        // Result is written again immediately before returning, making this
        // the final authoritative hand-off to the RPG Maker event.
        setResult(this, this._stage3Winner);

        this._endScene();
    };

    // ---------------------------------------------------------------------
    // Freeze the normal fight update while the finishing cinematic runs.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_updateFight = Scene_ActorDuel.prototype._updateFight;
    Scene_ActorDuel.prototype._updateFight = function() {
        if (this._stage3Ending) {
            this._stage3UpdateFinish();
            return;
        }
        _Scene_ActorDuel_updateFight.call(this);
    };

    // ---------------------------------------------------------------------
    // Safe cleanup. Do not reset HP here: final HP belongs to the RPG actor.
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_terminate = Scene_ActorDuel.prototype.terminate;
    Scene_ActorDuel.prototype.terminate = function() {
        _Scene_ActorDuel_terminate.call(this);

        if (this._stage3Fade) this._stage3Fade.opacity = 0;
        if (this._stage3Flash) this._stage3Flash.opacity = 0;

        if (this._sprite1) {
            this._sprite1.scale.x = this._stage3BaseScale1 || this._sprite1.scale.x;
            this._sprite1.scale.y = this._stage3BaseScaleY1 || this._sprite1.scale.y;
        }
        if (this._sprite2) {
            this._sprite2.scale.x = this._stage3BaseScale2 || this._sprite2.scale.x;
            this._sprite2.scale.y = this._stage3BaseScaleY2 || this._sprite2.scale.y;
        }
    };

    // ---------------------------------------------------------------------
    // Script-call support: this.startActorDuel(resultVariable)
    // ---------------------------------------------------------------------
    var _Game_Interpreter_startActorDuel = Game_Interpreter.prototype.startActorDuel;
    Game_Interpreter.prototype.startActorDuel = function(resultVariable) {
        var id = Number(resultVariable || 0);
        duelSystem().resultVariable = id > 0 ? id : CFG3.defaultResultVariable;
        if (_Game_Interpreter_startActorDuel) {
            _Game_Interpreter_startActorDuel.call(this);
        } else {
            SceneManager.push(window.Scene_ActorDuel);
        }
    };

    // ---------------------------------------------------------------------
    // Global API
    // ---------------------------------------------------------------------
    if (window.GalvActorDuelMV) {
        var oldStart = window.GalvActorDuelMV.start;
        window.GalvActorDuelMV.start = function(id1, id2, mode, resultVariable) {
            if (id1 !== undefined && id2 !== undefined) {
                duelSystem().fighters = [Number(id1), Number(id2)];
            }
            if (mode !== undefined) {
                duelSystem().mode = Number(mode) === 1 ? 1 : 0;
            }
            duelSystem().resultVariable = Number(resultVariable || 0);
            if (oldStart) {
                oldStart.call(window.GalvActorDuelMV, undefined, undefined, undefined);
            } else {
                SceneManager.push(window.Scene_ActorDuel);
            }
        };
    }

})();
