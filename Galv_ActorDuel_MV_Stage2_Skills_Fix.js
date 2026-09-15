/*:
 * @plugindesc Galv Actor Duel Mini Game - Stage 2 Skills input fix
 * @author OpenAI
 * @help
 * Carregue DEPOIS de Galv_ActorDuel_MV_Stage2_Skills.js.
 * Corrige a captura das direções relativas usando os valores numéricos
 * realmente enviados pelo Stage 1 (1 = direita, -1 = esquerda).
 */

(function() {
    'use strict';

    var _Game_Actor_duelMove = Game_Actor.prototype.duelMove;

    Game_Actor.prototype.duelMove = function(direction) {
        if (direction !== 0 && this.duelCanMove && this.duelCanMove() &&
            this.duelAddComboInput) {
            var target = this.duelTarget ? this.duelTarget() : null;
            var toward = target && this._duelX < target._duelX ? 'r' : 'l';
            var away = toward === 'r' ? 'l' : 'r';

            if (direction > 0) {
                this.duelAddComboInput(toward);
            } else if (direction < 0) {
                this.duelAddComboInput(away);
            }
        }

        _Game_Actor_duelMove.call(this, direction);
    };

})();
