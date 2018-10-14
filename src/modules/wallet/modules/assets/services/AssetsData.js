(function () {
    'use strict';

    /**
     * @param {User} user
     * @param {app.utils.decorators} decorators
     * @return {AssetsData}
     */
    const factory = function (user, decorators) {

        class AssetsData {

            getGraphOptions() {
                return {
                    grid: {
                        x: false,
                        y: false
                    },
                    series: [
                        {
                            dataset: 'values',
                            key: 'rate',
                            label: 'Rate',
                            color: '#209cd8',
                            type: ['area']
                        },
                        {
                            dataset: 'values',
                            key: 'rate',
                            label: 'Rate',
                            color: '#9ec9ed',
                            type: ['line']
                        }
                    ],
                    axes: {
                        x: {
                            key: 'timestamp',
                            type: 'date',
                            ticks: 4
                        },
                        y: {
                            ticks: 4,
                            padding: {
                                max: 4
                            }
                        }
                    },
                    tooltipHook: function(d){
                        if (d) {
                            // d contains the items [{x, y0, y1, raw}, {x, y0, y1, raw}, ...]
                            // for each series that is currently focused
                            d.pop();
                            return {
                                abscissas: new Date(d[0].row.x).toLocaleString().slice(0,-3),
                                rows: d.map(function(s){
                                    return {
                                        label: s.series.label,
                                        value: s.row.y1, // the y value
                                        color: s.series.color,
                                        id: s.series.id
                                    }
                                })
                            }
                        }
                    }
                };
            }

            @decorators.cachable(2)
            _loadData() {
                return ds.fetch('/api/assets-total/balance.json')
                    .then((r) => r.json())
                    .then((data) => data.map((item) => ({ x: new Date(item.x), y: item.y })));
            }

        }

        return new AssetsData();
    };

    factory.$inject = ['user', 'decorators', 'waves', 'utils'];

    angular.module('app.wallet.assets')
        .factory('assetsData', factory);
})();
