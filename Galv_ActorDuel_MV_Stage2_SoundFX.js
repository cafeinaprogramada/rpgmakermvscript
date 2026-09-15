/*:
 * @plugindesc Galv Actor Duel MV - Stage 2 Sound FX for skill release, damage and defeat
 * @author OpenAI / based on Galv's Actor Duel Mini Game v1.5
 *
 * @help
 * Adds three layers of audio feedback to the Actor Duel system.
 *
 * 1. Skill release sound
 *    Put this notetag on an RPG Maker MV Skill:
 *      <fse: Skill_Rasengan>
 *
 *    The sound is played when the skill is successfully released,
 *    whether or not the skill hit its hitbox.
 *
 * 2. Damage sound
 *    A global SE is played whenever duel damage actually reduces HP.
 *    This covers both normal attacks and skills.
 *
 * 3. Defeat sound
 *    A global SE is played once when a fighter's HP reaches 0.
 *
 * Sound files are read from the project's audio/se/ folder using
 * RPG Maker MV's AudioManager.playSe system.
 *
 * Recommended future custom structure:
 *   audio/se/Skill_Rasengan.ogg
 *   audio/se/Skill_Fireball.ogg
 *   audio/se/Skill_SwordSlash.ogg
 *   audio/se/Damage_Hit.ogg
 *   audio/se/Defeat.ogg
 *
 * The filenames in the Plugin Manager and <fse> notetags are written
 * WITHOUT the .ogg extension.
 *
 * The default parameters intentionally use standard RPG Maker MV
 * sample/default-style SE names so the system can be tested before
 * custom sounds are prepared.
 *
 * Plugin order:
 *   Galv_ActorDuel_MV.js
 *   Stage 1 plugins...
 *   Galv_ActorDuel_MV_Stage2_MultiSkills.js
 *   Galv_ActorDuel_MV_Stage2_SoundFX.js  <-- this plugin
 *
 * @param Skill Release SE
 * @type file
 * @dir audio/se/
 * @default Attack1
 *
 * @param Damage SE
 * @type file
 * @dir audio/se/
 * @default Damage1
 *
 * @param Defeat SE
 * @type file
 * @dir audio/se/
 * @default Collapse1
 *
 * @param Skill SE Volume
 * @type number
 * @min 0
 * @max 100
 * @default 100
 *
 * @param Damage SE Volume
 * @type number
 * @min 0
 * @max 100
 * @default 100
 *
 * @param Defeat SE Volume
 * @type number
 * @min 0
 * @max 100
 * @default 100
 *
 * @param Skill SE Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 *
 * @param Damage SE Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 *
 * @param Defeat SE Pitch
 * @type number
 * @min 50
 * @max 150
 * @default 100
 */

(function() {
    'use strict';

    var pluginName = 'Galv_ActorDuel_MV_Stage2_SoundFX';
    var params = PluginManager.parameters(pluginName);

    var DEFAULT_SKILL_SE = String(params['Skill Release SE'] || 'Attack1');
    var DAMAGE_SE = String(params['Damage SE'] || 'Damage1');
    var DEFEAT_SE = String(params['Defeat SE'] || 'Collapse1');

    var SKILL_VOLUME = Number(params['Skill SE Volume'] || 100);
    var DAMAGE_VOLUME = Number(params['Damage SE Volume'] || 100);
    var DEFEAT_VOLUME = Number(params['Defeat SE Volume'] || 100);

    var SKILL_PITCH = Number(params['Skill SE Pitch'] || 100);
    var DAMAGE_PITCH = Number(params['Damage SE Pitch'] || 100);
    var DEFEAT_PITCH = Number(params['Defeat SE Pitch'] || 100);

    function noteValue(note, tag, fallback) {
        var regex = new RegExp('<' + tag + ':\\s*([^>]+)>', 'i');
        var match = String(note || '').match(regex);
        return match ? match[1].trim() : fallback;
    }

    function playSe(name, volume, pitch) {
        name = String(name || '').trim();
        if (!name) return;

        AudioManager.playSe({
            name: name,
            volume: volume,
            pitch: pitch,
            pan: 0
        });
    }

    function skillReleaseSe(skill) {
        if (!skill) return DEFAULT_SKILL_SE;
        return noteValue(skill.note, 'fse', DEFAULT_SKILL_SE);
    }

    // ---------------------------------------------------------------------
    // Skill release sound
    // ---------------------------------------------------------------------
    // MultiSkills remains responsible for the actual skill logic.
    // This wrapper only adds audio feedback when the skill successfully
    // activates, keeping the working skill/hitbox implementation untouched.
    if (Game_Actor.prototype.duelUseSkill) {
        var _duelUseSkill = Game_Actor.prototype.duelUseSkill;
        Game_Actor.prototype.duelUseSkill = function(skillId) {
            skillId = Number(skillId || 0);

            var canUse = false;
            var skill = null;
            if (this.duelCanUseSkill && $dataSkills && $dataSkills[skillId]) {
                skill = $dataSkills[skillId];
                canUse = this.duelCanUseSkill(skillId);
            }

            var result = _duelUseSkill.call(this, skillId);

            if (result && canUse) {
                playSe(skillReleaseSe(skill), SKILL_VOLUME, SKILL_PITCH);
            }

            return result;
        };
    }

    // ---------------------------------------------------------------------
    // Damage + defeat sounds
    // ---------------------------------------------------------------------
    // duelTakeDamage is the central damage entry point used by the duel
    // system, so this covers normal attacks as well as skill damage.
    if (Game_Actor.prototype.duelTakeDamage) {
        var _duelTakeDamage = Game_Actor.prototype.duelTakeDamage;
        Game_Actor.prototype.duelTakeDamage = function(damage, attacker) {
            var hpBefore = Number(this.hp || 0);
            var defeatAlreadyPlayed = !!this._duelDefeatSePlayed;

            _duelTakeDamage.call(this, damage, attacker);

            var hpAfter = Number(this.hp || 0);
            var actualDamage = hpAfter < hpBefore;

            if (actualDamage) {
                playSe(DAMAGE_SE, DAMAGE_VOLUME, DAMAGE_PITCH);
            }

            if (!defeatAlreadyPlayed && hpBefore > 0 && hpAfter <= 0) {
                playSe(DEFEAT_SE, DEFEAT_VOLUME, DEFEAT_PITCH);
                this._duelDefeatSePlayed = true;
            }
        };
    }

    // Reset the one-shot defeat flag whenever a new duel is initialized.
    if (Game_Actor.prototype.duelReset) {
        var _duelReset = Game_Actor.prototype.duelReset;
        Game_Actor.prototype.duelReset = function() {
            _duelReset.call(this);
            this._duelDefeatSePlayed = false;
        };
    }
})();
