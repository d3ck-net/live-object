// Write your package code here!

// Variables exported by this module can be imported by other packages and
// applications. See mongo-object-tests.js for an example of importing.

var _ = require('underscore');

var $ = {
    each: function (a, cbck, c) {

        return _.each(a, function (a, b, c) {
            return cbck(b, a, c);
        }, c);
    }
}

/**
 * Base class to be able to easily save object changes to the db
 * @constructor
 */
var MongoObject = function MongoObject() {
    this.clearId();
};

MongoObject.prototype.getId = function () {
    return this._id ? this._id : this._instanceId;
}
MongoObject.uid = function () {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }

    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
};

MongoObject.prototype.setFromData = function (data) {
    if (data) {
        //delete data.getCollectionName;
        //$.extend(this,data);
        var self = this;
        for (var key in data) {
            var member = data[key];
            if (typeof member !== 'function') {
                self[key] = member;
            }
        }
    }
}

MongoObject.each = function (callback) {
    $.each(MongoObject.allTypes, callback);
}

MongoObject.prototype.clearId = function () {
    delete this._id;
    this._instanceId = MongoObject.uid();
}

/**
 * callback to be ovveridden and called before save operations
 */
MongoObject.prototype.beforeSave = function () {

};

/**
 * returns the name of the associated Collection
 * by default the collection should be named like the class with an added "s"
 * @returns {string}
 */
MongoObject.prototype.getCollectionName = function () {
    return this.constructor.name + "s";
};

MongoObject.escapeKey = function (string) {
    return string.replace(/\./g, "").replace(/\$/g, "");
};

MongoObject.deletedQuery = {_deleted: {$ne: true}};

/**
 * returns the associated Collection
 * @return {Mongo.Collection}
 */
MongoObject.prototype.getCollection = function () {
    //return global[this.getCollectionName()];
    throw "this method shpould be overriden";
};

/**
 * save current object state to database
 * @param {callback} [cb] - optional callback when done
 */
MongoObject.prototype.save = function (cb) {
    var self = this;

    var instanceId = this._instanceId;
    delete this._instanceId; //@TODO secure instance id during insert operations
    if (this._id) {

        this.beforeSave();
        var id = this._id;
        delete this._id;

        this.getCollection().update({_id: id}, {"$set": this}, false, cb);
        this._id = id;

    } else {
        if (Meteor && Meteor.isServer) {
            this._id = this.getCollection().insert(this);
            if (cb) {
                cb(self);
            }
        }
        else {
            this._id = this.getCollection().insert(this, function (err, id) {
                if (err) {
                    console.error("could not save MongoObject", err);
                }
                else {

                    self._id = typeof id === "string" ? id : id.ops[0]._id;
                    if (cb) {
                        cb(self);
                    }
                }
            });
        }
    }
    this._instanceId = instanceId;
};

MongoObject.defaultPublish = function () {
    return {};
};

MongoObject.allTypes = {};

MongoObject.groundCollections = function () {
    $.each(MongoObject.allTypes, function (name, ctor) {
        Ground.Collection(ctor.prototype.getCollection());
    });

    Ground.Collection(Meteor.users);
}
MongoObject.subscribeColletions = function () {

    $.each(MongoObject.allTypes, function (name, ctor) {
        Meteor.subscribe(ctor.prototype.getCollectionName());
    });
}

MongoObject.publishCollections = function () {
    $.each(MongoObject.allTypes, function (name, ctor) {

        var collection = ctor.prototype.getCollection();
        var collectionName = ctor.prototype.getCollectionName();

        collection.allow({
            insert: function () {
                return true;
            },
            update: function () {
                return true;
            },
            remove: function () {
                return true;
            }
        });

        Meteor.publish(collectionName, function (options) {
            var filter = ctor.prototype.mongoObjectOptions.publish ? ctor.prototype.mongoObjectOptions.publish(this) : MongoObject.defaultPublish(this);
            if (options && options.filter) {
                _.extend(filter, options.filter);
            }
            var res = collection.find(filter, options ? options.limit : {});
            // var count = res.count();
            return res;
        });


    });

};

MongoObject.createCollections = function () {
    $.each(MongoObject.allTypes, function (name, ctor) {
    });
}

MongoObject.prototype.onTransform = function () {

}

MongoObject.prototype.mongoObjectOptions = {};

