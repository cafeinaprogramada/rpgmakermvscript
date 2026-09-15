/*:
 * @plugindesc Galv Actor Duel MV - Stage 1 HUD (standalone, code-rendered)
 * @author OpenAI / Lucas
 *
 * @help
 * Load AFTER Galv_ActorDuel_MV.js.
 *
 * Code-rendered fighting HUD.
 *
 * Layout:
 *   - Player HP on the upper-left.
 *   - Enemy HP on the upper-right, geometrically mirrored.
 *   - HP values centered inside the HP bars.
 *   - Stamina bars at the bottom of the screen.
 *   - No large semi-transparent background panels.
 *   - HP uses a short delayed drain animation when damage is received.
 *
 * No kombat_bar.png is required.
 */

(function() {
    'use strict';

    if (typeof Scene_ActorDuel === 'undefined') {
        console.warn('[ActorDuel HUD] Galv_ActorDuel_MV.js must load first.');
        return;
    }

    function Sprite_ActorDuelHud() {
        this.initialize.apply(this, arguments);
    }

    Sprite_ActorDuelHud.prototype = Object.create(Sprite.prototype);
    Sprite_ActorDuelHud.prototype.constructor = Sprite_ActorDuelHud;

    Sprite_ActorDuelHud.prototype.initialize = function(actor1, actor2) {
        Sprite.prototype.initialize.call(this);
        this._actor1 = actor1;
        this._actor2 = actor2;

        // The HUD now needs the full screen because stamina lives near the bottom.
        this.bitmap = new Bitmap(Graphics.width, Graphics.height);

        // Actual HP is the target. Display HP moves toward it for a short
        // fighting-game style delayed drain instead of instantly snapping.
        this._displayHp1 = actor1 ? actor1.hp : 0;
        this._displayHp2 = actor2 ? actor2.hp : 0;
        this._displayStamina1 = actor1 ? Number(actor1._duelStamina || 0) : 0;
        this._displayStamina2 = actor2 ? Number(actor2._duelStamina || 0) : 0;

        this._lastHp1 = this._displayHp1;
        this._lastHp2 = this._displayHp2;
        this._lastStamina1 = this._displayStamina1;
        this._lastStamina2 = this._displayStamina2;
        this._lastNames = '';

        this.z = 999;
        this.refresh();
    };

    Sprite_ActorDuelHud.prototype._approach = function(current, target, amount) {
        var delta = target - current;
        if (Math.abs(delta) <= amount) return target;
        return current + (delta > 0 ? amount : -amount);
    };

    Sprite_ActorDuelHud.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (!this._actor1 || !this._actor2) return;

        var targetHp1 = Math.max(0, Number(this._actor1.hp || 0));
        var targetHp2 = Math.max(0, Number(this._actor2.hp || 0));
        var targetStamina1 = Math.max(0, Number(this._actor1._duelStamina || 0));
        var targetStamina2 = Math.max(0, Number(this._actor2._duelStamina || 0));

        // Deliberately modest speed: visible animation, but not a long smooth slide.
        var hpStep1 = Math.max(1, this._actor1.mhp * 0.035);
        var hpStep2 = Math.max(1, this._actor2.mhp * 0.035);
        var stStep1 = Math.max(2, 500 * 0.08);
        var stStep2 = Math.max(2, 500 * 0.08);

        this._displayHp1 = this._approach(this._displayHp1, targetHp1, hpStep1);
        this._displayHp2 = this._approach(this._displayHp2, targetHp2, hpStep2);
        this._displayStamina1 = this._approach(this._displayStamina1, targetStamina1, stStep1);
        this._displayStamina2 = this._approach(this._displayStamina2, targetStamina2, stStep2);

        var changed =
            this._displayHp1 !== this._lastHp1 ||
            this._displayHp2 !== this._lastHp2 ||
            this._displayStamina1 !== this._lastStamina1 ||
            this._displayStamina2 !== this._lastStamina2 ||
            this._actor1.name() + ':' + this._actor2.name() !== this._lastNames;

        if (changed) {
            this._lastHp1 = this._displayHp1;
            this._lastHp2 = this._displayHp2;
            this._lastStamina1 = this._displayStamina1;
            this._lastStamina2 = this._displayStamina2;
            this._lastNames = this._actor1.name() + ':' + this._actor2.name();
            this.refresh();
        }
    };

    Sprite_ActorDuelHud.prototype._rect = function(x, y, w, h, color) {
        this.bitmap.fillRect(x, y, w, h, color);
    };

    // Do not call this method _frame: Sprite.prototype.initialize creates
    // an internal instance property named _frame.
    Sprite_ActorDuelHud.prototype._drawFrame = function(x, y, w, h) {
        this.bitmap.fillRect(x, y, w, 2, '#111111');
        this.bitmap.fillRect(x, y + h - 2, w, 2, '#111111');
        this.bitmap.fillRect(x, y, 2, h, '#111111');
        this.bitmap.fillRect(x + w - 2, y, 2, h, '#111111');
    };

    Sprite_ActorDuelHud.prototype._text = function(text, x, y, w, h, size, align, color) {
        this.bitmap.fontFace = 'Arial';
        this.bitmap.fontSize = size || 18;
        this.bitmap.textColor = color || '#ffffff';
        this.bitmap.drawText(String(text), x, y, w, h, align || 'left');
    };

    Sprite_ActorDuelHud.prototype._drawPortrait = function(actor, x, y, w, h, mirror) {
        if (!actor) return;
        var faceName = actor.faceName();
        var faceIndex = actor.faceIndex();
        if (!faceName) return;

        var bitmap = ImageManager.loadFace(faceName);
        if (!bitmap.isReady()) {
            var self = this;
            bitmap.addLoadListener(function() { self.refresh(); });
            return;
        }

        var sw = Window_Base._faceWidth;
        var sh = Window_Base._faceHeight;
        var sx = (faceIndex % 4) * sw;
        var sy = Math.floor(faceIndex / 4) * sh;

        var pad = 4;
        this.bitmap.blt(bitmap, sx, sy, sw, sh, x + pad, y + pad, w - pad * 2, h - pad * 2);

        if (mirror) {
            var temp = document.createElement('canvas');
            temp.width = w - pad * 2;
            temp.height = h - pad * 2;
            var ctx = temp.getContext('2d');
            ctx.translate(temp.width, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(bitmap._canvas, sx, sy, sw, sh, 0, 0, temp.width, temp.height);
            this.bitmap.clearRect(x + pad, y + pad, temp.width, temp.height);
            this.bitmap._context.drawImage(temp, x + pad, y + pad);
            this.bitmap._setDirty();
        }
    };

    Sprite_ActorDuelHud.prototype._drawHealthBar = function(x, y, w, h, rate, reverse) {
        rate = Math.max(0, Math.min(1, rate));

        this._rect(x, y, w, h, '#101010');
        this._drawFrame(x, y, w, h);

        var inner = 4;
        var fillW = Math.floor((w - inner * 2) * rate);
        if (fillW > 0) {
            var fx = reverse ? x + w - inner - fillW : x + inner;
            this._rect(fx, y + inner, fillW, h - inner * 2, '#35d45b');
            if (rate < 0.35) {
                this._rect(fx, y + inner, fillW, h - inner * 2, '#e6c92e');
            }
            if (rate < 0.18) {
                this._rect(fx, y + inner, fillW, h - inner * 2, '#e34b3f');
            }
        }
    };

    Sprite_ActorDuelHud.prototype._drawStaminaBar = function(x, y, w, h, rate, reverse) {
        rate = Math.max(0, Math.min(1, rate));
        this._rect(x, y, w, h, '#101010');
        this._drawFrame(x, y, w, h);
        var inner = 3;
        var fillW = Math.floor((w - inner * 2) * rate);
        if (fillW > 0) {
            var fx = reverse ? x + w - inner - fillW : x + inner;
            this._rect(fx, y + inner, fillW, h - inner * 2, '#e7c83b');
        }
    };

    Sprite_ActorDuelHud.prototype.refresh = function() {
        if (!this.bitmap) return;
        this.bitmap.clear();

        var width = Graphics.width;
        var height = Graphics.height;
        var barW = Math.min(420, Math.floor(width * 0.36));
        var portrait = 78;
        var gap = 12;
        var leftX = 24;
        var rightPortraitX = width - 24 - portrait;
        var top = 18;

        // IMPORTANT: the right side is now the true horizontal mirror of the left.
        // Left:  portrait -> gap -> HP bar
        // Right: HP bar -> gap -> portrait
        var barX1 = leftX + portrait + gap;
        var barX2 = rightPortraitX - gap - barW;

        var hpY = 48;
        var hpH = 30;

        // X-Ray-style stamina position near the lower part of a standard 624px MV screen.
        // The clamp keeps it visible on smaller resolutions.
        var stY = Math.max(500, Math.min(550, height - 74));
        var stH = 14;

        // Portraits: no large semi-transparent black HUD panels behind them.
        this._rect(leftX, top, portrait, portrait, '#202020');
        this._drawFrame(leftX, top, portrait, portrait);
        this._drawPortrait(this._actor1, leftX, top, portrait, portrait, false);

        this._rect(rightPortraitX, top, portrait, portrait, '#202020');
        this._drawFrame(rightPortraitX, top, portrait, portrait);
        this._drawPortrait(this._actor2, rightPortraitX, top, portrait, portrait, true);

        // Names remain above the HP bars.
        this._text(this._actor1.name(), barX1, 18, barW, 25, 18, 'left', '#ffffff');
        this._text(this._actor2.name(), barX2, 18, barW, 25, 18, 'right', '#ffffff');

        var hp1 = this._actor1.mhp > 0 ? this._displayHp1 / this._actor1.mhp : 0;
        var hp2 = this._actor2.mhp > 0 ? this._displayHp2 / this._actor2.mhp : 0;
        this._drawHealthBar(barX1, hpY, barW, hpH, hp1, false);
        this._drawHealthBar(barX2, hpY, barW, hpH, hp2, true);

        // HP values are now centered directly INSIDE their respective bars.
        this._text(
            Math.floor(this._displayHp1) + ' / ' + this._actor1.mhp,
            barX1, hpY + 2, barW, hpH - 4, 15, 'center', '#ffffff'
        );
        this._text(
            Math.floor(this._displayHp2) + ' / ' + this._actor2.mhp,
            barX2, hpY + 2, barW, hpH - 4, 15, 'center', '#ffffff'
        );

        var maxSt = (typeof CFG !== 'undefined' && CFG.maxStamina) ? CFG.maxStamina : 500;
        var st1 = maxSt > 0 ? this._displayStamina1 / maxSt : 0;
        var st2 = maxSt > 0 ? this._displayStamina2 / maxSt : 0;
        this._drawStaminaBar(barX1, stY, barW, stH, st1, false);
        this._drawStaminaBar(barX2, stY, barW, stH, st2, true);

        // Small labels stay immediately with the stamina bars instead of crowding HP.
        this._text('ST ' + Math.floor(this._displayStamina1), barX1, stY - 20, barW, 18, 12, 'left', '#e7c83b');
        this._text('ST ' + Math.floor(this._displayStamina2), barX2, stY - 20, barW, 18, 12, 'right', '#e7c83b');
    };

    Scene_ActorDuel.prototype._createStatusWindows = function() {
        this._duelHudSprite = new Sprite_ActorDuelHud(this._actor1, this._actor2);
        this.addChild(this._duelHudSprite);
    };

    var _Scene_ActorDuel_create = Scene_ActorDuel.prototype.create;
    Scene_ActorDuel.prototype.create = function() {
        _Scene_ActorDuel_create.call(this);
        if (this._duelHudSprite) {
            this._duelHudSprite.z = 500;
        }
    };

})();
