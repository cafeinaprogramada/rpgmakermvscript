/*:
 * @plugindesc Galv Actor Duel MV - Stage 2 Skills V3 Bridge / Visual Fix
 * @author OpenAI
 * @help
 * This plugin sits AFTER Stage2_Skills_V3.
 * It provides a direct MV visual path for skill emission and FightSkills.png
 * projectiles, so the skill is visibly emitted even if the V3 projectile layer
 * is unavailable.
 *
 * Plugin order:
 * Galv_ActorDuel_MV
 * Stage1Fix
 * Stage1HUD
 * CombatFX
 * Stage2_Skills_V3
 * Stage2_Skills_V3_Bridge
 *
 * Skill note tags:
 * <fpose: 6>
 * <fcost: 100>
 * <fse: Wind7>
 * <fp: 6,8,115,60,32>
 */
(function() {
    'use strict';

    var IMAGE = 'FightSkills';
    var COLS = 4;
    var ROWS = 14;

    function fpData(skill) {
        if (!skill || !skill.note) return null;
        var m = String(skill.note).match(/<fp:\s*([^>]+)>/i);
        if (!m) return null;
        var v = m[1].split(',').map(function(x) { return Number(String(x).trim()); });
        return {
            pose: Number(v[0] || 0),
            speed: Number(v[1] || 8),
            animationId: Number(v[2] || 0),
            lifetime: Number(v[3] || 60),
            reach: Number(v[4] || 32)
        };
    }

    function fpose(skill) {
        if (!skill || !skill.note) return 7;
        var m = String(skill.note).match(/<fpose:\s*([^>]+)>/i);
        return m ? Number(m[1]) : 7;
    }

    function targetOf(actor) {
        if (actor.duelTargetV3) return actor.duelTargetV3();
        var d = $gameSystem && $gameSystem.actorDuel;
        if (!d || !d.fighters || d.fighters.length < 2) return null;
        var id = Number(d.fighters[0]) === actor.actorId() ? d.fighters[1] : d.fighters[0];
        return $gameActors.actor(id);
    }

    function BridgeProjectile() {
        this.initialize.apply(this, arguments);
    }

    BridgeProjectile.prototype = Object.create(Sprite_Base.prototype);
    BridgeProjectile.prototype.constructor = BridgeProjectile;

    BridgeProjectile.prototype.initialize = function(owner, skill, data) {
        Sprite_Base.prototype.initialize.call(this);
        this._owner = owner;
        this._skill = skill;
        this._data = data;
        this._target = targetOf(owner);
        this._life = 0;
        this._frame = 0;
        this._frameTimer = 0;
        this._hit = false;

        var tx = this._target ? Number(this._target._duelX) : Number(owner._duelX) + 1;
        this._dir = tx >= Number(owner._duelX) ? 1 : -1;

        // Emit from the fighter's actual position, not from an arbitrary screen point.
        this.x = Number(owner._duelX) + this._dir * 38;
        this.y = Number(owner._duelY) - 55;
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.scale.x = this._dir * 2;
        this.scale.y = 2;
        this.z = 20;

        this.bitmap = ImageManager.loadBitmap('img/battlers/', IMAGE, 0, true);
        this.bitmap.addLoadListener(this._ready.bind(this));
    };

    BridgeProjectile.prototype._ready = function() {
        if (!this.bitmap || !this.bitmap.isReady()) return;
        this._cw = Math.floor(this.bitmap.width / COLS);
        this._ch = Math.floor(this.bitmap.height / ROWS);
        if (this._cw <= 0 || this._ch <= 0) return;
        this.visible = true;
        this.opacity = 255;
        this._setFrame();
    };

    BridgeProjectile.prototype._setFrame = function() {
        if (!this._cw || !this._ch) return;
        var row = Math.max(0, Math.min(ROWS - 1, Number(this._data.pose || 0)));
        var col = this._frame % COLS;
        this.setFrame(col * this._cw, row * this._ch, this._cw, this._ch);
    };

    BridgeProjectile.prototype.update = function() {
        Sprite_Base.prototype.update.call(this);
        if (this._hit) return;
        this._life++;
        this._frameTimer++;
        if (this._frameTimer >= 7) {
            this._frameTimer = 0;
            this._frame++;
            this._setFrame();
        }
        this.x += Number(this._data.speed || 8) * this._dir;

        if (this._target && !this._target._duelDead) {
            var dx = Math.abs(Number(this._target._duelX) - this.x);
            var dy = Math.abs(Number(this._target._duelY) - this.y);
            if (dx <= Number(this._data.reach || 32) && dy <= Number(this._data.reach || 32) + 60) {
                this._hit = true;
                this._damage();
            }
        }
    };

    BridgeProjectile.prototype._damage = function() {
        if (!this._target || this._target._duelDead) return;
        var action = new Game_Action(this._owner);
        action.setSkill(this._skill.id);
        var damage = Math.max(0, Math.floor(action.makeDamageValue(this._target, false)));
        if (this._target._duelGuarding) {
            var p = PluginManager.parameters('Galv_ActorDuel_MV');
            damage = Math.floor(damage * Number(p['Guard Damage Rate'] || 0.25));
        }
        this._target.duelTakeDamage(damage, this._owner);
    };

    BridgeProjectile.prototype.finished = function() {
        return this._hit || this._life >= Number(this._data.lifetime || 60) ||
            this.x < -150 || this.x > Graphics.width + 150;
    };

    // Direct scene container. It does not depend on V3's private projectile layer.
    Scene_ActorDuel.prototype._ensureBridgeProjectiles = function() {
        if (!this._bridgeProjectiles) this._bridgeProjectiles = [];
        if (!this._bridgeProjectileLayer) {
            this._bridgeProjectileLayer = new Sprite();
            this.addChild(this._bridgeProjectileLayer);
        }
    };

    Scene_ActorDuel.prototype._spawnBridgeProjectile = function(owner, skill, data) {
        this._ensureBridgeProjectiles();
        var p = new BridgeProjectile(owner, skill, data);
        this._bridgeProjectiles.push(p);
        this._bridgeProjectileLayer.addChild(p);
    };

    var _sceneUpdate = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _sceneUpdate.call(this);
        this._ensureBridgeProjectiles();
        for (var i = this._bridgeProjectiles.length - 1; i >= 0; i--) {
            var p = this._bridgeProjectiles[i];
            if (!p || p.finished()) {
                if (p && p.parent) p.parent.removeChild(p);
                this._bridgeProjectiles.splice(i, 1);
            }
        }
    };

    // Capture skill activation AFTER V3. The original activation still handles stamina,
    // combo and skill state; this bridge only guarantees the visible emission path.
    var _startSkill = Game_Actor.prototype.duelStartSkillV3;
    Game_Actor.prototype.duelStartSkillV3 = function(skillId) {
        var result = _startSkill.call(this, skillId);
        if (!result) return result;

        var skill = $dataSkills[Number(skillId)];
        var data = fpData(skill);
        if (!data) return result;

        // Force the fighter to use the skill pose during the casting/emission window.
        this._duelPose = fpose(skill);
        this._duelSkillTimer = Math.max(Number(this._duelSkillTimer || 0), 22);

        var scene = SceneManager._scene;
        if (!scene || !scene._actor1) return result;

        // Reproduce the original database animation on the emitting fighter.
        var fighter = scene._actor1 === this ? scene._sprite1 :
            (scene._actor2 === this ? scene._sprite2 : null);
        if (fighter && fighter.startAnimation && data.animationId > 0 && $dataAnimations[data.animationId]) {
            fighter.startAnimation($dataAnimations[data.animationId], false, 0);
        }

        scene._spawnBridgeProjectile(this, skill, data);
        return result;
    };
})();
