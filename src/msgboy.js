var _ = require('underscore');
var $ = jQuery = require('jquery-browserify');
var Backbone = require('backbone-browserify');
var BackboneIndexedDB = require('./backbone-indexeddb.js');

if (typeof Msgboy === "undefined") {
    var Msgboy = {};
}

// Extending Msgboy with the Backbone events
_.extend(Msgboy, Backbone.Events);

// Logs messages to the console
Msgboy.log =  {
    levels: {
        RAW: 0,
        DEBUG: 10,
        INFO: 20,
        ERROR: 30,
    },
    _log: Function.prototype.bind.call(console.log, console),
    raw: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.RAW) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('raw');
            this._log.apply(console, args);
        }
    },
    debug: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.DEBUG) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('debug');
            this._log.apply(console, args);
        }
    },
    info: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.INFO) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('info');
            this._log.apply(console, args);
        }
    },
    error: function () {
        if (Msgboy.log.debugLevel <= Msgboy.log.levels.ERROR) {
            var args = Array.prototype.slice.call(arguments);  
            args.unshift('error');
            this._log.apply(console, args);
        }
    },
}

// Attributes
Msgboy.log.debugLevel = Msgboy.log.levels.DEBUG; // We may want to adjust that in production!
Msgboy.autoReconnect = true;
Msgboy.currentNotification = null;
Msgboy.messageStack = [];
Msgboy.connectionTimeout = null;
Msgboy.reconnectDelay = 1;
Msgboy.connection = null;
Msgboy.infos = {};
Msgboy.inbox = null;
Msgboy.reconnectionTimeout = null;

// Returns the environment in which this msgboy is running
Msgboy.environment = function () {
    if (chrome.i18n.getMessage("@@extension_id") === "ligglcbjgpiljeoenbhnnfdipkealakb") {
        return "production";
    }
    else {
        return "development";
    }
};

// Runs the msgboy (when the document was loaded and when we were able to extract the msgboy's information)
Msgboy.run =  function () {
    window.onload = function () {
        chrome.management.get(chrome.i18n.getMessage("@@extension_id"), function (extension_infos) {
            Msgboy.infos = extension_infos;
            Msgboy.trigger("loaded");
        });
    }
};

// Handles XMPP Connections
Msgboy.onConnect = function (status) {
    var msg = '';
    if (status === Strophe.Status.CONNECTING) {
        msg = 'Msgboy is connecting.';
    } else if (status === Strophe.Status.CONNFAIL) {
        msg = 'Msgboy failed to connect.';
        Msgboy.reconnectDelay += 1;
        if (Msgboy.autoReconnect) {
            Msgboy.autoReconnect();
        }
    } else if (status === Strophe.Status.AUTHFAIL) {
        msg = 'Msgboy couldn\'t authenticate. Please check your credentials';
        Msgboy.autoReconnect = false; // We need to open the settings tab
        chrome.tabs.create({
            url: chrome.extension.getURL('/views/html/options.html'),
            selected: true
        });
    } else if (status === Strophe.Status.DISCONNECTING) {
        msg = 'Msgboy is disconnecting.'; // We may want to time this out.
    } else if (status === Strophe.Status.DISCONNECTED) {
        if (Msgboy.autoReconnect) {
            Msgboy.autoReconnect();
        }
        msg = 'Msgboy is disconnected. Reconnect in ' + Msgboy.helper.maths.number.fibonacci(Msgboy.reconnectDelay) + ' seconds.';
    } else if (status === Strophe.Status.CONNECTED) {
        Msgboy.autoReconnect = true; // Set autoReconnect to true only when we've been connected :)
        msg = 'Msgboy is connected.';
        Msgboy.connection.caps.sendPresenceWithCaps(); // Send presence!
        // Makes sure there is no missing subscription.
        Msgboy.resumeSubscriptions();
    }
    Msgboy.log.debug(msg);
};

