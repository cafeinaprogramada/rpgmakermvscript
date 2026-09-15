/*:
 * @plugindesc Galv Actor Duel Mini Game - Stage 2: Skills and Projectiles
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 * @help
 * Carregue DEPOIS de Galv_ActorDuel_MV.js e dos plugins Stage 1.
 *
 * Tags:
 *   <fpose: x>            Pose usada pelo lutador durante a skill.
 *   <fcost: x>            Custo de stamina.
 *   <fse: sename>         SE da skill.
 *   <fp: p,s,a,t,r>       Skill de projétil:
 *                          p = linha da spritesheet FightSkills
 *                          s = velocidade
 *                          a = animation id (reservado)
 *                          t = duração em frames
 *                          r = alcance de contato do projétil
 *
 * Registro:
 *   ActorDuel add_skill 1 2 r
 *
 * O Stage 2 usa as direções numéricas do Stage 1 diretamente:
 *   1  = direita
 *   -1 = esquerda
 *
 * O arquivo FightSkills.png deve ficar em img/battlers/.
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_Skills';
    var params = PluginManager.parameters(pluginName);

    var CFG2 = {
        projectileImage: String(params['Projectile Image'] || 'FightSkills'),
        projectileCols: Number(params['Projectile Columns'] || 4),
        projectileRows: Number(params['Projectile Rows'] || 14),
        defaultProjectileSpeed: Number(params['Default Projectile Speed'] || 8),
        defaultProjectileLifetime: Number(params['Default Projectile Lifetime'] || 60),
        defaultProjectileReach: Number(params['Default Projectile Reach'] || 32),
        comboWindow: Number(params['Combo Window'] || 20)
    };

    function noteValue(note, regex, fallback) {
        var m = String(note || '').match(regex);
        return m ? m[1].trim() : fallback;
    }

    RPG.Skill.prototype.duelPose = function() {
        return Number(noteValue(this.note, /<fpose:\s*([^>]+)>/i, '7'));
    };

    RPG.Skill.prototype.duelCost = function() {
        return Number(noteValue(this.note, /<fcost:\s*([^>]+)>/i, '100'));
    };

    RPG.Skill.prototype.duelSe = function() {
        return noteValue(this.note, /<fse:\s*([^>]+)>/i, 'Wind7');
    };

    RPG.Skill.prototype.duelProjectile = function() {
        var value = noteValue(this.note, /<fp:\s*([^>]+)>/i, null);
        if (!value) return null;

        var values = value.split(',').map(function(v) {
            return Number(v.trim());
        });

        return {
            pose: Number(values[0] || 0),
            speed: Number(values[1] || CFG2.defaultProjectileSpeed),
            animationId: Number(values[2] || 0),
            lifetime: Number(values[3] || CFG2.defaultProjectileLifetime),
            reach: Number(values[4] || CFG2.defaultProjectileReach)
        };
    };

    var _Game_Actor_duelReset = Game_Actor.prototype.duelReset;
    Game_Actor.prototype.duelReset = function() {
        _Game_Actor_duelReset.call(this);
        this._duelComboSkills = this._duelComboSkills || [];
        this._duelCombo = [];
        this._duelComboTimer = 0;
        this._duelProjectiles = [];
        this._duelSkillUsed = null;
        this._duelSkillTimer = 0;
    };

    Game_Actor.prototype.duelAddSkill = function(skillId, buttons) {
        this._duelComboSkills = this._duelComboSkills || [];
        this._duelComboSkills.push({
            buttons: buttons || [],
            skillId: Number(skillId)
        });
    };

    Game_Actor.prototype.duelAddComboInput = function(direction) {
        this._duelCombo = this._duelCombo || [];
        this._duelComboTimer = CFG2.comboWindow;
        this._duelCombo.push(direction);
    };

    Game_Actor.prototype.duelUpdateCombo = function() {
        this._duelCombo = this._duelCombo || [];
        if (this._duelComboTimer <= 0) {
            this._duelCombo = [];
        } else {
            this._duelComboTimer--;
        }
    };

    Game_Actor.prototype.duelFindSkill = function() {
        var list = this._duelComboSkills || [];
        var input = this._duelCombo || [];

        for (var i = 0; i < list.length; i++) {
            var combo = list[i].buttons || [];
            if (combo.length > input.length) continue;

            var recent = input.slice(input.length - combo.length);
            var match = true;

            for (var j = 0; j < combo.length; j++) {
                if (recent[j] !== combo[j]) {
                    match = false;
                    break;
                }
            }

            if (match) return list[i].skillId;
        }

        return 0;
    };

    Game_Actor.prototype.duelCanUseSkill = function(skill) {
        return !!skill && !this._duelDead &&
            this._duelHitTimer <= 0 &&
            !this._duelGuarding &&
            this._duelAttackTimer <= 0 &&
            this._duelSkillTimer <= 0 &&
            this._duelStamina >= skill.duelCost();
    };

    Game_Actor.prototype.duelStartSkill = function(skillId) {
        var skill = $dataSkills[Number(skillId)];
        if (!this.duelCanUseSkill(skill)) return false;

        this._duelStamina -= skill.duelCost();
        this._duelSkillUsed = skill;
        this._duelSkillTimer = 22;
        this._duelPose = skill.duelPose();

        var se = skill.duelSe();
        if (se) {
            AudioManager.playSe({name: se, volume: 90, pitch: 100, pan: 0});
        }

        var projectile = skill.duelProjectile();
        if (projectile) {
            this.duelCreateProjectile(skill, projectile);
        } else {
            this._duelAttackTimer = 22;
        }

        return true;
    };

    Game_Actor.prototype.duelCreateProjectile = function(skill, data) {
        this._duelProjectiles = this._duelProjectiles || [];
        this._duelProjectiles.push(new ActorDuelProjectile(this, skill, data));
    };

    Game_Actor.prototype.duelUpdateProjectiles = function() {
        this._duelProjectiles = this._duelProjectiles || [];
        for (var i = 0; i < this._duelProjectiles.length; i++) {
            if (this._duelProjectiles[i]) this._duelProjectiles[i].update();
        }
        this._duelProjectiles = this._duelProjectiles.filter(function(p) {
            if (!p || p.finished()) {
                if (p) p.dispose();
                return false;
            }
            return true;
        });
    };

    Game_Actor.prototype.duelTarget = function() {
        if (!$gameSystem || !$gameSystem.actorDuel) return null;
        var ids = $gameSystem.actorDuel.fighters || [];
        if (ids.length < 2) return null;
        var otherId = Number(ids[0]) === this.actorId() ? Number(ids[1]) : Number(ids[0]);
        return $gameActors.actor(otherId);
    };

    var _Game_Actor_duelUpdateStamina = Game_Actor.prototype.duelUpdateStamina;
    Game_Actor.prototype.duelUpdateStamina = function() {
        _Game_Actor_duelUpdateStamina.call(this);
        this.duelUpdateCombo();
        if (this._duelSkillTimer > 0) this._duelSkillTimer--;
        this.duelUpdateProjectiles();
    };

    var _Game_Actor_duelIsBusy = Game_Actor.prototype.duelIsBusy;
    Game_Actor.prototype.duelIsBusy = function() {
        return _Game_Actor_duelIsBusy.call(this) || this._duelSkillTimer > 0;
    };

    var _Game_Actor_duelCanMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        return _Game_Actor_duelCanMove.call(this) && this._duelSkillTimer <= 0;
    };

    function ActorDuelProjectile(owner, skill, data) {
        this.initialize.apply(this, arguments);
    }

    ActorDuelProjectile.prototype = Object.create(Sprite.prototype);
    ActorDuelProjectile.prototype.constructor = ActorDuelProjectile;

    ActorDuelProjectile.prototype.initialize = function(owner, skill, data) {
        Sprite.prototype.initialize.call(this);
        this._owner = owner;
        this._skill = skill;
        this._data = data;
        this._target = owner.duelTarget();
        this._life = 0;
        this._hit = false;
        this._pattern = 0;
        this._animTimer = 0;
        this._speed = Number(data.speed) || CFG2.defaultProjectileSpeed;
        this._lifetime = Number(data.lifetime) || CFG2.defaultProjectileLifetime;
        this._reach = Number(data.reach) || CFG2.defaultProjectileReach;
        this.x = owner._duelX;
        this.y = owner._duelY - 60;
        this.anchor.x = 0.5;
        this.anchor.y = 1;
        this._direction = this._target && this._target._duelX >= owner._duelX ? 1 : -1;
        this.scale.x = this._direction;
        this._loadBitmap();
    };

    ActorDuelProjectile.prototype._loadBitmap = function() {
        this._bitmap = ImageManager.loadBitmap('img/battlers/', CFG2.projectileImage, 0, true);
        this._bitmap.addLoadListener(this._onBitmapLoaded.bind(this));
        this._buildFallback();
    };

    ActorDuelProjectile.prototype._onBitmapLoaded = function() {
        if (!this._bitmap || !this._bitmap.isReady()) return;
        this.bitmap = this._bitmap;
        this._cw = Math.floor(this.bitmap.width / CFG2.projectileCols);
        this._ch = Math.floor(this.bitmap.height / CFG2.projectileRows);
        if (this._cw <= 0 || this._ch <= 0) return;
        this._useSheet = true;
        this._setSheetFrame();
    };

    ActorDuelProjectile.prototype._buildFallback = function() {
        this._fallback = new Bitmap(64, 40);
        this._fallback.fillRect(8, 8, 48, 24);
        this._fallback.fillRect(20, 2, 24, 36);
        this.bitmap = this._fallback;
        this._useSheet = false;
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
    };

    ActorDuelProjectile.prototype._setSheetFrame = function() {
        if (!this._useSheet || !this.bitmap) return;
        var pose = Math.max(0, Math.min(CFG2.projectileRows - 1, Number(this._data.pose || 0)));
        this.setFrame(this._pattern * this._cw, pose * this._ch, this._cw, this._ch);
        this.anchor.x = 0.5;
        this.anchor.y = 1;
    };

    ActorDuelProjectile.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (this.finished()) return;

        this._life++;
        this._animTimer++;

        if (this._useSheet && this.bitmap && this._animTimer >= 7) {
            this._animTimer = 0;
            this._pattern = (this._pattern + 1) % CFG2.projectileCols;
            this._setSheetFrame();
        }

        this.x += this._speed * this._direction;
        this.opacity = 255;

        if (this._target && !this._target._duelDead) {
            var dx = Math.abs(this._target._duelX - this.x);
            var dy = Math.abs((this._target._duelY - 55) - this.y);
            if (dx <= this._reach && dy <= this._reach + 45) {
                this._hit = true;
                this._applyHit();
            }
        }
    };

    ActorDuelProjectile.prototype._applyHit = function() {
        if (!this._target || this._target._duelDead) return;

        var action = new Game_Action(this._owner);
        action.setSkill(this._skill.id);
        var damage = action.makeDamageValue(this._target, false);

        if (this._target._duelGuarding) {
            var mainParams = PluginManager.parameters('Galv_ActorDuel_MV');
            var guardRate = Number(mainParams['Guard Damage Rate'] || 0.25);
            damage = Math.floor(damage * guardRate);
        }

        if (damage < 0) damage = 0;
        this._target.duelTakeDamage(damage, this._owner);
    };

    ActorDuelProjectile.prototype.finished = function() {
        return this._hit || this._life >= this._lifetime ||
            this.x < -100 || this.x > Graphics.width + 100;
    };

    ActorDuelProjectile.prototype.dispose = function() {
        this.bitmap = null;
    };

    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);
        if (String(command).toLowerCase() !== 'actorduel') return;
        if (!args || String(args[0]).toLowerCase() !== 'add_skill') return;

        var actorId = Number(args[1] || 0);
        var skillId = Number(args[2] || 0);
        var buttons = args.slice(3).map(function(value) {
            return String(value).toLowerCase();
        });
        var actor = $gameActors.actor(actorId);
        if (actor && skillId > 0) actor.duelAddSkill(skillId, buttons);
    };

    function tryActorSkill(actor) {
        var skillId = actor.duelFindSkill();
        if (skillId > 0 && actor.duelStartSkill(skillId)) {
            actor._duelCombo = [];
            actor._duelComboTimer = 0;
            return true;
        }
        return false;
    }

    // IMPORTANT: Stage 1 sends numeric movement directions.
    // Capture them here once. Stage2_Skills_Fix is intentionally left as a
    // compatibility no-op so it can remain enabled without duplicating input.
    var _Game_Actor_duelMove = Game_Actor.prototype.duelMove;
    Game_Actor.prototype.duelMove = function(direction) {
        if (direction !== 0 && this.duelCanMove && this.duelCanMove() && this.duelAddComboInput) {
            var target = this.duelTarget ? this.duelTarget() : null;
            var toward = target && this._duelX < target._duelX ? 'r' : 'l';
            var away = toward === 'r' ? 'l' : 'r';
            this.duelAddComboInput(direction > 0 ? toward : away);
        }
        _Game_Actor_duelMove.call(this, direction);
    };

    Game_Actor.prototype.duelTryStage2Skill = function() {
        return tryActorSkill(this);
    };

    var _Game_Actor_duelStartAttack = Game_Actor.prototype.duelStartAttack;
    Game_Actor.prototype.duelStartAttack = function() {
        if (this.duelTryStage2Skill()) return;
        _Game_Actor_duelStartAttack.call(this);
    };

    var _Scene_ActorDuel_createSprites = Scene_ActorDuel.prototype._createSprites;
    Scene_ActorDuel.prototype._createSprites = function() {
        _Scene_ActorDuel_createSprites.call(this);
        this._stage2ProjectileLayer = new Sprite();
        this._stage2ProjectileLayer.z = 25;
        this.addChild(this._stage2ProjectileLayer);
    };

    var _Scene_ActorDuel_update = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _Scene_ActorDuel_update.call(this);
        this._updateStage2Projectiles();
    };

    Scene_ActorDuel.prototype._updateStage2Projectiles = function() {
        if (!this._stage2ProjectileLayer) return;

        var actors = [$gameActors.actor(this._actor1 ? this._actor1.actorId() : 0),
                      $gameActors.actor(this._actor2 ? this._actor2.actorId() : 0)];
        var sprites = [];

        actors.forEach(function(actor) {
            if (!actor || !actor._duelProjectiles) return;
            actor._duelProjectiles.forEach(function(projectile) {
                if (projectile && !projectile.parent) this._stage2ProjectileLayer.addChild(projectile);
                if (projectile) sprites.push(projectile);
            }, this);
        }, this);

        this._stage2ProjectileLayer.children.slice().forEach(function(child) {
            if (sprites.indexOf(child) < 0) this._stage2ProjectileLayer.removeChild(child);
        }, this);
    };

})();