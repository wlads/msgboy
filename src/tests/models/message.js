var Message = require('../../models/message.js').Message;

describe('Message', function(){
    before(function() {
        // We need to save a couple fixture messages!
    });
    
    beforeEach(function() {
    });
    
    describe('defaults', function() {
        it('should have a relevance of 0.6', function() {
            var message  = new Message();
            message.get('relevance').should.equal(0.6);
        });

        it('should have a state of new', function() {
            var message  = new Message();
            message.get('state').should.equal("new");
        });
    });
    
    describe('when initializing the message', function() {
        it('should set the value for sourceHost', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceHost').should.equal("msgboy.com");
        });
        it('should set the value for sourceLink', function() {
            var message = new Message({source: {links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}}})
            message.get('sourceLink').should.equal("http://msgboy.com/an/entry");
        });
        it('should set the value for createdAt', function() {
            var message = new Message({})
            message.get('createdAt').should.be.above(new Date().getTime() - 10);
            message.get('createdAt').should.be.below(new Date().getTime() + 10);
        });
        it('should set the value for mainLink', function() {
            var message = new Message({links: {alternate: {"text/html": [{href: "http://msgboy.com/an/entry"}]}}});
            message.get('mainLink').should.equal("http://msgboy.com/an/entry");
        });
        it('should set the value for text to the summary if no content exists', function() {
            var _summary = "summary";
            var message = new Message({summary: _summary});
            message.get('text').should.equal(_summary);
        });
        it('should set the value for text to the content if no summary exists', function() {
            var _content = "content";
            var message = new Message({content: _content});
            message.get('text').should.equal(_content);
        });
        it('should set the value for text to the content if it s longer than the summary', function() {
            var _summary = "summary";
            var _content = "content is longer here";
            var message = new Message( {summary: _summary, content: _content});
            message.get('text').should.equal(_content);
        });
        it('should set the value for text to the summary if it s longer than the content', function() {
            var _summary = "summary is longer here";
            var _content = "content";
            var message = new Message( {summary: _summary, content: _content});
            message.get('text').should.equal(_summary);
        });
    });
    
    describe('when voting up', function() {
        it('should set the state to up-ed', function() {
            var message  = new Message();
            message.voteUp();
            message.get('state').should.equal('up-ed');
        });
    });
    
    describe('when voting down', function() {
        it('should set the state to down-ed', function() {
            var message  = new Message();
            message.voteDown();
            message.get('state').should.equal('down-ed');
        });
    });
    
    describe('when skipping', function() {
        it('should set the state to skiped', function() {
            var message  = new Message();
            message.skip();
            message.get('state').should.equal('skipped');
        });
    });
    
    describe('when setting the state', function() {
        it('should set the state accordingly', function() {
            var message  = new Message();
            message.setState("up-ed");
            message.get('state').should.equal('up-ed');
        });
        it('should trigger the state event', function(done) {
            var message  = new Message();
            message.bind('up-ed', function() {
                done();
            });
            message.setState("up-ed");
        });
        it('should call the callback if defined', function(done) {
            var message  = new Message();
            message.setState("up-ed", function(result) {
                result.should.equal(true);
                done();
            });
        });
        
        
    });
    
    describe('calculateRelevance', function() {
        
    });
    
    describe('when saving', function() {
        it('should not save duplicate messages (with the same id)', function(done) {
            var id = "a-unique-id";
            
            var runTest = function() {
                var message  = new Message();
                message.create({id: id}, {
                    success: function() {
                        var dupe = new Message();
                        dupe.create({id: id}, {
                            success: function() {
                                // This should not happen!
                                throw new Error('We were able to save the dupe!');
                            },
                            error: function() {
                                done();
                            }
                        });
                    }.bind(this),
                    error: function() {
                        throw new Error('We couldn\'t save the message');
                        // This should not happen!
                    }.bind(this)
                });
            };
            
            // First, we need to clean up any existing message.
            var clean = new Message({id: id});
            clean.fetch({
                success: function () {
                    // The message exists! Let's delete it.
                    clean.destroy({
                        success: function() {
                            runTest();
                        }.bind(this)
                    });
                }.bind(this),
                error: function () {
                    // The message does not exist.
                    runTest();
                }.bind(this)
                
            })
            
        });
        
        it('should yet allow for updates', function(done) {
            var id = "a-unique-id";
            var message  = new Message();
            message.save({id: id}, {
                success: function() {
                    message.save({title: "hello world"}, {
                        success: function() {
                            // This should not happen!
                            done();
                        },
                        error: function() {
                            throw new Error('We were not able to update the message.');
                        }
                    });
                }.bind(this),
                error: function() {
                    throw new Error('We couldn\'t save the message');
                    // This should not happen!
                }.bind(this)
            }); 
        })
        
        
    });
    
    describe('relevanceBasedOnBrothers', function() {
        
    });
});