MongoObject.createSubType = function (options) {
    if (typeof options === 'string') {
        options = {name: options};
    }

    var name = options.name;

    if (!name) {
        throw "subTypes mus have a name!";
    }

    var collectionName = name + "s";

    /** create or assign constructor
     *
     * @type {Mongo.Collection}
     */

    var ctor = options.ctor;
    if (!ctor) {
        ctor = new Function(
            "return function " + name + "(data){ this.setFromData(data);}"
        )();
    }
    if (global[name] && global[name] !== ctor) {
        throw "name already taken!";
    }
    global[name] = ctor;

    MongoObject.allTypes[name] = ctor;

    if (!options.prototype) {
        options.prototype = MongoObject;
    }
    var prototype = options.prototype;

    ctor.prototype = new prototype();

    ctor.prototype.getCollectionName = function () {
        return collectionName;
    }

    if (global[collectionName]) {
        throw "name already taken!";
    }

    //options.publish = options.publish ? options.publish : MongoObject.defaultPublish;

    ctor.prototype.mongoObjectOptions = options;


    if (Meteor) {

        var collectionName = ctor.prototype.getCollectionName();

        var collection = new Mongo.Collection(collectionName, {
            transform: function (doc) {
                var obj = new ctor();
                obj.setFromData(doc);
                obj.onTransform();
                return obj;
            }
        });


        var countMethodName = 'MongoObject.' + collectionName + '.count';
        if (Meteor.isServer) {
            var methods = {};
            methods[countMethodName] = function (params) {
                // debugger;
                var filter = ctor.prototype.mongoObjectOptions.publish ? ctor.prototype.mongoObjectOptions.publish(this) : MongoObject.defaultPublish(this);
                if (params.search) {
                    _.extend(filter, params.search);
                }
                return collection.find(filter).count();
            }

            Meteor.methods(methods);

        }


        if (Meteor.isClient) {

            var count = new ReactiveVar(-1);

            collection.count = function (search) {
                var res = count.get();
                var searchString = JSON.stringify(search);
                if (res === -1 || this._lastCountSearch !== searchString) {
                    // debugger;

                    Meteor.call(countMethodName, {search: search}, function (err, res) {
                        count.set(res);
                    });
                    this._lastCountSearch = searchString;
                }

                return res;
            }


        }

        var filter = function (userId, selector) {
            if (selector && typeof selector._deleted === 'undefined') {
                selector._deleted = {$ne: true};
            }
        };

        ctor.prototype.getCollection = function () {
            return collection;
        }
        collection.before.find(filter);
        collection.before.findOne(filter);

        global[collectionName] = collection;

        if (Meteor.isClient) {
        }

        if (Meteor.isServer) {
        }
    }
    else {
        ctor.prototype.getCollection = function () {
            return global[collectionName];
        }
    }

    return ctor;

};

MongoObject.prototype.beforeDelete = function () {

};

MongoObject.prototype.delete = function (cb) {
    this.beforeDelete();
    this._deleted = true;
    this.save();
};


MongoObject.initNode = function (options) {
    if(options.ddp) {
        var deasync = require('deasync');
        MongoObject.each(function (name, type) {
            var collectionName = name + "s";
            global[collectionName] = MongoObject.createDDPWrapper(name, deasync,options.ddp);
        });
    }
}

MongoObject.createDDPWrapper = function (name,deasync,ddp) {
    
    return {
        collectionName: name + 's',
        typeName: name,
        ctor: global[name],
        insert: function (data, cb) {
            var done = false;
            ddp.call('ddpInsert', [{collection: this.collectionName, data: data}], function (err, res) {
                //debugger;
                done = true;
                if (cb) {
                    cb(err, res);
                }
            });
            if (!cb) {
                deasync.loopWhile(function () {
                    return !done;
                });
            }

        },
        update: function (id, data, exclusive, cb) {
            var done = false;

            ddp.call('ddpUpdate', [{collection: this.collectionName, data: data, id: id}], function (err, res) {
                //debugger;
                if (cb) {
                    cb(res);
                }
            });

            if (!cb) {
                deasync.loopWhile(function () {
                    return !done;
                });
            }
        },
        find: function (search, projection, sort, cb) {
            var ret;
            var done = false;

            ddp.call('ddpFind', [{
                collection: this.collectionName,
                search: search,
                projection: projection,
                sort: sort
            }], function (err, res) {
                ret = err ? err : res;
                //debugger;
                done = true;

                if (cb) {
                    cb(res);
                }
            });
            if (!cb) {
                deasync.loopWhile(function () {
                    return !done;
                });
                return ret;
            }
        },
        findOne: function (search, projection, sort, cb) {
            var ret;
            var done = false;

            ddp.call('ddpFindOne', [{
                collection: this.collectionName,
                search: search,
                projection: projection,
                sort: sort
            }], function (err, res) {
                ret = err ? err : res;
                //debugger;
                done = true;

                if (cb) {
                    cb(res);
                }
            });
            if (!cb) {
                deasync.loopWhile(function () {
                    return !done;
                });
                return ret ? new this.ctor(ret) : ret;
            }
        }
    }
};

MongoObject.registerDDPMethods = function()
{
    
    //TODO abstract out admin user.
    Meteor.methods({
        /**
         *
         * @param params
         * @returns {*}
         */
        ddpInsert: function (params) {
            if (this.userId == User.admin._id) {
                var col = global[params.collection];
                var id = col.insert(params.data);
                return id;
            }
            else {
                return false;
            }
        },
        /**
         *
         * @param params
         * @returns {*}
         */
        ddpUpdate: function (params) {
            if (this.userId == User.admin._id) {
                var col = global[params.collection];
                var id = col.update(params.id._id, params.data);
                return id;
            }
            else {
                return false;
            }
        },
        /**
         *
         * @param params
         * @returns {any}
         */
        ddpFind: function (params) {
            var col = global[params.collection];
            var res = col.find(params.search, params.projection, params.sort).fetch();
            return res;
        },
        /**
         *
         * @param params
         * @returns {*|{}|any|192}
         */
        ddpFindOne: function (params) {
            var col = global[params.collection];
            var res = col.findOne(params.search, params.projection, params.sort);
            return res;
        }
    });
};


module.exports = MongoObject;
