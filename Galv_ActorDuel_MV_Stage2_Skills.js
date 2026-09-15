/*:
 * @plugindesc Galv Actor Duel Mini Game - Stage 2: Skills and Projectiles
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 * @help
 * Carregue DEPOIS de Galv_ActorDuel_MV.js e dos plugins Stage 1.
 *
 * Esta primeira versão da Parte 2 implementa a base de skills do Galv:
 *   <fpose: x>            Pose usada pelo lutador durante a skill.
 *   <fcost: x>            Custo de stamina.
 *   <fse: sename>         SE da skill.
 *   <fp: p,s,a,t,r>       Skill de projétil:
 *                          p = linha da spritesheet FightSkills
 *                          s = velocidade
 *                          a = animation id (mantido como dado da skill)
 *                          t = duração em frames
 *                          r = alcance de contato do projétil
 *
 * Para registrar uma skill em um ator:
 *   ActorDuel add_skill 1 2 r
 *
 * Onde:
 *   1 = ID do ator
 *   2 = ID da skill
 *   r = botão/direção necessário antes do ataque.
 *
 * Combos aceitos:
 *   l = esquerda / afastar do inimigo
 *   r = direita / aproximar do inimigo
 *   u = cima
 *   d = baixo
 *
 * Exemplo:
 *   ActorDuel add_skill 1 2 r
 *
 * Depois, durante o duelo, estando o P1 à esquerda:
 *   Direita -> Ataque
 *
 * O mesmo comando de direção é convertido automaticamente para o lado
 * relativo ao inimigo quando o lutador muda de lado.
 *
 * A primeira implementação de projétil usa a spritesheet FightSkills quando
 * disponível. Se ela não existir, um marcador procedural é desenhado para
 * permitir testar a lógica sem asset adicional.
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

    // ---------------------------------------------------------------------
    // RPG::Skill - dados das skills de duelo
    // ---------------------------------------------------------------------
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

    // ---------------------------------------------------------------------
    // Game_Actor - skill registry / combo input
    // ---------------------------------------------------------------------
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
            AudioManager.playSe({
                name: se,
                volume: 90,
                pitch: 100,
                pan: 0
            });
        }

        var projectile = skill.duelProjectile();
        if (projectile) {
            this.duelCreateProjectile(skill, projectile);
        } else {
            // Stage 2 foundation: non-projectile skills will be connected to
            // the existing melee hit pipeline in the next incremental step.
            this._duelAttackTimer = 22;
        }

        return true;
    };

    Game_Actor.prototype.duelCreateProjectile = function(skill, data) {
        this._duelProjectiles = this._duelProjectiles || [];
        var projectile = new ActorDuelProjectile(this, skill, data);
        this._duelProjectiles.push(projectile);
    };

    Game_Actor.prototype.duelUpdateProjectiles = function() {
        this._duelProjectiles = this._duelProjectiles || [];
        for (var i = 0; i < this._duelProjectiles.length; i++) {
            var p = this._duelProjectiles[i];
            if (p) p.update();
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

    // Keep the Stage 1 update loop intact and extend it with Stage 2 state.
    var _Game_Actor_duelUpdateStamina = Game_Actor.prototype.duelUpdateStamina;
    Game_Actor.prototype.duelUpdateStamina = function() {
        _Game_Actor_duelUpdateStamina.call(this);
        this.duelUpdateCombo();
        if (this._duelSkillTimer > 0) this._duelSkillTimer--;
        this.duelUpdateProjectiles();
    };

    // A projectile/skill must also be considered busy so movement cannot
    // interrupt it.
    var _Game_Actor_duelIsBusy = Game_Actor.prototype.duelIsBusy;
    Game_Actor.prototype.duelIsBusy = function() {
        return _Game_Actor_duelIsBusy.call(this) || this._duelSkillTimer > 0;
    };

    var _Game_Actor_duelCanMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        return _Game_Actor_duelCanMove.call(this) && this._duelSkillTimer <= 0;
    };

    // ---------------------------------------------------------------------
    // Projectile sprite
    // ---------------------------------------------------------------------
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
        this._speed = data.speed || CFG2.defaultProjectileSpeed;
        this._lifetime = data.lifetime || CFG2.defaultProjectileLifetime;
        this._reach = data.reach || CFG2.defaultProjectileReach;
        this.x = owner._duelX;
        this.y = owner._duelY - 60;
        this.anchor.x = 0.5;
        this.anchor.y = 1;
        this._direction = this._target && this._target._duelX >= owner._duelX ? 1 : -1;
        this.scale.x = this._direction;
        this._loadBitmap();
        this._buildFallback();
    };

    ActorDuelProjectile.prototype._loadBitmap = function() {
        this._bitmap = ImageManager.loadBitmap('img/battlers/', CFG2.projectileImage, 0, true);
        this._bitmap.addLoadListener(this._onBitmapLoaded.bind(this));
    };

    ActorDuelProjectile.prototype._onBitmapLoaded = function() {
        if (!this._bitmap.isReady()) return;
        this.bitmap = this._bitmap;
        this._cw = this.bitmap.width / CFG2.projectileCols;
        this._ch = this.bitmap.height / CFG2.projectileRows;
        this.ox = this._cw / 2;
        this.oy = this._ch;
        this._useSheet = true;
    };

    ActorDuelProjectile.prototype._buildFallback = function() {
        this._fallback = new Bitmap(56, 36);
        this._fallback.fillRect(8, 8, 40, 20);
        this._fallback.fillRect(16, 4, 24, 28);
        this.bitmap = this._fallback;
        this.ox = 28;
        this.oy = 30;
        this._useSheet = false;
    };

    ActorDuelProjectile.prototype.update = function() {
        if (this.finished()) return;

        this._life++;
        this._animTimer++;

        if (this._useSheet && this.bitmap) {
            if (this._animTimer >= 7) {
                this._animTimer = 0;
                this._pattern = (this._pattern + 1) % CFG2.projectileCols;
            }
            var sx = this._pattern * this._cw;
            var sy = Number(this._data.pose || 0) * this._ch;
            this.setFrame(sx, sy, this._cw, this._ch);
        }

        this.x += this._speed * this._direction;
        this.opacity = Math.min(255, this.opacity + 24);

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
            damage = Math.floor(damage * (Number(PluginManager.parameters('Galv_ActorDuel_MV')['Guard Damage Rate'] || 0.25)));
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

    // ---------------------------------------------------------------------
    // Plugin command: add_skill
    // ---------------------------------------------------------------------
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
        if (actor && skillId > 0) {
            actor.duelAddSkill(skillId, buttons);
        }
    };

    // ---------------------------------------------------------------------
    // Input hooks for relative combo directions.
    // ---------------------------------------------------------------------
    function relativeDirection(actor, rawDirection) {
        var target = actor.duelTarget();
        if (!target) return rawDirection;

        var toward = actor._duelX < target._duelX ? 'r' : 'l';
        var away = toward === 'r' ? 'l' : 'r';

        if (rawDirection === 'left') return away;
        if (rawDirection === 'right') return toward;
        return rawDirection;
    }

    function tryActorSkill(actor) {
        var skillId = actor.duelFindSkill();
        if (skillId > 0 && actor.duelStartSkill(skillId)) {
            actor._duelCombo = [];
            actor._duelComboTimer = 0;
            return true;
        }
        return false;
    }

    function stage2MoveHook(actor, direction) {
        if (!actor || actor._duelDead) return;
        if (direction === 'left' || direction === 'right') {
            actor.duelAddComboInput(relativeDirection(actor, direction));
        } else {
            actor.duelAddComboInput(direction === 'up' ? 'u' : 'd');
        }
    }

    // The Stage 1 scene owns movement. Wrap duelMove so every actual movement
    // input also enters the Stage 2 combo buffer, without replacing Stage 1.
    var _Game_Actor_duelMove = Game_Actor.prototype.duelMove;
    Game_Actor.prototype.duelMove = function(direction) {
        if (direction !== 'none' && this.duelCanMove()) {
            stage2MoveHook(this, direction);
        }
        _Game_Actor_duelMove.call(this, direction);
    };

    // Attack input is handled by Stage 1 through duelStartAttack. We expose a
    // helper for the Stage 2 scene patch below.
    Game_Actor.prototype.duelTryStage2Skill = function() {
        return tryActorSkill(this);
    };

    // ---------------------------------------------------------------------
    // Scene input wrapper
    // ---------------------------------------------------------------------
    var _Scene_ActorDuel_updateFighter1 = Scene_ActorDuel.prototype._updateFighter1;
    if (_Scene_ActorDuel_updateFighter1) {
        Scene_ActorDuel.prototype._updateFighter1 = function() {
            _Scene_ActorDuel_updateFighter1.call(this);
        };
    }

    // Current Stage 1 scene reads the attack key directly. Wrap the actual
    // duelStartAttack method so a registered combo skill has priority over the
    // normal attack, while preserving all existing Stage 1 behavior.
    var _Game_Actor_duelStartAttack = Game_Actor.prototype.duelStartAttack;
    Game_Actor.prototype.duelStartAttack = function() {
        if (this.duelTryStage2Skill()) return;
        _Game_Actor_duelStartAttack.call(this);
    };

    // ---------------------------------------------------------------------
    // Spriteset integration
    // ---------------------------------------------------------------------
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
                if (projectile && !projectile.parent) {
                    this._stage2ProjectileLayer.addChild(projectile);
                }
                if (projectile) sprites.push(projectile);
            }, this);
        }, this);

        var children = this._stage2ProjectileLayer.children.slice();
        children.forEach(function(child) {
            if (sprites.indexOf(child) < 0) {
                this._stage2ProjectileLayer.removeChild(child);
            }
        }, this);
    };

})();
