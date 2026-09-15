/*:
 * @plugindesc Galv Actor Duel Mini Game - Stage 2 Skills/Projectiles V3
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 * @help
 * Native MV implementation of Galv's projectile behavior.
 *
 * IMPORTANT:
 * - Disable Stage2_Skills.js, Stage2_Skills_Fix.js and Stage2_Skills_V2.js.
 * - Keep this plugin AFTER all Stage 1 plugins.
 * - Projectile graphics are taken ONLY from img/battlers/FightSkills.png.
 *
 * Skill notetags:
 * <fpose: x>
 * <fcost: x>
 * <fse: SoundName>
 * <fp: pose,speed,animationId,lifetime,reach>
 *
 * Example:
 * <fpose: 6>
 * <fcost: 100>
 * <fse: Wind7>
 * <fp: 6,8,0,60,32>
 *
 * Register a combo:
 * ActorDuel add_skill 1 2 r
 *
 * FightSkills.png uses 4 columns x 14 rows, matching the original script.
 */
(function() {
    'use strict';

    var PLUGIN = 'Galv_ActorDuel_MV_Stage2_Skills_V3';
    var params = PluginManager.parameters(PLUGIN);

    var CFG = {
        image: String(params['Projectile Image'] || 'FightSkills'),
        cols: Number(params['Projectile Columns'] || 4),
        rows: Number(params['Projectile Rows'] || 14),
        speed: Number(params['Default Projectile Speed'] || 8),
        life: Number(params['Default Projectile Lifetime'] || 60),
        reach: Number(params['Default Projectile Reach'] || 32),
        comboWindow: Number(params['Combo Window'] || 20)
    };

    function noteValue(skill, regex, fallback) {
        var note = skill && skill.note ? String(skill.note) : '';
        var match = note.match(regex);
        return match ? String(match[1]).trim() : fallback;
    }

    function skillPose(skill) {
        return Number(noteValue(skill, /<fpose:\s*([^>]+)>/i, '7'));
    }

    function skillCost(skill) {
        return Number(noteValue(skill, /<fcost:\s*([^>]+)>/i, '100'));
    }

    function skillSe(skill) {
        return noteValue(skill, /<fse:\s*([^>]+)>/i, 'Wind7');
    }

    function skillProjectile(skill) {
        var value = noteValue(skill, /<fp:\s*([^>]+)>/i, null);
        if (!value) return null;

        var values = value.split(',').map(function(value) {
            return Number(String(value).trim());
        });

        return {
            pose: Number(values[0] || 0),
            speed: Number(values[1] || CFG.speed),
            animationId: Number(values[2] || 0),
            lifetime: Number(values[3] || CFG.life),
            reach: Number(values[4] || CFG.reach)
        };
    }

    // ---------------------------------------------------------------------
    // Duel state
    // ---------------------------------------------------------------------

    var _duelReset = Game_Actor.prototype.duelReset;
    Game_Actor.prototype.duelReset = function() {
        _duelReset.call(this);
        this._duelComboSkills = [];
        this._duelCombo = [];
        this._duelComboTimer = 0;
        this._duelSkillTimer = 0;
        this._duelSkillUsed = null;
    };

    Game_Actor.prototype.duelAddSkill = function(skillId, buttons) {
        this._duelComboSkills = this._duelComboSkills || [];
        this._duelComboSkills.push({
            skillId: Number(skillId),
            buttons: (buttons || []).map(function(button) {
                return String(button).toLowerCase();
            })
        });
    };

    Game_Actor.prototype.duelAddComboInputV3 = function(direction) {
        this._duelCombo = this._duelCombo || [];
        this._duelCombo.push(String(direction).toLowerCase());
        this._duelComboTimer = CFG.comboWindow;
    };

    Game_Actor.prototype.duelUpdateComboV3 = function() {
        this._duelCombo = this._duelCombo || [];
        if (this._duelComboTimer > 0) this._duelComboTimer--;
        if (this._duelComboTimer <= 0) this._duelCombo = [];
    };

    Game_Actor.prototype.duelFindSkillV3 = function() {
        var input = this._duelCombo || [];
        var skills = this._duelComboSkills || [];

        for (var i = 0; i < skills.length; i++) {
            var combo = skills[i].buttons || [];
            if (!combo.length || combo.length > input.length) continue;

            var start = input.length - combo.length;
            var matches = true;

            for (var j = 0; j < combo.length; j++) {
                if (input[start + j] !== combo[j]) {
                    matches = false;
                    break;
                }
            }

            if (matches) return skills[i].skillId;
        }

        return 0;
    };

    Game_Actor.prototype.duelTargetV3 = function() {
        var data = $gameSystem && $gameSystem.actorDuel;
        if (!data) return null;

        var ids = data.fighters || [];
        if (ids.length < 2) return null;

        var otherId = Number(ids[0]) === this.actorId()
            ? Number(ids[1])
            : Number(ids[0]);

        return $gameActors.actor(otherId);
    };

    Game_Actor.prototype.duelCanUseSkillV3 = function(skill) {
        return !!skill &&
            !this._duelDead &&
            this._duelHitTimer <= 0 &&
            !this._duelGuarding &&
            this._duelAttackTimer <= 0 &&
            this._duelSkillTimer <= 0 &&
            this._duelStamina >= skillCost(skill);
    };

    // ---------------------------------------------------------------------
    // Skill activation
    // ---------------------------------------------------------------------

    Game_Actor.prototype.duelStartSkillV3 = function(skillId) {
        var skill = $dataSkills[Number(skillId)];
        if (!this.duelCanUseSkillV3(skill)) return false;

        var cost = skillCost(skill);
        this._duelStamina -= cost;
        this._duelSkillUsed = skill;
        this._duelSkillTimer = 22;
        this._duelPose = skillPose(skill);

        var se = skillSe(skill);
        if (se) {
            AudioManager.playSe({
                name: se,
                volume: 90,
                pitch: 100,
                pan: 0
            });
        }

        var projectileData = skillProjectile(skill);

        if (projectileData) {
            var scene = SceneManager._scene;
            if (scene && scene._spawnStage2ProjectileV3) {
                scene._spawnStage2ProjectileV3(this, skill, projectileData);
            }
        } else {
            this._duelAttackTimer = 22;
        }

        return true;
    };

    var _duelUpdateStamina = Game_Actor.prototype.duelUpdateStamina;
    Game_Actor.prototype.duelUpdateStamina = function() {
        _duelUpdateStamina.call(this);
        this.duelUpdateComboV3();
        if (this._duelSkillTimer > 0) this._duelSkillTimer--;
    };

    var _duelIsBusy = Game_Actor.prototype.duelIsBusy;
    Game_Actor.prototype.duelIsBusy = function() {
        return _duelIsBusy.call(this) || this._duelSkillTimer > 0;
    };

    var _duelCanMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        return _duelCanMove.call(this) && this._duelSkillTimer <= 0;
    };

    // Capture the same relative direction convention used by Galv:
    // r = toward enemy, l = away from enemy.
    var _duelMove = Game_Actor.prototype.duelMove;
    Game_Actor.prototype.duelMove = function(direction) {
        if (direction !== 0 && this.duelCanMove() && this.duelAddComboInputV3) {
            var target = this.duelTargetV3();
            var toward = target && this._duelX < target._duelX ? 'r' : 'l';
            var input = direction > 0 ? toward : (toward === 'r' ? 'l' : 'r');
            this.duelAddComboInputV3(input);
        }
        _duelMove.call(this, direction);
    };

    var _duelJump = Game_Actor.prototype.duelJump;
    Game_Actor.prototype.duelJump = function() {
        if (this.duelCanMove() && this.duelAddComboInputV3) {
            this.duelAddComboInputV3('u');
        }
        _duelJump.call(this);
    };

    var _duelStartGuard = Game_Actor.prototype.duelStartGuard;
    Game_Actor.prototype.duelStartGuard = function() {
        if (this.duelCanMove() && this.duelAddComboInputV3) {
            this.duelAddComboInputV3('d');
        }
        _duelStartGuard.call(this);
    };

    Game_Actor.prototype.duelTrySkillV3 = function() {
        var skillId = this.duelFindSkillV3();
        if (skillId > 0 && this.duelStartSkillV3(skillId)) {
            this._duelCombo = [];
            this._duelComboTimer = 0;
            return true;
        }
        return false;
    };

    var _duelStartAttack = Game_Actor.prototype.duelStartAttack;
    Game_Actor.prototype.duelStartAttack = function() {
        if (this.duelTrySkillV3()) return;
        _duelStartAttack.call(this);
    };

    // ---------------------------------------------------------------------
    // Native MV projectile
    // ---------------------------------------------------------------------

    function ActorDuelProjectileV3() {
        this.initialize.apply(this, arguments);
    }

    ActorDuelProjectileV3.prototype = Object.create(Sprite_Base.prototype);
    ActorDuelProjectileV3.prototype.constructor = ActorDuelProjectileV3;

    ActorDuelProjectileV3.prototype.initialize = function(owner, skill, data) {
        Sprite_Base.prototype.initialize.call(this);

        this._owner = owner;
        this._skill = skill;
        this._data = data;
        this._target = owner.duelTargetV3();
        this._life = 0;
        this._range = 0;
        this._hit = false;
        this._pattern = 0;
        this._frameTimer = 0;

        var targetX = this._target ? this._target._duelX : owner._duelX + 1;
        this._direction = targetX >= owner._duelX ? 1 : -1;

        // Deliberately starts in front of the fighter, just like a fighting-game projectile.
        this.x = owner._duelX + this._direction * 55;
        this.y = owner._duelY - 60;

        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.scale.x = this._direction;
        this.scale.y = 1;
        this.opacity = 0;
        this.visible = false;

        this._speed = Number(data.speed) || CFG.speed;
        this._lifetime = Number(data.lifetime) || CFG.life;
        this._reach = Number(data.reach) || CFG.reach;
        this._pose = Number(data.pose || 0);
        this._animationId = Number(data.animationId || 0);

        this.bitmap = ImageManager.loadBitmap('img/battlers/', CFG.image, 0, true);
        this.bitmap.addLoadListener(this._onBitmapReady.bind(this));
    };

    ActorDuelProjectileV3.prototype._onBitmapReady = function() {
        if (!this.bitmap || !this.bitmap.isReady()) return;

        this._cw = Math.floor(this.bitmap.width / CFG.cols);
        this._ch = Math.floor(this.bitmap.height / CFG.rows);

        if (this._cw <= 0 || this._ch <= 0) return;

        this.anchor.x = 0.5;
        this.anchor.y = 0.5;
        this.visible = true;
        this.opacity = 255;
        this._setFrame();

        // The original plays the database animation when the projectile is created.
        if (this._animationId > 0 && $dataAnimations[this._animationId]) {
            this.startAnimation($dataAnimations[this._animationId], false, 0);
        }
    };

    ActorDuelProjectileV3.prototype._setFrame = function() {
        if (!this._cw || !this._ch) return;

        var row = Math.max(0, Math.min(CFG.rows - 1, this._pose));
        var column = Math.max(0, Math.min(CFG.cols - 1, this._pattern));

        this.setFrame(
            column * this._cw,
            row * this._ch,
            this._cw,
            this._ch
        );
    };

    ActorDuelProjectileV3.prototype.update = function() {
        Sprite_Base.prototype.update.call(this);

        if (this._hit) return;

        this._life++;
        this._range++;
        this._frameTimer++;

        if (this._frameTimer > 6) {
            this._frameTimer = 0;
            this._pattern = (this._pattern + 1) % CFG.cols;
            this._setFrame();
        }

        this.x += this._speed * this._direction;

        if (this._target && !this._target._duelDead) {
            var dx = Math.abs(this._target._duelX - this.x);
            var dy = Math.abs(this._target._duelY - this.y);

            if (dx < this._reach && dy < this._reach + 60) {
                this._hit = true;
                this._applyHit();
            }
        }
    };

    ActorDuelProjectileV3.prototype._applyHit = function() {
        if (!this._target || this._target._duelDead) return;

        var action = new Game_Action(this._owner);
        action.setSkill(this._skill.id);

        var damage = action.makeDamageValue(this._target, false);
        damage = Math.max(0, Math.floor(damage));

        if (this._target._duelGuarding) {
            var mainParams = PluginManager.parameters('Galv_ActorDuel_MV');
            var guardRate = Number(mainParams['Guard Damage Rate'] || 0.25);
            damage = Math.floor(damage * guardRate);
        }

        this._target.duelTakeDamage(damage, this._owner);

        // Small projectile knockback matching the spirit of the original do_damage.
        if (damage > 0 && this._owner.duelData && this._target.duelData) {
            var away = this._target._duelX >= this._owner._duelX ? 1 : -1;
            this._target._duelX += away * 8;
            this._target.duelClamp();
        }
    };

    ActorDuelProjectileV3.prototype.finished = function() {
        return this._hit ||
            this._range >= this._lifetime ||
            this.x < -100 ||
            this.x > Graphics.width + 100;
    };

    ActorDuelProjectileV3.prototype.dispose = function() {
        if (this.parent) this.parent.removeChild(this);
        this.bitmap = null;
    };

    // ---------------------------------------------------------------------
    // Scene integration
    // ---------------------------------------------------------------------

    Scene_ActorDuel.prototype._spawnStage2ProjectileV3 = function(owner, skill, data) {
        if (!this._stage2ProjectileLayerV3) return;

        var projectile = new ActorDuelProjectileV3(owner, skill, data);
        this._stage2ProjectilesV3.push(projectile);
        this._stage2ProjectileLayerV3.addChild(projectile);
    };

    var _sceneCreateSpritesV3 = Scene_ActorDuel.prototype._createSprites;
    Scene_ActorDuel.prototype._createSprites = function() {
        _sceneCreateSpritesV3.call(this);

        this._stage2ProjectilesV3 = [];
        this._stage2ProjectileLayerV3 = new Sprite();

        // Added after the fighters, so the projectile is visually above them.
        this.addChild(this._stage2ProjectileLayerV3);
    };

    var _sceneUpdateV3 = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _sceneUpdateV3.call(this);
        this._updateStage2ProjectilesV3();
    };

    Scene_ActorDuel.prototype._updateStage2ProjectilesV3 = function() {
        if (!this._stage2ProjectilesV3) return;

        for (var i = this._stage2ProjectilesV3.length - 1; i >= 0; i--) {
            var projectile = this._stage2ProjectilesV3[i];

            if (!projectile || projectile.finished()) {
                if (projectile) projectile.dispose();
                this._stage2ProjectilesV3.splice(i, 1);
            }
        }
    };

    // ---------------------------------------------------------------------
    // Plugin command
    // ---------------------------------------------------------------------

    var _pluginCommandV3 = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _pluginCommandV3.call(this, command, args);

        if (String(command).toLowerCase() !== 'actorduel') return;
        if (!args || String(args[0]).toLowerCase() !== 'add_skill') return;

        var actorId = Number(args[1] || 0);
        var skillId = Number(args[2] || 0);
        var actor = $gameActors.actor(actorId);

        if (actor && skillId > 0) {
            actor.duelAddSkill(skillId, args.slice(3));
        }
    };
})();