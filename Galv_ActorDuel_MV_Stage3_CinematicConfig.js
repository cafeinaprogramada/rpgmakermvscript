/*:
 * @plugindesc Galv Actor Duel MV - Stage 3 Cinematic Camera Configuration
 * @author OpenAI / Lucas
 *
 * @param Cinematic Zoom Frames
 * @type number
 * @min 1
 * @default 75
 * @desc Duration of the final camera approach in frames. 60 frames = about 1 second at 60 FPS.
 *
 * @param Cinematic Zoom Scale
 * @type number
 * @decimals 2
 * @min 1
 * @default 1.25
 * @desc Final camera scale. 1.25 means a 25% zoom-in.
 *
 * @param Camera Easing
 * @type select
 * @option Smooth
 * @value smooth
 * @option Linear
 * @value linear
 * @default smooth
 * @desc Controls how the final camera approaches the fighters.
 *
 * @help
 * Load AFTER:
 *   Galv_ActorDuel_MV_Stage3_MatchFlow.js
 *   Galv_ActorDuel_MV_Stage3_Fix.js
 *
 * This module does not replace the Stage 3 Match Flow.
 * It only gives the cinematic camera independent parameters so the motion
 * can be tuned without editing the Match Flow core.
 *
 * Recommended starting values:
 *   Zoom Frames = 75
 *   Zoom Scale  = 1.25
 *   Easing      = Smooth
 *
 * Notes:
 *   - 60 frames is approximately 1 second at 60 FPS.
 *   - Higher Zoom Frames = slower, more dramatic approach.
 *   - Higher Zoom Scale = closer final framing.
 */
(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage3_CinematicConfig';
    var params = PluginManager.parameters(pluginName);

    var CINEMA = {
        zoomFrames: Math.max(1, Number(params['Cinematic Zoom Frames'] || 75)),
        zoomScale: Math.max(1, Number(params['Cinematic Zoom Scale'] || 1.25)),
        easing: String(params['Camera Easing'] || 'smooth').toLowerCase()
    };

    if (typeof Scene_ActorDuel === 'undefined') return;

    // Preserve the Stage 3 ending sequence, but replace only its camera
    // timing/scale after the original setup has happened.
    var _stage3BeginFinish = Scene_ActorDuel.prototype._stage3BeginFinish;
    Scene_ActorDuel.prototype._stage3BeginFinish = function(winner) {
        _stage3BeginFinish.call(this, winner);

        if (!this._stage3Ending) return;

        this._stage3ZoomFrames = CINEMA.zoomFrames;
        this._stage3Zoom = 1;
        this._stage3CinematicZoomFrames = CINEMA.zoomFrames;
        this._stage3CinematicZoomScale = CINEMA.zoomScale;
    };

    // Stage 3 Match Flow calls this every frame during the ending sequence.
    // We replace only the interpolation so the rest of the cinematic remains
    // untouched: hit-stop, flash, shake, KO text, winner text, ME and fade
    // continue to be controlled by Stage3_MatchFlow.
    Scene_ActorDuel.prototype._stage3UpdateZoom = function() {
        if (this._stage3ZoomFrames <= 0) return;

        var total = Math.max(1, Number(this._stage3CinematicZoomFrames || CINEMA.zoomFrames));
        var remaining = this._stage3ZoomFrames;
        var elapsed = total - remaining;
        var t = Math.max(0, Math.min(1, elapsed / total));

        if (CINEMA.easing === 'smooth') {
            // Smoothstep: slow start, stronger middle movement, soft finish.
            t = t * t * (3 - 2 * t);
        }

        this._stage3Zoom = 1 +
            (Number(this._stage3CinematicZoomScale || CINEMA.zoomScale) - 1) * t;

        this._stage3ZoomFrames--;
    };
})();
