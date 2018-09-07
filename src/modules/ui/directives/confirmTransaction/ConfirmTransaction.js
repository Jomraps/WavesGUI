/* eslint-disable no-console */
(function () {
    'use strict';

    /**
     * @param Base
     * @param {Waves} waves
     * @param $attrs
     * @param {$mdDialog} $mdDialog
     * @param {ModalManager} modalManager
     * @param {User} user
     * @param {$rootScope.Scope} $scope
     * @param {app.utils} utils
     * @param {ValidateService} validateService
     * @returns {ConfirmTransaction}
     */
    const controller = function (Base, waves, $attrs, $mdDialog, modalManager, user, $scope, utils, validateService) {

        const ds = require('data-service');
        const { TRANSACTION_TYPE_NUMBER } = require('@waves/signature-adapter');
        // const { libs } = require('@waves/signature-generator');

        class ConfirmTransaction extends Base {

            /**
             * @type {function}
             */
            onTxSent = null;
            /**
             * @type {*|string}
             */
            locale = $attrs.locale || 'app.ui';
            /**
             * @type {number}
             */
            step = 0;
            /**
             * @type {boolean}
             */
            showValidationErrors = false;
            /**
             * @type {Array}
             */
            errors = [];
            /**
             * @type {object}
             */
            preparedTx = null;
            /**
             * @type {string}
             */
            txId = '';
            /**
             * @type {string}
             */
            type = user.userType;
            /**
             * @type {boolean}
             */
            loadingSignFromDevice = false;
            /**
             * @type {boolean}
             */
            deviceSignFail = false;
            /**
             * @type {boolean}
             */
            showAuthCode = false;
            /**
             * @type {Signable}
             * @private
             */
            _signable = null;
            /**
             * @type {boolean}
             * @private
             */
            _has2fa = user.has2fa;
            /**
             * @type {Deferred}
             * @private
             */
            _getCodeDefer = null;

            constructor() {
                super();

                this.observe('tx', this._onChangeTx);
                this.observe('showValidationErrors', this._showErrors);
            }

            /**
             * @return {boolean}
             */
            canSignFromDevice() {
                return this.type && this.type !== 'seed' || false;
            }

            /**
             * @return {Promise<string>}
             */
            getTxId() {
                return this._signable.getId();
            }

            signTx() {
                this.loadingSignFromDevice = this.canSignFromDevice();
                return this._signable.getDataForApi();
            }

            getTxData() {
                this.getTxId()
                    .then(() => {
                        this.deviceSignFail = false;
                        this.loadingSignFromDevice = this.canSignFromDevice();
                        $scope.$digest();
                        return this.signTx();
                    })
                    .then(preparedTx => {
                        this.preparedTx = preparedTx;

                        if (this.canSignFromDevice() && !this.wasDestroed) {
                            this.confirm();
                        }
                    })
                    .catch(() => {
                        this.loadingSignFromDevice = false;
                        this.deviceSignFail = true;
                        $scope.$digest();
                    });
            }

            trySign() {
                return this.getTxData();
            }

            $postLink() {
                this.trySign();
            }

            onFillCode(/* code */) {
                // TODO get signature from Dimas's serevice
                // TODO get base64 from bytes
                // libs.base64.fromByteArray();
                // ds.fetch('https://localhost')
                this._broadcast().then(this._getCodeDefer.resolve, this._getCodeDefer.reject);
            }

            confirm() {
                return this.sendTransaction().then(({ id }) => {
                    this.showAuthCode = false;
                    this.tx.id = id;
                    this.step++;
                    this.onTxSent({ id });
                    $scope.$apply();
                }).catch((e) => {
                    this.loadingSignFromDevice = false;
                    console.error(e);
                    console.error('Transaction error!');
                    $scope.$apply();
                });
            }

            showTxInfo() {
                $mdDialog.hide();
                setTimeout(() => { // Timeout for routing (if modal has route)
                    modalManager.showTransactionInfo(this.tx.id);
                }, 1000);
            }

            sendTransaction() {
                if (this._has2fa) {
                    this.showAuthCode = true;
                    this._getCodeDefer = $.Deferred();

                    this._getCodeDefer.promise().always(() => {
                        this._getCodeDefer = null;
                    });

                    return this._getCodeDefer.promise();
                } else {
                    return this._broadcast();
                }
            }

            _broadcast() {
                const txType = ConfirmTransaction.upFirstChar(this.tx.transactionType);
                const amount = ConfirmTransaction.toBigNumber(this.tx.amount);

                return ds.broadcast(this.preparedTx).then((data) => {
                    analytics.push(
                        'Transaction', `Transaction.${txType}.${WavesApp.type}`,
                        `Transaction.${txType}.${WavesApp.type}.Success`, amount
                    );
                    return data;
                }, (error) => {
                    analytics.push(
                        'Transaction', `Transaction.${txType}.${WavesApp.type}`,
                        `Transaction.${txType}.${WavesApp.type}.Error`, amount
                    );
                    return Promise.reject(error);
                });
            }

            /**
             * @private
             */
            _onChangeTx() {
                const timestamp = ds.utils.normalizeTime(this.tx.timestamp || Date.now());
                const data = { ...this.tx, timestamp };
                const type = this.tx.type;

                this._signable = ds.signature.getSignatureApi()
                    .makeSignable({ type, data });

                this._signable.getId().then(id => {
                    this.txId = id;
                    $scope.$digest();
                });
            }

            /**
             * @private
             */
            _showErrors() {
                if (this.showValidationErrors) {
                    if (this.tx.transactionType === TRANSACTION_TYPE_NUMBER.TRANSFER) {
                        const errors = [];
                        Promise.all([
                            waves.node.assets.userBalances()
                                .then((list) => list.map(({ available }) => available))
                                .then((list) => {
                                    const hash = utils.toHash(list, 'asset.id');
                                    const amount = this.tx.amount;
                                    if (!hash[amount.asset.id] ||
                                        hash[amount.asset.id].lt(amount) ||
                                        amount.getTokens().lte(0)) {

                                        errors.push({
                                            literal: 'confirmTransaction.send.errors.balance.invalid'
                                        });
                                    }
                                }),
                            utils.resolve(utils.when(validateService.wavesAddress(this.tx.recipient)))
                                .then(({ state }) => {
                                    if (!state) {
                                        errors.push({
                                            literal: 'confirmTransaction.send.errors.recipient.invalid'
                                        });
                                    }
                                })
                        ]).then(() => {
                            this.errors = errors;
                            $scope.$apply();
                        });
                    }
                } else {
                    this.errors = [];
                }
            }

            /**
             * @param {string} str
             * @returns {string}
             */
            static upFirstChar(str) {
                return str.charAt(0).toUpperCase() + str.slice(1);
            }

            static toBigNumber(amount) {
                return amount && amount.getTokens().toFixed() || undefined;
            }

        }

        return new ConfirmTransaction();
    };

    controller.$inject = [
        'Base',
        'waves',
        '$attrs',
        '$mdDialog',
        'modalManager',
        'user',
        '$scope',
        'utils',
        'validateService'
    ];

    angular.module('app.ui').component('wConfirmTransaction', {
        bindings: {
            tx: '<',
            onClickBack: '&',
            onTxSent: '&',
            noBackButton: '<',
            warning: '<',
            showValidationErrors: '<',
            referrer: '<'
        },
        templateUrl: 'modules/ui/directives/confirmTransaction/confirmTransaction.html',
        transclude: false,
        controller
    });
})();
