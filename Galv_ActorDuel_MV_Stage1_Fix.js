/*:
 * @plugindesc Galv Actor Duel MV - Stage 1 visual/gameplay fixes (HUD + jump)
 * @author OpenAI
 * @help
 * Load this plugin AFTER Galv_ActorDuel_MV.
 *
 * Fixes without replacing the original Stage 1 plugin:
 * - Exposes jump strength as a plugin parameter.
 * - Recreates Galv's original HUD architecture using kombat_bar.png.
 * - Adds actor faces to the HUD.
 * - Draws HP and stamina using the original VX Ace layout.
 *
 * Required image:
 *   img/system/kombat_bar.png
 *
 * This plugin intentionally patches the existing plugin instead of replacing it.
 * Once Stage 1 is stable, the patch can be merged into the main script.
 *
 * @param Jump Strength
 * @type number
 * @min 1
 * @default 22
 *
 * @param HUD Image
 * @type file
 * @dir img/system/
 * @default kombat_bar
 */
(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage1_Fix';
    var params = PluginManager.parameters(pluginName);
    var JUMP_STRENGTH = Number(params['Jump Strength'] || 22);
    var HUD_IMAGE = String(params['HUD Image'] || 'kombat_bar');

    if (Game_Actor.prototype.duelJump) {
        Game_Actor.prototype.duelJump = function() {
            if (this._duelDead) return;
            if (!this._duelJumping && this._duelY >= 310) {
                this._duelJumping = true;
                this._duelVY = -JUMP_STRENGTH;
                this._duelPose = 8;
            }
        };
    }

    function Sprite_ActorDuelHudFace(actor, mirror) {
        Sprite.call(this);
        this._actor = actor;
        this.bitmap = ImageManager.loadFace(actor.faceName());
        var index = actor.faceIndex();
        var rect = new Rectangle((index % 4) * 144, Math.floor(index / 4) * 144, 144, 144);
        this.setFrame(rect.x, rect.y, rect.width, rect.height);
        this.scale.x = (96 / 144) * (mirror ? -1 : 1);
        this.scale.y = 96 / 144;
        this.x = mirror ? Graphics.boxWidth : 0;
        this.y = 0;
        this.anchor.x = mirror ? 1 : 0;
        this.anchor.y = 0;
    }

    Sprite_ActorDuelHudFace.prototype = Object.create(Sprite.prototype);
    Sprite_ActorDuelHudFace.prototype.constructor = Sprite_ActorDuelHudFace;

    function Window_ActorDuelHUD() {
        this.initialize.apply(this, arguments);
    }

    Window_ActorDuelHUD.prototype = Object.create(Window_Base.prototype);
    Window_ActorDuelHUD.prototype.constructor = Window_ActorDuelHUD;

    Window_ActorDuelHUD.prototype.initialize = function(actor1, actor2) {
        Window_Base.prototype.initialize.call(this, 0, 0, Graphics.boxWidth, 140);
        this._actor1 = actor1;
        this._actor2 = actor2;
        this.opacity = 0;
        this.backOpacity = 0;
        this.refresh();
    };

    Window_ActorDuelHUD.prototype.update = function() {
        Window_Base.prototype.update.call(this);
        this.refresh();
    };

    Window_ActorDuelHUD.prototype.refresh = function() {
        this.contents.clear();
        if (!this._actor1 || !this._actor2) return;
        this._drawPlayer1(this._actor1);
        this._drawPlayer2(this._actor2);
    };

    Window_ActorDuelHUD.prototype._drawPlayer1 = function(actor) {
        var x = 100;
        this._drawHp(actor, x, 15, false);
        this._drawStamina(actor, x, 40, false);
        this.drawText(actor.name(), x, 0, 100, 'left');
        this.drawActorIcons(actor, x, 65, 240);
    };

    Window_ActorDuelHUD.prototype._drawPlayer2 = function(actor) {
        var x = this.contents.width - 224;
        this._drawHp(actor, x, 15, true);
        this._drawStamina(actor, x, 40, true);
        this.drawText(actor.name(), x - 24, 0, 100, 'right');
        this.drawActorIcons(actor, x, 65, 240);
    };

    Window_ActorDuelHUD.prototype._drawHp = function(actor, x, y, reverse) {
        var rate = actor.mhp > 0 ? actor.hp / actor.mhp : 0;
        this._drawDuelGauge(x, y, 124, rate, this.hpGaugeColor1(), this.hpGaugeColor2(), reverse, 12);
    };

    Window_ActorDuelHUD.prototype._drawStamina = function(actor, x, y, reverse) {
        var rate = actor.duelStaminaRate ? actor.duelStaminaRate() : 0;
        this._drawDuelGauge(x, y, 124, rate, this.mpGaugeColor1(), this.mpGaugeColor2(), reverse, 6);
    };

    Window_ActorDuelHUD.prototype._drawDuelGauge = function(x, y, width, rate, color1, color2, reverse, height) {
        rate = Math.max(0, Math.min(1, rate));
        var fillW = Math.floor(width * rate);
        var gaugeY = y + this.lineHeight() - 8;
        this.contents.fillRect(x, gaugeY, width, height, this.gaugeBackColor());
        if (fillW <= 0) return;
        if (reverse) {
            this.contents.gradientFillRect(x + width - fillW, gaugeY, fillW, height, color1, color2);
        } else {
            this.contents.gradientFillRect(x, gaugeY, fillW, height, color1, color2);
        }
    };

    if (typeof Scene_ActorDuel !== 'undefined') {
        Scene_ActorDuel.prototype._createStatusWindows = function() {
            this._duelHudBar1 = new Sprite();
            this._duelHudBar1.bitmap = ImageManager.loadSystem(HUD_IMAGE);
            this._duelHudBar1.x = 0;
            this._duelHudBar1.y = 0;
            this.addChild(this._duelHudBar1);

            this._duelHudBar2 = new Sprite();
            this._duelHudBar2.bitmap = ImageManager.loadSystem(HUD_IMAGE);
            this._duelHudBar2.x = Graphics.boxWidth;
            this._duelHudBar2.y = 0;
            this._duelHudBar2.anchor.x = 1;
            this._duelHudBar2.scale.x = -1;
            this.addChild(this._duelHudBar2);

            this._duelHudFace1 = new Sprite_ActorDuelHudFace(this._actor1, false);
            this._duelHudFace2 = new Sprite_ActorDuelHudFace(this._actor2, true);
            this.addChild(this._duelHudFace1);
            this.addChild(this._duelHudFace2);

            this._statusHud = new Window_ActorDuelHUD(this._actor1, this._actor2);
            this.addWindow(this._statusHud);
        };
    }
})();
