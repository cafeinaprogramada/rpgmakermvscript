/*:
 * @plugindesc Galv Actor Duel MV - Stage 1 combat visuals (facing + hit FX)
 * @author OpenAI
 * @help
 * Load AFTER Galv_ActorDuel_MV.js and the Stage 1 HUD/Fix plugins.
 *
 * Stage 1 visual improvements:
 * - Corrects fighter horizontal direction for Holder-style battler sheets.
 * - Adds a procedural impact flash/burst when HP is reduced.
 * - Adds a small screen flash and shake on a successful hit.
 * - Adds a stronger red impact when the hit is lethal.
 *
 * No extra image files are required.
 */
(function() {
    'use strict';

    if (typeof Scene_ActorDuel === 'undefined') return;

    // -------------------------------------------------------------
    // Impact FX sprite
    // -------------------------------------------------------------
    function ActorDuelImpactFX(x, y, lethal, guarded) {
        Sprite.call(this);

        this._age = 0;
        this._maxAge = lethal ? 24 : 16;
        this._lethal = !!lethal;
        this._guarded = !!guarded;
        this.x = x;
        this.y = y;
        this.z = 20;

        var size = lethal ? 110 : 80;
        this.bitmap = new Bitmap(size, size);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this._size = size;

        this._draw();
    }

    ActorDuelImpactFX.prototype = Object.create(Sprite.prototype);
    ActorDuelImpactFX.prototype.constructor = ActorDuelImpactFX;

    ActorDuelImpactFX.prototype._draw = function() {
        var b = this.bitmap;
        var ctx = b._context;
        var c = this._size / 2;

        ctx.save();
        ctx.clearRect(0, 0, this._size, this._size);

        // Central flash.
        var gradient = ctx.createRadialGradient(c, c, 2, c, c, c * 0.75);
        if (this._lethal) {
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.18, 'rgba(255,80,80,0.95)');
            gradient.addColorStop(0.55, 'rgba(255,0,0,0.45)');
            gradient.addColorStop(1, 'rgba(255,0,0,0)');
        } else if (this._guarded) {
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.22, 'rgba(255,235,120,0.9)');
            gradient.addColorStop(0.6, 'rgba(255,190,40,0.35)');
            gradient.addColorStop(1, 'rgba(255,180,0,0)');
        } else {
            gradient.addColorStop(0, 'rgba(255,255,255,1)');
            gradient.addColorStop(0.2, 'rgba(255,245,190,0.95)');
            gradient.addColorStop(0.58, 'rgba(255,150,40,0.42)');
            gradient.addColorStop(1, 'rgba(255,90,0,0)');
        }

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(c, c, c * 0.75, 0, Math.PI * 2);
        ctx.fill();

        // Radial slash marks.
        ctx.strokeStyle = this._lethal ? 'rgba(255,80,80,0.95)' : 'rgba(255,245,190,0.9)';
        ctx.lineWidth = this._lethal ? 4 : 3;
        ctx.lineCap = 'round';

        for (var i = 0; i < 8; i++) {
            var angle = (Math.PI * 2 / 8) * i;
            var inner = c * 0.38;
            var outer = c * 0.82;
            ctx.beginPath();
            ctx.moveTo(c + Math.cos(angle) * inner, c + Math.sin(angle) * inner);
            ctx.lineTo(c + Math.cos(angle) * outer, c + Math.sin(angle) * outer);
            ctx.stroke();
        }

        ctx.restore();
        b._setDirty();
    };

    ActorDuelImpactFX.prototype.update = function() {
        Sprite.prototype.update.call(this);

        this._age++;
        var t = this._age / this._maxAge;

        this.scale.x = 0.35 + t * 1.15;
        this.scale.y = this.scale.x;
        this.rotation = (this._age % 2 === 0 ? 1 : -1) * t * 0.08;
        this.opacity = Math.max(0, 255 * (1 - t));

        if (this._age >= this._maxAge && this.parent) {
            this.parent.removeChild(this);
        }
    };

    // -------------------------------------------------------------
    // Scene helpers
    // -------------------------------------------------------------
    Scene_ActorDuel.prototype._stage1CreateCombatFx = function() {
        this._stage1FxLayer = new Sprite();
        this._stage1FxLayer.z = 20;
        this.addChild(this._stage1FxLayer);

        this._stage1LastHp1 = this._actor1 ? this._actor1.hp : 0;
        this._stage1LastHp2 = this._actor2 ? this._actor2.hp : 0;
        this._stage1Shake = 0;
        this._stage1BaseX = 0;
        this._stage1BaseY = 0;
    };

    Scene_ActorDuel.prototype._stage1SpawnHitFx = function(target) {
        if (!this._stage1FxLayer || !target) return;

        var lethal = target._duelDead === true;
        var guarded = target._duelHitTimer > 0 && target._duelHitTimer <= 12;
        var fx = new ActorDuelImpactFX(
            Math.round(target._duelX),
            Math.round(target._duelY - 85),
            lethal,
            guarded
        );

        this._stage1FxLayer.addChild(fx);
        this._stage1Shake = lethal ? 8 : 4;

        // Short white screen flash without using the battleback itself.
        if (!this._stage1Flash) {
            this._stage1Flash = new Sprite(new Bitmap(Graphics.boxWidth, Graphics.boxHeight));
            this._stage1Flash.z = 30;
            this._stage1Flash.bitmap.fillAll('rgba(255,255,255,0.0)');
            this.addChild(this._stage1Flash);
        }

        this._stage1Flash.opacity = lethal ? 150 : 85;
        this._stage1Flash.bitmap.clear();
        this._stage1Flash.bitmap.fillAll(lethal ? '#ffdddd' : '#ffffff');
    };

    Scene_ActorDuel.prototype._stage1UpdateCombatFx = function() {
        if (!this._stage1FxLayer || !this._actor1 || !this._actor2) return;

        var hp1 = this._actor1.hp;
        var hp2 = this._actor2.hp;

        if (hp1 < this._stage1LastHp1) {
            this._stage1SpawnHitFx(this._actor1);
        }
        if (hp2 < this._stage1LastHp2) {
            this._stage1SpawnHitFx(this._actor2);
        }

        this._stage1LastHp1 = hp1;
        this._stage1LastHp2 = hp2;

        if (this._stage1Shake > 0) {
            this._stage1Shake--;
            this.x = (Math.random() * 2 - 1) * this._stage1Shake;
            this.y = (Math.random() * 2 - 1) * this._stage1Shake * 0.5;
        } else {
            this.x = this._stage1BaseX;
            this.y = this._stage1BaseY;
        }

        if (this._stage1Flash && this._stage1Flash.opacity > 0) {
            this._stage1Flash.opacity = Math.max(0, this._stage1Flash.opacity - 35);
        }
    };

    // -------------------------------------------------------------
    // Integrate with scene creation/update.
    // -------------------------------------------------------------
    var _Scene_ActorDuel_create = Scene_ActorDuel.prototype.create;
    Scene_ActorDuel.prototype.create = function() {
        _Scene_ActorDuel_create.call(this);

        if (!this._finished) {
            this._stage1CreateCombatFx();
        }
    };

    var _Scene_ActorDuel_update = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _Scene_ActorDuel_update.call(this);

        if (this._finished) return;

        // The original fighter sheets face the opposite direction from the
        // duel convention, so invert the visual scale here. P1 faces right;
        // P2 faces left when they are on their normal sides.
        if (this._sprite1 && this._actor1) {
            this._sprite1.scale.x = this._actor1._duelFacing >= 0 ? -2 : 2;
        }
        if (this._sprite2 && this._actor2) {
            this._sprite2.scale.x = this._actor2._duelFacing >= 0 ? -2 : 2;
        }

        this._stage1UpdateCombatFx();
    };
})();
