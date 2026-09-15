/*:
 * @plugindesc Galv Actor Duel Mini Game - RPG Maker MV conversion, Stage 1
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @param Victory Variable
 * @type variable
 * @default 1
 *
 * @param Quit Switch
 * @type switch
 * @default 1
 *
 * @param Basic Attack Skill
 * @type skill
 * @default 1
 *
 * @param Max Stamina
 * @type number
 * @default 500
 *
 * @param Stamina Cost
 * @type number
 * @default 100
 *
 * @param Stamina Regen
 * @type number
 * @decimals 2
 * @default 1.3
 *
 * @param Guard Damage Rate
 * @type number
 * @decimals 2
 * @default 0.25
 *
 * @param Attack Range
 * @type number
 * @default 45
 *
 * @param P1 X
 * @type number
 * @default 100
 *
 * @param P2 X
 * @type number
 * @default 455
 *
 * @param Ground Y
 * @type number
 * @default 310
 *
 * @param Gravity
 * @type number
 * @decimals 2
 * @default 5
 *
 * @param Walk Speed
 * @type number
 * @decimals 2
 * @default 4
 *
 * @param BGM
 * @default Battle6
 *
 * @param Victory ME
 * @default Victory1
 *
 * @param Battleback 1
 * @default Ship
 *
 * @param Battleback 2
 * @default Ship
 *
 * @param Start Text 1
 * @default Ready?
 *
 * @param Start Text 2
 * @default FIGHT!
 *
 * @param Winner Text
 * @default  WINS!
 *
 * @param Match Over Text
 * @default MATCH OVER!
 *
 * @help
 * Galv Actor Duel Mini Game - RPG Maker MV / Stage 1
 * ---------------------------------------------------
 * Reimplementação em JavaScript do núcleo do sistema de duelo do
 * Galv's Actor Duel Mini Game v1.5 (VX Ace) para RPG Maker MV.
 *
 * Controles:
 *   P1: Setas = mover/pular, Z/Espaço = atacar, Baixo = defender,
 *       Cima = pular, Esc/X = menu de saída.
 *   P2 (modo 2P): W/A/S/D = mover, R = pular, S = defender,
 *       Ctrl = atacar, Esc = menu de saída.
 *
 * Notetags em atores:
 *   <fimage: NomeDaImagem>
 *   <fatks: 4,5,6>
 *   <fse miss: Wind7>
 *   <fhit: 115>
 *   <frange: 45>
 *   <fviconeanim>
 *
 * Plugin commands:
 *   ActorDuel set_fighters 1 2
 *   ActorDuel set_fbacks Ship Ship
 *   ActorDuel set_fmusic Battle6
 *   ActorDuel set_fmode 0      (0 = P1 vs AI, 1 = P1 vs P2)
 *   ActorDuel start
 *
 * Script calls (equivalente):
 *   this.setFighters(1, 2);
 *   this.setFBacks('Ship', 'Ship');
 *   this.setFMusic('Battle6');
 *   this.setFMode(0);
 *   this.startActorDuel();
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV';
    var params = PluginManager.parameters(pluginName);

    // Mapeia W/A/S/D, Ctrl, R, X, Y para uso no modo 2 jogadores.
    // Importante: NÃO remapeamos Z (já é 'ok' no MV).
    Input.keyMapper[87] = 'w';        // W
    Input.keyMapper[65] = 'a';        // A
    Input.keyMapper[83] = 's';        // S
    Input.keyMapper[68] = 'd';        // D
    Input.keyMapper[17] = 'control';  // Ctrl
    Input.keyMapper[82] = 'r';        // R
    Input.keyMapper[88] = 'x';        // X (também é 'escape' por padrão, ok)
    Input.keyMapper[89] = 'y';        // Y

    var CFG = {
        victoryVariable: Number(params['Victory Variable'] || 1),
        quitSwitch: Number(params['Quit Switch'] || 1),
        attackSkill: Number(params['Basic Attack Skill'] || 1),
        maxStamina: Number(params['Max Stamina'] || 500),
        staminaCost: Number(params['Stamina Cost'] || 100),
        staminaRegen: Number(params['Stamina Regen'] || 1.3),
        guardDamage: Number(params['Guard Damage Rate'] || 0.25),
        range: Number(params['Attack Range'] || 45),
        p1X: Number(params['P1 X'] || 100),
        p2X: Number(params['P2 X'] || 455),
        groundY: Number(params['Ground Y'] || 310),
        gravity: Number(params['Gravity'] || 5),
        walkSpeed: Number(params['Walk Speed'] || 4),
        bgm: String(params['BGM'] || 'Battle6'),
        victoryMe: String(params['Victory ME'] || 'Victory1'),
        battleback1: String(params['Battleback 1'] || 'Ship'),
        battleback2: String(params['Battleback 2'] || 'Ship'),
        start1: String(params['Start Text 1'] || 'Ready?'),
        start2: String(params['Start Text 2'] || 'FIGHT!'),
        winnerText: String(params['Winner Text'] || ' WINS!'),
        matchOverText: String(params['Match Over Text'] || 'MATCH OVER!')
    };

    // ---------------------------------------------------------------------
    // Game_System: estado do duelo
    // ---------------------------------------------------------------------
    var _Game_System_initialize = Game_System.prototype.initialize;
    Game_System.prototype.initialize = function() {
        _Game_System_initialize.call(this);
        this.actorDuel = this._defaultDuelData();
    };

    Game_System.prototype._defaultDuelData = function() {
        return {
            fighters: [],
            mode: 0,
            backs: [CFG.battleback1, CFG.battleback2],
            music: CFG.bgm,
            victoryMe: CFG.victoryMe
        };
    };

    function duelSystem() {
        if (!$gameSystem) return null;
        if (!$gameSystem.actorDuel) {
            $gameSystem.actorDuel = $gameSystem._defaultDuelData();
        }
        return $gameSystem.actorDuel;
    }

    // ---------------------------------------------------------------------
    // Notetags
    // ---------------------------------------------------------------------
    function noteMatch(note, regex, fallback) {
        var m = String(note || '').match(regex);
        return m ? m[1] : fallback;
    }

    function actorDuelData(actor) {
        var note = actor ? actor.note : '';
        var attacks = noteMatch(note, /<fatks:\s*([^>]+)>/i, '4');
        return {
            image: noteMatch(note, /<fimage:\s*([^>]+)>/i, ''),
            attacks: attacks.split(',').map(function(v) {
                return Number(v.trim());
            }),
            missSe: noteMatch(note, /<fse miss:\s*([^>]+)>/i, 'Wind7'),
            hitAnim: Number(noteMatch(note, /<fhit:\s*([^>]+)>/i, '115')),
            range: Number(noteMatch(note, /<frange:\s*([^>]+)>/i, String(CFG.range))),
            vIconAnim: /<fviconeanim>/i.test(note)
        };
    }

    // ---------------------------------------------------------------------
    // Game_Actor: estado de duelo
    // ---------------------------------------------------------------------
    Game_Actor.prototype.initActorDuel = function(x, player) {
        this.duelReset();

        this._duelX = x;
        this._duelPlayer = player || 1;
        this._duelFacing = player === 1 ? 1 : -1;
    };

    Game_Actor.prototype.duelData = function() {
        return actorDuelData(this.actor());
    };

    Game_Actor.prototype.duelIsBusy = function() {
        return this._duelAttackTimer > 0 ||
               this._duelHitTimer > 0 ||
               this._duelDead;
    };

    Game_Actor.prototype.duelCanMove = function() {
        return !this._duelDead &&
               this._duelHitTimer <= 0 &&
               this._duelAttackTimer <= 0;
    };

    Game_Actor.prototype.duelReset = function() {
        this.clearActions();

        this._duelX = 0;
        this._duelY = CFG.groundY;
        this._duelVY = 0;
        this._duelSpeed = CFG.walkSpeed;
        this._duelPlayer = 1;
        this._duelPose = 0;
        this._duelAttackTimer = 0;
        this._duelAttackHit = false;
        this._duelHitTimer = 0;
        this._duelJumping = false;
        this._duelGuarding = false;
        this._duelDead = false;
        this._duelStamina = CFG.maxStamina;
        this._duelAttackIndex = 0;
        this._duelFacing = 1;
        this._duelFlash = 0;
        this._duelKnockback = 0;

        if (this.isDead()) {
            this.revive();
        }
        this.setHp(this.mhp);
    };

    Game_Actor.prototype.duelUpdateStamina = function() {
        if (this._duelDead) return;
        if (this._duelAttackTimer > 0 || this._duelGuarding) return;

        this._duelStamina += CFG.staminaRegen;
        if (this._duelStamina > CFG.maxStamina) {
            this._duelStamina = CFG.maxStamina;
        }
    };

    Game_Actor.prototype.duelSpendStamina = function(cost) {
        if (this._duelStamina < cost) return false;
        this._duelStamina -= cost;
        return true;
    };

    Game_Actor.prototype.duelJump = function() {
        if (this._duelDead) return;
        if (!this._duelJumping && this._duelY >= CFG.groundY) {
            this._duelJumping = true;
            this._duelVY = -14;
            this._duelPose = 8;
        }
    };

    Game_Actor.prototype.duelStartGuard = function(value) {
        if (this._duelDead || this._duelHitTimer > 0 || this._duelAttackTimer > 0) {
            this._duelGuarding = false;
            return;
        }

        this._duelGuarding = !!value;

        if (this._duelGuarding) {
            this._duelPose = 7;
        } else if (this._duelPose === 7) {
            this._duelPose = 0;
        }
    };

    Game_Actor.prototype.duelStartAttack = function() {
        if (this._duelDead) return;
        if (this._duelHitTimer > 0) return;
        if (this._duelGuarding) return;
        if (this._duelAttackTimer > 0) return;
        if (!this.duelSpendStamina(CFG.staminaCost)) return;

        var data = this.duelData();
        var poses = data.attacks.length ? data.attacks : [4];

        this._duelAttackIndex = (this._duelAttackIndex + 1) % poses.length;
        this._duelPose = poses[this._duelAttackIndex];
        this._duelAttackTimer = 12;
        this._duelAttackHit = false;
    };

    Game_Actor.prototype.duelApplyAttack = function(target) {
        if (!target || target._duelDead) return;

        var distance = Math.abs(this._duelX - target._duelX);
        var range = this.duelData().range || CFG.range;

        if (distance > range) {
            var missSe = this.duelData().missSe;
            if (missSe) {
                AudioManager.playSe({ name: missSe, volume: 90, pitch: 100, pan: 0 });
            }
            return;
        }

        var skill = $dataSkills[CFG.attackSkill];
        if (!skill) return;

        var action = new Game_Action(this);
        action.setSkill(skill.id);

        var damage = action.makeDamageValue(target, false);

        if (target._duelGuarding) {
            damage = Math.floor(damage * CFG.guardDamage);
        }

        if (damage < 0) damage = 0;

        target.duelTakeDamage(damage, this);
    };

    Game_Actor.prototype.duelTakeDamage = function(damage, attacker) {
        if (this._duelDead) return;

        this.gainHp(-Math.floor(damage));

        this._duelHitTimer = 12;
        this._duelFlash = 8;
        this._duelGuarding = false;
        this._duelAttackTimer = 0;
        this._duelAttackHit = true;

        if (attacker) {
            var dir = this._duelX >= attacker._duelX ? 1 : -1;
            this._duelKnockback = dir * 8;
        }

        if (this.isDead()) {
            this._duelDead = true;
            this._duelPose = 13;
            this._duelVY = -5;
        } else {
            this._duelPose = 10;
        }
    };

    Game_Actor.prototype.duelUpdatePhysics = function() {
        if (this._duelDead) {
            this._duelVY += CFG.gravity * 0.5;
            this._duelY += this._duelVY;
            if (this._duelY > CFG.groundY) {
                this._duelY = CFG.groundY;
                this._duelVY = 0;
            }
            return;
        }

        if (this._duelHitTimer > 0) {
            this._duelHitTimer--;
            this._duelX += this._duelKnockback;
            this._duelKnockback *= 0.75;

            if (this._duelHitTimer === 0) {
                this._duelPose = 0;
            }
        }

        if (this._duelJumping) {
            this._duelVY += CFG.gravity;
            this._duelY += this._duelVY;

            if (this._duelY >= CFG.groundY) {
                this._duelY = CFG.groundY;
                this._duelVY = 0;
                this._duelJumping = false;

                if (this._duelAttackTimer <= 0 &&
                    this._duelHitTimer <= 0 &&
                    !this._duelGuarding) {
                    this._duelPose = 0;
                }
            }
        }
    };

    Game_Actor.prototype.duelUpdateAttack = function(target) {
        if (this._duelAttackTimer <= 0) return;

        this._duelAttackTimer--;

        // Aplica o dano uma única vez, no meio da animação.
        if (this._duelAttackTimer === 8 && !this._duelAttackHit) {
            this._duelAttackHit = true;
            this.duelApplyAttack(target);
        }

        if (this._duelAttackTimer <= 0) {
            if (!this._duelDead && this._duelHitTimer <= 0) {
                this._duelPose = 0;
            }
        }
    };

    Game_Actor.prototype.duelMove = function(direction) {
        if (!this.duelCanMove()) return;
        if (this._duelGuarding) return;
        if (this._duelJumping) return;

        this._duelX += direction * this._duelSpeed;
    };

    Game_Actor.prototype.duelClamp = function(minX, maxX) {
        if (this._duelX < minX) this._duelX = minX;
        if (this._duelX > maxX) this._duelX = maxX;
    };

    // Helper para HUD externo (opcional).
    Game_Actor.prototype.duelStaminaRate = function() {
        if (CFG.maxStamina <= 0) return 0;
        var r = this._duelStamina / CFG.maxStamina;
        return Math.max(0, Math.min(1, r));
    };

    // ---------------------------------------------------------------------
    // AI
    // ---------------------------------------------------------------------
    function ActorDuelAI(actor, opponent) {
        this.actor = actor;
        this.opponent = opponent;
        this.actionTimer = 0;
        this.jumpTimer = 0;
    }

    ActorDuelAI.prototype.update = function() {
        if (!this.actor || !this.opponent) return;
        if (this.actor._duelDead || this.opponent._duelDead) return;

        this.actionTimer--;
        this.jumpTimer--;

        var distance = this.opponent._duelX - this.actor._duelX;
        var absDistance = Math.abs(distance);
        var direction = distance >= 0 ? 1 : -1;

        this.actor._duelFacing = direction;

        if (this.actor._duelHitTimer > 0) return;
        if (this.actor._duelAttackTimer > 0) return;

        if (this.actionTimer > 0) {
            if (absDistance > CFG.range + 25) {
                this.actor.duelMove(direction);
            }
            return;
        }

        this.actionTimer = 8 + Math.floor(Math.random() * 16);

        if (this.jumpTimer <= 0 && Math.random() < 0.08) {
            this.actor.duelJump();
            this.jumpTimer = 45 + Math.floor(Math.random() * 60);
            return;
        }

        if (absDistance <= CFG.range + 10 &&
            this.opponent._duelAttackTimer > 0 &&
            Math.random() < 0.55) {
            this.actor.duelStartGuard(true);
            return;
        }

        this.actor.duelStartGuard(false);

        if (absDistance <= CFG.range + 5) {
            if (Math.random() < 0.65) {
                this.actor.duelStartAttack();
                return;
            }

            if (Math.random() < 0.5) {
                this.actor.duelMove(-direction);
            } else {
                this.actor.duelMove(direction);
            }
            return;
        }

        if (absDistance > CFG.range + 20) {
            this.actor.duelMove(direction);
            return;
        }

        if (Math.random() < 0.5) {
            this.actor.duelMove(direction);
        }
    };

    // ---------------------------------------------------------------------
    // Sprite do lutador
    // ---------------------------------------------------------------------
    function Sprite_ActorDuelFighter() {
        this.initialize.apply(this, arguments);
    }

    Sprite_ActorDuelFighter.prototype = Object.create(Sprite_Base.prototype);
    Sprite_ActorDuelFighter.prototype.constructor = Sprite_ActorDuelFighter;

    Sprite_ActorDuelFighter.prototype.initialize = function(actor) {
        Sprite_Base.prototype.initialize.call(this);

        this._actor = actor;
        this._imageName = '';

        this.anchor.x = 0.5;
        this.anchor.y = 1.0;

        this.scale.x = 2;
        this.scale.y = 2;

        this._loadBitmap();
    };

    Sprite_ActorDuelFighter.prototype._loadBitmap = function() {
        var data = this._actor.duelData();
        var filename = data.image;

        if (filename) {
            this._imageName = filename;
            this.bitmap = ImageManager.loadBitmap('img/battlers/', filename, 0, true);
        } else {
            this._imageName = 'SV_' + this._actor.actorId();
            this.bitmap = ImageManager.loadSvActor(this._actor.actorId());
        }
    };

    Sprite_ActorDuelFighter.prototype.update = function() {
        Sprite_Base.prototype.update.call(this);

        if (!this._actor) return;

        this.x = Math.round(this._actor._duelX);
        this.y = Math.round(this._actor._duelY);

        // Espelha baseado no facing. Lembre-se: anchor.x = 0.5.
        this.scale.x = this._actor._duelFacing >= 0 ? 2 : -2;

        if (this._actor._duelFlash > 0) {
            this._actor._duelFlash--;
            this.opacity = 180;
        } else {
            this.opacity = 255;
        }

        this._updateFrame();
    };

    Sprite_ActorDuelFighter.prototype._updateFrame = function() {
        if (!this.bitmap || !this.bitmap.isReady()) return;

        var pose = Number(this._actor._duelPose || 0);

        // Folha estilo Holder: 4 colunas x 14 linhas.
        var cols = 4;
        var rows = 14;

        var pw = Math.floor(this.bitmap.width / cols);
        var ph = Math.floor(this.bitmap.height / rows);

        if (pw <= 0 || ph <= 0) return;

        var frame = 0;

        if (this._actor._duelAttackTimer > 0) {
            frame = Math.floor((12 - this._actor._duelAttackTimer) / 3);
        } else if (this._actor._duelHitTimer > 0) {
            frame = Math.floor((12 - this._actor._duelHitTimer) / 3);
        } else if (this._actor._duelJumping) {
            frame = 1;
        } else {
            frame = Math.floor(Graphics.frameCount / 12) % 4;
        }

        frame = Math.max(0, Math.min(3, frame));
        pose = Math.max(0, Math.min(rows - 1, pose));

        this.setFrame(frame * pw, pose * ph, pw, ph);
    };

    // ---------------------------------------------------------------------
    // Sombra
    // ---------------------------------------------------------------------
    function Sprite_ActorDuelShadow() {
        this.initialize.apply(this, arguments);
    }

    Sprite_ActorDuelShadow.prototype = Object.create(Sprite.prototype);
    Sprite_ActorDuelShadow.prototype.constructor = Sprite_ActorDuelShadow;

    Sprite_ActorDuelShadow.prototype.initialize = function(actor) {
        Sprite.prototype.initialize.call(this);

        this._actor = actor;

        this.bitmap = new Bitmap(96, 24);
        this.anchor.x = 0.5;
        this.anchor.y = 0.5;

        var ctx = this.bitmap._context;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(48, 12, 42, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        this.bitmap._setDirty();
    };

    Sprite_ActorDuelShadow.prototype.update = function() {
        Sprite.prototype.update.call(this);

        if (!this._actor) return;

        this.x = Math.round(this._actor._duelX);
        this.y = CFG.groundY + 5;

        var height = Math.max(0, CFG.groundY - this._actor._duelY);
        var factor = 1 - Math.min(height / 180, 0.65);

        this.scale.x = factor;
        this.scale.y = factor;
    };

    // ---------------------------------------------------------------------
    // Janela de status (nome / HP / ST)
    // ---------------------------------------------------------------------
    function Window_ActorDuelStatus() {
        this.initialize.apply(this, arguments);
    }

    Window_ActorDuelStatus.prototype = Object.create(Window_Base.prototype);
    Window_ActorDuelStatus.prototype.constructor = Window_ActorDuelStatus;

    Window_ActorDuelStatus.prototype.initialize = function(actor, x, y, width) {
        Window_Base.prototype.initialize.call(this, x, y, width || 300, 92);

        this._actor = actor;
        this.opacity = 0;

        this._lastHp = -1;
        this._lastStam = -1;
        this.refresh();
    };

    Window_ActorDuelStatus.prototype.update = function() {
        Window_Base.prototype.update.call(this);

        if (!this._actor) return;

        var hp = this._actor.hp;
        var st = Math.floor(this._actor._duelStamina);

        if (hp !== this._lastHp || st !== this._lastStam) {
            this._lastHp = hp;
            this._lastStam = st;
            this.refresh();
        }
    };

    Window_ActorDuelStatus.prototype.refresh = function() {
        this.contents.clear();

        if (!this._actor) return;

        var width = this.contents.width;

        this.changeTextColor(this.systemColor());
        this.drawText(this._actor.name(), 0, 0, width, 'center');

        this.changeTextColor(this.normalColor());

        var hpRate = this._actor.mhp > 0
            ? Math.max(0, Math.min(1, this._actor.hp / this._actor.mhp))
            : 0;

        this.drawGauge(0, 28, width, hpRate, this.hpGaugeColor1(), this.hpGaugeColor2());
        this.drawText(String(this._actor.hp), 0, 26, width, 'center');

        var stRate = this._actor.duelStaminaRate();
        this.drawGauge(0, 54, width, stRate, this.mpGaugeColor1(), this.mpGaugeColor2());
        this.drawText('ST', 4, 52, 40, 'left');
        this.drawText(Math.floor(this._actor._duelStamina), 0, 52, width - 4, 'right');
    };

    // ---------------------------------------------------------------------
    // Janela de comando (menu de saída)
    // ---------------------------------------------------------------------
    function Window_ActorDuelCommand() {
        this.initialize.apply(this, arguments);
    }

    Window_ActorDuelCommand.prototype = Object.create(Window_Command.prototype);
    Window_ActorDuelCommand.prototype.constructor = Window_ActorDuelCommand;

    Window_ActorDuelCommand.prototype.initialize = function() {
        Window_Command.prototype.initialize.call(this, 0, 0);

        this.openness = 0;
        this.deactivate();
        this.select(0);
    };

    Window_ActorDuelCommand.prototype.makeCommandList = function() {
        this.addCommand('Quit Match', 'quit');
        this.addCommand('Cancel', 'cancel');
    };

    Window_ActorDuelCommand.prototype.windowWidth = function() {
        return 240;
    };

    Window_ActorDuelCommand.prototype.windowHeight = function() {
        return this.fittingHeight(2);
    };

    // ---------------------------------------------------------------------
    // Cena do duelo
    // ---------------------------------------------------------------------
    function Scene_ActorDuel() {
        this.initialize.apply(this, arguments);
    }

    Scene_ActorDuel.prototype = Object.create(Scene_Base.prototype);
    Scene_ActorDuel.prototype.constructor = Scene_ActorDuel;

    Scene_ActorDuel.prototype.initialize = function() {
        Scene_Base.prototype.initialize.call(this);

        this._phase = 0;     // 0 = intro, 1 = luta, 2 = resultado
        this._count = 0;
        this._winner = 0;
        this._finished = false;

        this._actor1 = null;
        this._actor2 = null;
        this._ai = null;

        this._messageSprite = null;
        this._previousBgm = null;
    };

    Scene_ActorDuel.prototype.create = function() {
        Scene_Base.prototype.create.call(this);

        this._createBackground();
        this._createActors();

        if (this._finished) return;

        this._createSprites();

        this._windowLayer = new WindowLayer();
        this.addChild(this._windowLayer);

        this._createStatusWindows();
        this._createCommandWindow();

        this._startMusic();
    };

    Scene_ActorDuel.prototype._createBackground = function() {
        var data = duelSystem();

        this._backSprite1 = new Sprite();
        this._backSprite2 = new Sprite();

        var name1 = data.backs[0] || CFG.battleback1;
        var name2 = data.backs[1] || CFG.battleback2;

        this._backSprite1.bitmap = ImageManager.loadBattleback1(name1);
        this._backSprite2.bitmap = ImageManager.loadBattleback2(name2);

        this.addChild(this._backSprite1);
        this.addChild(this._backSprite2);
    };

    Scene_ActorDuel.prototype._createActors = function() {
        var data = duelSystem();
        var ids = data.fighters || [];

        if (ids.length < 2) {
            console.warn('[ActorDuel] fighters não definidos. Use set_fighters.');
            this._finished = true;
            return;
        }

        this._actor1 = $gameActors.actor(Number(ids[0]));
        this._actor2 = $gameActors.actor(Number(ids[1]));

        if (!this._actor1 || !this._actor2) {
            console.warn('[ActorDuel] Atores inválidos: ' + ids.join(', '));
            this._finished = true;
            return;
        }

        this._actor1.initActorDuel(CFG.p1X, 1);
        this._actor2.initActorDuel(CFG.p2X, 2);

        if (data.mode === 0) {
            this._ai = new ActorDuelAI(this._actor2, this._actor1);
        }
    };

    Scene_ActorDuel.prototype._createSprites = function() {
        this._shadow1 = new Sprite_ActorDuelShadow(this._actor1);
        this._shadow2 = new Sprite_ActorDuelShadow(this._actor2);

        this.addChild(this._shadow1);
        this.addChild(this._shadow2);

        this._sprite1 = new Sprite_ActorDuelFighter(this._actor1);
        this._sprite2 = new Sprite_ActorDuelFighter(this._actor2);

        this.addChild(this._sprite1);
        this.addChild(this._sprite2);
    };

    Scene_ActorDuel.prototype._createStatusWindows = function() {
        this._status1 = new Window_ActorDuelStatus(this._actor1, 20, 20, 300);
        this._status2 = new Window_ActorDuelStatus(
            this._actor2,
            Graphics.boxWidth - 320,
            20,
            300
        );

        this.addWindow(this._status1);
        this.addWindow(this._status2);
    };

    Scene_ActorDuel.prototype._createCommandWindow = function() {
        this._commandWindow = new Window_ActorDuelCommand();

        this._commandWindow.x =
            (Graphics.boxWidth - this._commandWindow.width) / 2;
        this._commandWindow.y =
            (Graphics.boxHeight - this._commandWindow.height) / 2;

        this._commandWindow.setHandler('quit', this.commandQuit.bind(this));
        this._commandWindow.setHandler('cancel', this.commandCancel.bind(this));

        this.addWindow(this._commandWindow);
    };

    Scene_ActorDuel.prototype._startMusic = function() {
        var data = duelSystem();

        this._previousBgm = AudioManager.saveBgm();

        AudioManager.playBgm({
            name: data.music || CFG.bgm,
            volume: 90,
            pitch: 100,
            pan: 0
        }, 0);
    };

    Scene_ActorDuel.prototype.update = function() {
        Scene_Base.prototype.update.call(this);

        if (this._finished) return;

        if (this._phase === 0) {
            this._updateStart();
        } else if (this._phase === 1) {
            this._updateFight();
        } else if (this._phase === 2) {
            this._updateResult();
        }
    };

    // ---- Fase 0: introdução ----
    Scene_ActorDuel.prototype._updateStart = function() {
        this._count++;

        if (this._count === 1) this._showMessage(CFG.start1);
        if (this._count === 45) this._showMessage(CFG.start2);

        if (this._count >= 75) {
            this._phase = 1;
            this._count = 0;
            this._clearMessage();
        }
    };

    Scene_ActorDuel.prototype._showMessage = function(text) {
        this._clearMessage();

        var bitmap = new Bitmap(Graphics.boxWidth, 100);
        bitmap.fontSize = 42;
        bitmap.fontBold = true;
        bitmap.textColor = '#ffffff';
        bitmap.outlineColor = '#000000';
        bitmap.outlineWidth = 8;
        bitmap.drawText(text, 0, 0, Graphics.boxWidth, 80, 'center');

        this._messageSprite = new Sprite(bitmap);
        this._messageSprite.x = 0;
        this._messageSprite.y = (Graphics.boxHeight - 100) / 2;

        this.addChild(this._messageSprite);
    };

    Scene_ActorDuel.prototype._clearMessage = function() {
        if (this._messageSprite) {
            this.removeChild(this._messageSprite);
            this._messageSprite.bitmap = null;
            this._messageSprite = null;
        }
    };

    // ---- Fase 1: luta ----
    Scene_ActorDuel.prototype._updateFight = function() {
        if (!this._actor1 || !this._actor2) {
            this._finishMatch(0);
            return;
        }

        this._updateFacing();
        this._updatePlayer1();
        this._updatePlayer2();

        if (this._ai) this._ai.update();

        this._actor1.duelUpdateAttack(this._actor2);
        this._actor2.duelUpdateAttack(this._actor1);

        this._actor1.duelUpdatePhysics();
        this._actor2.duelUpdatePhysics();

        this._actor1.duelUpdateStamina();
        this._actor2.duelUpdateStamina();

        this._applyArenaLimits();
        this._separateActors();
        this._checkVictory();

        if (Input.isTriggered('cancel') && this._commandWindow.openness === 0) {
            this._openQuitMenu();
        }
    };

    Scene_ActorDuel.prototype._updatePlayer1 = function() {
        var actor = this._actor1;
        if (!actor || actor._duelDead) return;

        if (Input.isTriggered('up')) actor.duelJump();

        if (Input.isPressed('down')) {
            actor.duelStartGuard(true);
        } else {
            actor.duelStartGuard(false);
        }

        if (actor.duelCanMove()) {
            if (Input.isPressed('left')) actor.duelMove(-1);
            else if (Input.isPressed('right')) actor.duelMove(1);
        }

        if (Input.isTriggered('ok')) actor.duelStartAttack();
    };

    Scene_ActorDuel.prototype._updatePlayer2 = function() {
        var data = duelSystem();
        if (data.mode !== 1) return;

        var actor = this._actor2;
        if (!actor || actor._duelDead) return;

        if (Input.isTriggered('r')) actor.duelJump();

        if (Input.isPressed('s')) {
            actor.duelStartGuard(true);
        } else {
            actor.duelStartGuard(false);
        }

        if (actor.duelCanMove()) {
            if (Input.isPressed('a')) actor.duelMove(-1);
            else if (Input.isPressed('d')) actor.duelMove(1);
        }

        if (Input.isTriggered('control')) actor.duelStartAttack();
    };

    Scene_ActorDuel.prototype._updateFacing = function() {
        if (!this._actor1 || !this._actor2) return;

        if (this._actor1._duelX <= this._actor2._duelX) {
            this._actor1._duelFacing = 1;
            this._actor2._duelFacing = -1;
        } else {
            this._actor1._duelFacing = -1;
            this._actor2._duelFacing = 1;
        }
    };

    Scene_ActorDuel.prototype._applyArenaLimits = function() {
        var left = 40;
        var right = Graphics.boxWidth - 40;
        this._actor1.duelClamp(left, right);
        this._actor2.duelClamp(left, right);
    };

    Scene_ActorDuel.prototype._separateActors = function() {
        if (this._actor1._duelDead || this._actor2._duelDead) return;

        var minDistance = 28;
        var distance = this._actor2._duelX - this._actor1._duelX;

        if (Math.abs(distance) >= minDistance) return;

        var amount = (minDistance - Math.abs(distance)) / 2;

        if (distance >= 0) {
            this._actor1._duelX -= amount;
            this._actor2._duelX += amount;
        } else {
            this._actor1._duelX += amount;
            this._actor2._duelX -= amount;
        }

        this._applyArenaLimits();
    };

    Scene_ActorDuel.prototype._checkVictory = function() {
        if (this._actor1._duelDead) return this._finishMatch(2);
        if (this._actor2._duelDead) return this._finishMatch(1);
    };

    Scene_ActorDuel.prototype._finishMatch = function(winner) {
        if (this._phase === 2) return;

        this._winner = winner;
        this._phase = 2;
        this._count = 0;

        if (CFG.victoryVariable > 0) {
            $gameVariables.setValue(CFG.victoryVariable, winner);
        }

        if (winner === 1) {
            this._showMessage(this._actor1.name() + CFG.winnerText);
        } else if (winner === 2) {
            this._showMessage(this._actor2.name() + CFG.winnerText);
        } else {
            this._showMessage(CFG.matchOverText);
        }

        AudioManager.playMe({
            name: duelSystem().victoryMe || CFG.victoryMe,
            volume: 90,
            pitch: 100,
            pan: 0
        });
    };

    // ---- Fase 2: resultado ----
    Scene_ActorDuel.prototype._updateResult = function() {
        this._count++;

        if (Input.isTriggered('ok') || Input.isTriggered('cancel')) {
            this._endScene();
            return;
        }

        if (this._count >= 180) this._endScene();
    };

    // ---- Menu de saída ----
    Scene_ActorDuel.prototype._openQuitMenu = function() {
        if (!this._commandWindow) return;
        if (this._commandWindow.active) return;

        this._commandWindow.open();
        this._commandWindow.activate();
        this._commandWindow.select(0);
    };

    Scene_ActorDuel.prototype.commandQuit = function() {
        this._commandWindow.close();
        this._commandWindow.deactivate();

        if (CFG.quitSwitch > 0) {
            $gameSwitches.setValue(CFG.quitSwitch, true);
        }

        this._endScene();
    };

    Scene_ActorDuel.prototype.commandCancel = function() {
        this._commandWindow.close();
        this._commandWindow.deactivate();
    };

    Scene_ActorDuel.prototype._endScene = function() {
        if (this._finished) return;
        this._finished = true;

        if (this._previousBgm) {
            AudioManager.replayBgm(this._previousBgm);
        } else {
            AudioManager.stopBgm();
        }

        SceneManager.pop();
    };

    Scene_ActorDuel.prototype.terminate = function() {
        Scene_Base.prototype.terminate.call(this);

        this._clearMessage();

        if (this._actor1) {
            this._actor1._duelGuarding = false;
            this._actor1._duelAttackTimer = 0;
        }
        if (this._actor2) {
            this._actor2._duelGuarding = false;
            this._actor2._duelAttackTimer = 0;
        }
    };

    // ---------------------------------------------------------------------
    // Plugin commands e script calls
    // ---------------------------------------------------------------------
    var _Game_Interpreter_pluginCommand = Game_Interpreter.prototype.pluginCommand;

    Game_Interpreter.prototype.pluginCommand = function(command, args) {
        _Game_Interpreter_pluginCommand.call(this, command, args);

        if (String(command).toLowerCase() !== 'actorduel') return;

        args = args || [];
        var sub = String(args[0] || '').toLowerCase();

        switch (sub) {
            case 'set_fighters':
                if (args.length >= 3) this.setFighters(Number(args[1]), Number(args[2]));
                break;
            case 'set_fbacks':
                if (args.length >= 3) this.setFBacks(String(args[1]), String(args[2]));
                break;
            case 'set_fmusic':
                if (args.length >= 2) this.setFMusic(String(args[1]));
                break;
            case 'set_fmode':
                if (args.length >= 2) this.setFMode(Number(args[1]));
                break;
            case 'start':
                this.startActorDuel();
                break;
        }
    };

    Game_Interpreter.prototype.setFighters = function(id1, id2) {
        duelSystem().fighters = [Number(id1), Number(id2)];
    };

    Game_Interpreter.prototype.setFBacks = function(b1, b2) {
        duelSystem().backs = [String(b1), String(b2)];
    };

    Game_Interpreter.prototype.setFMusic = function(name) {
        duelSystem().music = String(name);
    };

    Game_Interpreter.prototype.setFMode = function(mode) {
        duelSystem().mode = Number(mode) === 1 ? 1 : 0;
    };

    Game_Interpreter.prototype.startActorDuel = function() {
        SceneManager.push(window.Scene_ActorDuel);
    };

    // ---------------------------------------------------------------------
    // API global
    // ---------------------------------------------------------------------
    window.GalvActorDuelMV = {
        config: CFG,
        system: duelSystem,

        setFighters: function(id1, id2) {
            duelSystem().fighters = [Number(id1), Number(id2)];
        },

        setFbacks: function(b1, b2) {
            duelSystem().backs = [String(b1), String(b2)];
        },

        setFmusic: function(name) {
            duelSystem().music = String(name);
        },

        setFmode: function(mode) {
            duelSystem().mode = Number(mode) === 1 ? 1 : 0;
        },

        start: function(id1, id2, mode) {
            if (id1 !== undefined && id2 !== undefined) {
                duelSystem().fighters = [Number(id1), Number(id2)];
            }
            if (mode !== undefined) {
                duelSystem().mode = Number(mode) === 1 ? 1 : 0;
            }
            SceneManager.push(window.Scene_ActorDuel);
        }
    };

    window.Scene_ActorDuel = Scene_ActorDuel;
    window.GalvActorDuelMV.Scene_ActorDuel = Scene_ActorDuel;

})();