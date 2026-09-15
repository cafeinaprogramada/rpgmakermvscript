/*:
 * @plugindesc Galv Actor Duel MV - Stage 1 visual/gameplay fixes (HUD + jump)
 * @author OpenAI
 * @help
 * Load this plugin AFTER Galv_ActorDuel_MV.
 *
 * Stage 1 fixes:
 * - Exposes jump strength as a plugin parameter.
 * - Recreates the original two-sided kombat_bar HUD.
 * - Draws both HP and stamina directly on a Bitmap, avoiding MV WindowLayer
 *   ordering/opacity issues.
 * - Adds both actor faces and names.
 * - Values update every frame during the duel.
 *
 * Required image:
 *   img/system/kombat_bar.png
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

    // -------------------------------------------------------------
    // Jump
    // -------------------------------------------------------------
    if (Game_Actor.prototype.duelJump) {
        Game_Actor.prototype.duelJump = function() {
            if (this._duelDead) return;
            var ground = 310;
            if (typeof CFG !== 'undefined' && CFG.groundY) ground = CFG.groundY;
            if (!this._duelJumping && this._duelY >= ground) {
                this._duelJumping = true;
                this._duelVY = -JUMP_STRENGTH;
                this._duelPose = 8;
            }
        };
    }

    // -------------------------------------------------------------
    // Face sprite
    // -------------------------------------------------------------
    function Sprite_ActorDuelHudFace(actor, mirror) {
        Sprite.call(this);
        this._actor = actor;
        this._mirror = mirror;
        this.bitmap = ImageManager.loadFace(actor.faceName());
        var index = actor.faceIndex();
        var rect = new Rectangle((index % 4) * 144, Math.floor(index / 4) * 144, 144, 144);
        this.setFrame(rect.x, rect.y, rect.width, rect.height);
        this.scale.x = (96 / 144) * (mirror ? -1 : 1);
        this.scale.y = 96 / 144;
        this.x = mirror ? Graphics.boxWidth - 4 : 4;
        this.y = 0;
        this.anchor.x = mirror ? 1 : 0;
        this.anchor.y = 0;
    }

    Sprite_ActorDuelHudFace.prototype = Object.create(Sprite.prototype);
    Sprite_ActorDuelHudFace.prototype.constructor = Sprite_ActorDuelHudFace;

    // -------------------------------------------------------------
    // Direct bitmap HUD
    // -------------------------------------------------------------
    function Sprite_ActorDuelHUD() {
        Sprite.call(this);
        this._actor1 = null;
        this._actor2 = null;
        this._bar1 = null;
        this._bar2 = null;
        this.bitmap = new Bitmap(Graphics.boxWidth, 140);
        this.z = 10;
    }

    Sprite_ActorDuelHUD.prototype = Object.create(Sprite.prototype);
    Sprite_ActorDuelHUD.prototype.constructor = Sprite_ActorDuelHUD;

    Sprite_ActorDuelHUD.prototype.setup = function(actor1, actor2) {
        this._actor1 = actor1;
        this._actor2 = actor2;
        this._refreshBars();
        this.refresh();
    };

    Sprite_ActorDuelHUD.prototype._refreshBars = function() {
        this._bar1 = new Sprite();
        this._bar1.bitmap = ImageManager.loadSystem(HUD_IMAGE);
        this._bar1.x = 0;
        this._bar1.y = 0;

        this._bar2 = new Sprite();
        this._bar2.bitmap = ImageManager.loadSystem(HUD_IMAGE);
        this._bar2.x = Graphics.boxWidth;
        this._bar2.y = 0;
        this._bar2.anchor.x = 1;
        this._bar2.scale.x = -1;

        this.addChild(this._bar1);
        this.addChild(this._bar2);
    };

    Sprite_ActorDuelHUD.prototype.update = function() {
        Sprite.prototype.update.call(this);
        this.refresh();
    };

    Sprite_ActorDuelHUD.prototype.refresh = function() {
        if (!this.bitmap || !this._actor1 || !this._actor2) return;

        this.bitmap.clear();

        this._drawPlayer1(this._actor1);
        this._drawPlayer2(this._actor2);
    };

    Sprite_ActorDuelHUD.prototype._drawPlayer1 = function(actor) {
        var x = 100;
        this._drawName(actor.name(), x, 4, 150, false);
        this._drawHp(actor, x, 22, false);
        this._drawStamina(actor, x, 48, false);
    };

    Sprite_ActorDuelHUD.prototype._drawPlayer2 = function(actor) {
        var x = Graphics.boxWidth - 224;
        this._drawName(actor.name(), x - 24, 4, 150, true);
        this._drawHp(actor, x, 22, true);
        this._drawStamina(actor, x, 48, true);
    };

    Sprite_ActorDuelHUD.prototype._drawName = function(name, x, y, width, reverse) {
        this.bitmap.fontSize = 22;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.outlineColor = '#000000';
        this.bitmap.outlineWidth = 4;
        this.bitmap.drawText(String(name), x, y, width, 26, reverse ? 'right' : 'left');
    };

    Sprite_ActorDuelHUD.prototype._drawHp = function(actor, x, y, reverse) {
        var rate = actor.mhp > 0 ? actor.hp / actor.mhp : 0;
        this._drawGauge(x, y, 124, 12, rate, '#401010', '#ff4040', reverse);

        this.bitmap.fontSize = 16;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.outlineColor = '#000000';
        this.bitmap.outlineWidth = 3;
        this.bitmap.drawText(String(Math.max(0, actor.hp)) + ' / ' + String(actor.mhp), x, y - 2, 124, 20, reverse ? 'right' : 'left');
    };

    Sprite_ActorDuelHUD.prototype._drawStamina = function(actor, x, y, reverse) {
        var rate = actor.duelStaminaRate ? actor.duelStaminaRate() : 0;
        this._drawGauge(x, y, 124, 7, rate, '#101020', '#55aaff', reverse);

        var stamina = actor._duelStamina != null ? Math.floor(actor._duelStamina) : 0;
        var max = 500;
        if (typeof CFG !== 'undefined' && CFG.maxStamina) max = CFG.maxStamina;

        this.bitmap.fontSize = 13;
        this.bitmap.textColor = '#ffffff';
        this.bitmap.outlineColor = '#000000';
        this.bitmap.outlineWidth = 2;
        this.bitmap.drawText('ST ' + stamina + ' / ' + max, x, y + 1, 124, 18, reverse ? 'right' : 'left');
    };

    Sprite_ActorDuelHUD.prototype._drawGauge = function(x, y, width, height, rate, back, fill, reverse) {
        rate = Math.max(0, Math.min(1, rate));
        this.bitmap.fillRect(x, y, width, height, back);

        var fillWidth = Math.floor(width * rate);
        if (fillWidth <= 0) return;

        if (reverse) {
            this.bitmap.fillRect(x + width - fillWidth, y, fillWidth, height, fill);
        } else {
            this.bitmap.fillRect(x, y, fillWidth, height, fill);
        }
    };

    // -------------------------------------------------------------
    // Scene integration
    // -------------------------------------------------------------
    if (typeof Scene_ActorDuel !== 'undefined') {
        Scene_ActorDuel.prototype._createStatusWindows = function() {
            this._duelHud = new Sprite_ActorDuelHUD();
            this._duelHud.setup(this._actor1, this._actor2);
            this._duelHud.x = 0;
            this._duelHud.y = 0;
            this.addChild(this._duelHud);

            this._duelHudFace1 = new Sprite_ActorDuelHudFace(this._actor1, false);
            this._duelHudFace2 = new Sprite_ActorDuelHudFace(this._actor2, true);
            this.addChild(this._duelHudFace1);
            this.addChild(this._duelHudFace2);
        };
    }
})();