// Reconnects the Msgboy
Msgboy.autoReconnect = function () {
    Msgboy.reconnectDelay = Math.min(Msgboy.reconnectDelay + 1, 10); // We max at one attempt every minute.
    if (!Msgboy.reconnectionTimeout) {
        Msgboy.reconnectionTimeout = setTimeout(function () {
            Msgboy.reconnectionTimeout = null;
            Msgboy.connect();
        }, Msgboy.helper.maths.number.fibonacci(Msgboy.reconnectDelay) * 1000);
    }
};

// Connects the XMPP Client
// It also includes a timeout that tries to reconnect when we could not connect in less than 1 minute.
Msgboy.connect = function () {
    var password = Msgboy.inbox.attributes.password;
    var jid = Msgboy.inbox.attributes.jid + "@msgboy.com/" + Msgboy.infos.version;
    Msgboy.connection.connect(jid, password, this.onConnect);
};

// Uploads the content of the database. this will be used for analysis of the dataset o determine a better algorithm.
// It is perfectly anonymous and currentl not used.
Msgboy.uploadData = function () {
    var archive = new Archive();
    archive.fetch({ created_at: [new Date().getTime(), 0]});
    archive.bind('reset', function () {
        $("#log").text(JSON.stringify(archive.toJSON()));
        Msgboy.helper.uploader.upload(Msgboy.inbox.attributes.jid, archive.toJSON());
    });
};

// Shows a popup notification
Msgboy.notify = function (message) {
    // Open a notification window if needed!
    if (!Msgboy.currentNotification) {
        url = chrome.extension.getURL('/views/html/notification.html');
        Msgboy.currentNotification = window.webkitNotifications.createHTMLNotification(url);
        Msgboy.currentNotification.onclose = function () {
            Msgboy.currentNotification = null;
        };
        Msgboy.currentNotification.ready = false;
        Msgboy.currentNotification.show();
        Msgboy.messageStack.push(message);
    }
    else {
        chrome.extension.sendRequest({
            signature: "notify",
            params: message
        }, function (response) {
            // Nothing to do.
        });
    }
    return Msgboy.currentNotification;
};

// Subscribes to a feed.
Msgboy.subscribe = function (url, force, callback) {
    // First, let's check if we have a subscription for this.
    var subscription = new Subscription({id: url});
    
    subscription.fetchOrCreate(function () {
        // Looks like there is a subscription.
        if ((subscription.needsRefresh() && subscription.attributes.state === "unsubscribed") || force) {
            subscription.setState("subscribing");
            subscription.bind("subscribing", function () {
                Msgboy.log.debug("subscribing to", url);
                Msgboy.connection.superfeedr.subscribe(url, function (result, feed) {
                    Msgboy.log.debug("subscribed to", url);
                    subscription.setState("subscribed");
                });
            });
            subscription.bind("subscribed", function () {
                callback(true);
            });
        }
        else {
            Msgboy.log.debug("Nothing to do for", url, "(", subscription.attributes.state , ")");
            callback(false);
        }
    });
};

// Unsubscribes from a feed.
Msgboy.unsubscribe = function (url, callback) {
    var subscription = new Subscription({id: url});
    subscription.fetchOrCreate(function () {
        subscription.setState("unsubscribing");
        subscription.bind("unsubscribing", function () {
            Msgboy.log.debug("unsubscribing from", url);
            Msgboy.connection.superfeedr.unsubscribe(url, function (result) {
                Msgboy.log.debug("unsubscribed", url);
                subscription.setState("unsubscribed");
            });
        });
        subscription.bind("unsubscribed", function () {
            callback(true);
        });
    });
};

// Makes sure there is no 'pending' susbcriptions.
Msgboy.resumeSubscriptions = function () {
    var subscriptions  = new Subscriptions();
    subscriptions.bind("add", function (subs) {
        Msgboy.log.debug("subscribing to", subs.id);
        Msgboy.connection.superfeedr.subscribe(subs.id, function (result, feed) {
            Msgboy.log.debug("subscribed to", subs.id);
            subs.setState("subscribed");
        });
    });
    subscriptions.pending();
    setTimeout(function () {
        Msgboy.resumeSubscriptions(); // Let's retry in 10 minutes.
    }, 1000 * 60 * 10);
};

exports.Msgboy = Msgboy;
