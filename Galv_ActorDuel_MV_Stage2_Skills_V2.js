/*:
 * @plugindesc Galv Actor Duel Mini Game - Stage 2 Skills/Projectiles V2
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 * @help
 * Carregue DEPOIS dos plugins Stage 1.
 *
 * Skill notetags:
 * <fpose: x>
 * <fcost: x>
 * <fse: SoundName>
 * <fp: pose,speed,animationId,lifetime,reach>
 *
 * Register:
 * ActorDuel add_skill 1 2 r
 *
 * TESTE VISUAL STAGE 2:
 * O projétil usa uma representação grande e colorida temporária.
 * A colisão ainda está desativada neste teste.
 */
(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_Skills_V2';
    var params = PluginManager.parameters(pluginName);
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
        var note = skill && skill.note ? skill.note : '';
        var m = String(note).match(regex);
        return m ? m[1].trim() : fallback;
    }
    function skillPose(skill) { return Number(noteValue(skill, /<fpose:\s*([^>]+)>/i, '7')); }
    function skillCost(skill) { return Number(noteValue(skill, /<fcost:\s*([^>]+)>/i, '100')); }
    function skillSe(skill) { return noteValue(skill, /<fse:\s*([^>]+)>/i, 'Wind7'); }
    function skillProjectile(skill) {
        var value = noteValue(skill, /<fp:\s*([^>]+)>/i, null);
        if (!value) return null;
        var v = value.split(',').map(function(x) { return Number(x.trim()); });
        return {
            pose: Number(v[0] || 0),
            speed: Number(v[1] || CFG.speed),
            animationId: Number(v[2] || 0),
            lifetime: Number(v[3] || CFG.life),
            reach: Number(v[4] || CFG.reach)
        };
    }

    var _reset = Game_Actor.prototype.duelReset;
    Game_Actor.prototype.duelReset = function() {
        _reset.call(this);
        this._duelComboSkills = this._duelComboSkills || [];
        this._duelCombo = [];
        this._duelComboTimer = 0;
        this._duelProjectiles = [];
        this._duelSkillTimer = 0;
        this._duelSkillUsed = null;
    };

    Game_Actor.prototype.duelAddSkill = function(skillId, buttons) {
        this._duelComboSkills = this._duelComboSkills || [];
        this._duelComboSkills.push({ skillId: Number(skillId), buttons: buttons || [] });
    };

    Game_Actor.prototype.duelAddComboInput = function(direction) {
        this._duelCombo = this._duelCombo || [];
        this._duelCombo.push(direction);
        this._duelComboTimer = CFG.comboWindow;
    };

    Game_Actor.prototype.duelUpdateCombo = function() {
        if (!this._duelCombo) this._duelCombo = [];
        if (this._duelComboTimer > 0) this._duelComboTimer--;
        if (this._duelComboTimer <= 0) this._duelCombo = [];
    };

    Game_Actor.prototype.duelFindSkill = function() {
        var input = this._duelCombo || [];
        var list = this._duelComboSkills || [];
        for (var i = 0; i < list.length; i++) {
            var combo = list[i].buttons || [];
            if (!combo.length || combo.length > input.length) continue;
            var recent = input.slice(input.length - combo.length);
            var ok = true;
            for (var j = 0; j < combo.length; j++) {
                if (recent[j] !== combo[j]) { ok = false; break; }
            }
            if (ok) return list[i].skillId;
        }
        return 0;
    };

    Game_Actor.prototype.duelCanUseSkill = function(skill) {
        return !!skill && !this._duelDead && this._duelHitTimer <= 0 &&
            !this._duelGuarding && this._duelAttackTimer <= 0 &&
            this._duelSkillTimer <= 0 && this._duelStamina >= skillCost(skill);
    };

    Game_Actor.prototype.duelTarget = function() {
        if (!$gameSystem || !$gameSystem.actorDuel) return null;
        var ids = $gameSystem.actorDuel.fighters || [];
        if (ids.length < 2) return null;
        var other = Number(ids[0]) === this.actorId() ? Number(ids[1]) : Number(ids[0]);
        return $gameActors.actor(other);
    };

    Game_Actor.prototype.duelStartSkill = function(skillId) {
        var skill = $dataSkills[Number(skillId)];
        if (!this.duelCanUseSkill(skill)) return false;

        this._duelStamina -= skillCost(skill);
        this._duelSkillUsed = skill;
        this._duelSkillTimer = 22;
        this._duelPose = skillPose(skill);

        var se = skillSe(skill);
        if (se) AudioManager.playSe({name: se, volume: 90, pitch: 100, pan: 0});

        var projectile = skillProjectile(skill);
        if (projectile) {
            this._duelProjectiles.push(new ActorDuelProjectile(this, skill, projectile));
        } else {
            this._duelAttackTimer = 22;
        }
        return true;
    };

    var _updateStamina = Game_Actor.prototype.duelUpdateStamina;
    Game_Actor.prototype.duelUpdateStamina = function() {
        _updateStamina.call(this);
        this.duelUpdateCombo();
        if (this._duelSkillTimer > 0) this._duelSkillTimer--;
        this.duelUpdateProjectiles();
    };

    Game_Actor.prototype.duelUpdateProjectiles = function() {
        if (!this._duelProjectiles) this._duelProjectiles = [];
        for (var i = 0; i < this._duelProjectiles.length; i++) {
            if (this._duelProjectiles[i]) this._duelProjectiles[i].update();
        }
        this._duelProjectiles = this._duelProjectiles.filter(function(p) {
            if (!p || p.finished()) { if (p) p.dispose(); return false; }
            return true;
        });
    };

    var _busy = Game_Actor.prototype.duelIsBusy;
    Game_Actor.prototype.duelIsBusy = function() {
        return _busy.call(this) || this._duelSkillTimer > 0;
    };
    var _canMove = Game_Actor.prototype.duelCanMove;
    Game_Actor.prototype.duelCanMove = function() {
        return _canMove.call(this) && this._duelSkillTimer <= 0;
    };

    function ActorDuelProjectile(owner, skill, data) { this.initialize.apply(this, arguments); }
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
        this._speed = Number(data.speed) || CFG.speed;
        this._lifetime = Math.max(90, Number(data.lifetime) || CFG.life);
        this._reach = Number(data.reach) || CFG.reach;
        this._testVisual = true;

        // Nasce claramente à frente do dono, e não em cima dele.
        this._direction = this._target && this._target._duelX >= owner._duelX ? 1 : -1;
        this.x = owner._duelX + (this._direction * 55);
        this.y = owner._duelY - 70;
        this.anchor.set(0.5, 0.5);
        this.scale.x = this._direction;

        this._load();
    };

    ActorDuelProjectile.prototype._load = function() {
        // Fallback deliberadamente enorme para o teste visual.
        this._fallback = new Bitmap(100, 100);
        this._fallback.fillRect(12, 38, 76, 24);
        this._fallback.fillRect(38, 12, 24, 76);
        this._fallback.fillRect(25, 25, 50, 50);
        this._fallback.fillRect(5, 47, 90, 6);
        this.bitmap = this._fallback;
        this._fallbackReady = true;

        // Tentamos carregar FightSkills, mas o teste não depende dele.
        this._sheetReady = false;
        this._sheet = ImageManager.loadBitmap('img/battlers/', CFG.image, 0, true);
        this._sheet.addLoadListener(this._sheetLoaded.bind(this));
    };

    ActorDuelProjectile.prototype._sheetLoaded = function() {
        if (!this._sheet || !this._sheet.isReady()) return;
        var cw = Math.floor(this._sheet.width / CFG.cols);
        var ch = Math.floor(this._sheet.height / CFG.rows);
        if (cw <= 0 || ch <= 0) return;
        this.bitmap = this._sheet;
        this._cw = cw;
        this._ch = ch;
        this._sheetReady = true;
        this._setFrame();
    };

    ActorDuelProjectile.prototype._setFrame = function() {
        if (!this._sheetReady) return;
        var row = Math.max(0, Math.min(CFG.rows - 1, Number(this._data.pose || 0)));
        this.setFrame(this._pattern * this._cw, row * this._ch, this._cw, this._ch);
    };

    ActorDuelProjectile.prototype.update = function() {
        Sprite.prototype.update.call(this);
        if (this.finished()) return;

        this._life++;
        this._animTimer++;

        // Durante o teste, o fallback permanece grande e animado.
        if (this._sheetReady && this._animTimer >= 7) {
            this._animTimer = 0;
            this._pattern = (this._pattern + 1) % CFG.cols;
            this._setFrame();
        }

        this.x += this._speed * this._direction;

        // TESTE VISUAL: não colide nem causa dano nesta etapa.
        // Apenas percorre a arena e desaparece pelo tempo/limite da tela.
    };

    ActorDuelProjectile.prototype.finished = function() {
        return this._life >= this._lifetime || this.x < -120 || this.x > Graphics.width + 120;
    };
    ActorDuelProjectile.prototype.dispose = function() { this.bitmap = null; };

    var _move = Game_Actor.prototype.duelMove;
    Game_Actor.prototype.duelMove = function(direction) {
        if (direction !== 0 && this.duelCanMove() && this.duelAddComboInput) {
            var target = this.duelTarget();
            var toward = target && this._duelX < target._duelX ? 'r' : 'l';
            this.duelAddComboInput(direction > 0 ? toward : (toward === 'r' ? 'l' : 'r'));
        }
        _move.call(this, direction);
    };

    Game_Actor.prototype.duelTryStage2Skill = function() {
        var id = this.duelFindSkill();
        if (id > 0 && this.duelStartSkill(id)) {
            this._duelCombo = [];
            this._duelComboTimer = 0;
            return true;
        }
        return false;
    };

    var _attack = Game_Actor.prototype.duelStartAttack;
    Game_Actor.prototype.duelStartAttack = function() {
        if (this.duelTryStage2Skill()) return;
        _attack.call(this);
    };

    var _command = Game_Interpreter.prototype.pluginCommand;
    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _command.call(this, command, args);
        if (String(command).toLowerCase() !== 'actorduel') return;
        if (!args || String(args[0]).toLowerCase() !== 'add_skill') return;
        var actor = $gameActors.actor(Number(args[1] || 0));
        var skillId = Number(args[2] || 0);
        if (actor && skillId > 0) actor.duelAddSkill(skillId, args.slice(3).map(function(x) { return String(x).toLowerCase(); }));
    };

    var _createSprites = Scene_ActorDuel.prototype._createSprites;
    Scene_ActorDuel.prototype._createSprites = function() {
        _createSprites.call(this);
        this._stage2ProjectileLayer = new Sprite();
        this._stage2ProjectileLayer.z = 25;
        this.addChild(this._stage2ProjectileLayer);
    };

    var _sceneUpdate = Scene_ActorDuel.prototype.update;
    Scene_ActorDuel.prototype.update = function() {
        _sceneUpdate.call(this);
        if (!this._stage2ProjectileLayer) return;
        var ids = [];
        if (this._actor1) ids.push(this._actor1.actorId());
        if (this._actor2) ids.push(this._actor2.actorId());
        var live = [];
        ids.forEach(function(id) {
            var actor = $gameActors.actor(id);
            if (!actor || !actor._duelProjectiles) return;
            actor._duelProjectiles.forEach(function(p) {
                if (p && !p.parent) this._stage2ProjectileLayer.addChild(p);
                if (p) live.push(p);
            }, this);
        }, this);
        this._stage2ProjectileLayer.children.slice().forEach(function(child) {
            if (live.indexOf(child) < 0) this._stage2ProjectileLayer.removeChild(child);
        }, this);
    };
})();