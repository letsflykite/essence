
/*
 * GET home page.
 */

var querystring = require('querystring')
    ,   request = require('request')
    ,	assert  = require('assert')
    ,   _       = require('underscore')

    ,   twitter  = use('twitter')
    ,   database = use('database')
    ,   service   = use('service')
    ,   userPages = use('user-pages')
    ,   tracking  = use('tracking')
    ,   referal   = use('referal')
    ;


var authentication = exports;

authentication.version = global.appVersion;

authentication.path = {};
authentication.route= {};

authentication.path.login = '/login/:referalToken?';

authentication.timeout = 20000;

authentication.route.login =
    function(quest, ponse)
    {
        assert( process.env.CONSUMER_KEY != undefined,      'process.env.CONSUMER_KEY undefined');
        assert( process.env.CONSUMER_SECRET != undefined,   'process.env.CONSUMER_SECRET undefined');
        
        var referalToken = quest.params.referalToken;

        var requestTokenURL = 'https://api.twitter.com/oauth/request_token';
        
        var oauth = _makeOAuth( { callback: _dialogRedirectURL(quest) } );
        
        request.post({url:requestTokenURL, oauth:oauth , timeout:authentication.timeout  },
            function (err, postPonse, body)
            {
                if (err)
                    return _loginFail(quest, ponse, err);
                
                var access_token = querystring.parse(body);
       
                assert(quest.session != undefined, 'quest.session is undefined');
                
                // Store access_token in Session
                quest.session.access_token = access_token;
                
                if (referalToken)
                    quest.session.referalToken = referalToken;
                
                var authenticateURL = 'https://api.twitter.com/oauth/authenticate?oauth_token=' + access_token.oauth_token;
                
                ponse.redirect(authenticateURL);
            });
    };

function _loginFail(quest, ponse, err)
{
    ponse.render('index', { 
            title:   'Essence', 
            options: { err: err }
        });

    console.error('login failed with error:');
    console.error(err);
}

authentication.path.loginResponse = '/login-response';

authentication.route.loginResponse =
    function(quest, ponse)
    {
        try
        {
            _loginResponse(quest, ponse);
        }
        catch(err)
        {
            _loginFail(quest, ponse, err);
        }
    }
    
function _handleReferal(quest, userEntry)
{
    console.log('referalToken: ' + referalToken);
    
    var referalToken = quest.session.referalToken;
    
    if (referalToken) {
        console.log('quest.session.referalToken: ' + referalToken);
        console.log('Referal Token for User: ' +  userEntry.twitter.user.screen_name);
        
        referal.rewardReferralWithToken(userEntry, referalToken);
        
        delete quest.session.referalToken;
    }
}

function _loginResponse(quest, ponse)
{
    // quest.query
    var inputQuery = quest.query;
    assert(inputQuery != undefined, 'inputQuery is undefined');
    assert(inputQuery.oauth_token != undefined, 'inputQuery.oauth_token is undefined');
    assert(inputQuery.oauth_verifier != undefined, 'inputQuery.oauth_verifier is undefined');

    // quest.session.access_token
    var sessionAccessToken = quest.session.access_token;
    assert(sessionAccessToken != undefined, 'sessionAccessToken is undefined');
    
    // Validate
    assert(inputQuery.oauth_token == sessionAccessToken.oauth_token, 'oauth_token missmatch');
   
    var access_token = quest.session.access_token;
    
    var oauth = _makeOAuth({	token:          inputQuery.oauth_token
                            ,   verifier:       inputQuery.oauth_verifier
                            ,   token_secret:   access_token.oauth_token_secret
                            });
    
    var accessTokenURL = 'https://api.twitter.com/oauth/access_token';
    
    request.post({url:accessTokenURL, oauth:oauth, timeout:authentication.timeout },
        function (err, postPonse, body) {
            if (err)
                return _loginFail(quest, ponse, err);

            var perm_token = querystring.parse(body);
            quest.session.perm_token = perm_token;
            
            var oauth = authentication.oauthFromRequest(quest);
            
            twitter.users.show(oauth, perm_token.user_id, perm_token.screen_name, 
                function (err, userInfo)
                {
                    if (err) {
                        return _loginFail(quest, ponse, err);
                    }
                    else if (userInfo.errors)
                    {
                        console.error('Error loading user, returned:');
                        console.error(userInfo.errors);
                        var err = new Error( userInfo.errors[0].message );
                        return _loginFail(quest, ponse, err);
                    }
                    else if ( Object.keys(userInfo).length < 5 ) {
                        console.error('Error loading user, returned:');
                        console.error(userInfo);
                        var err = Error('Failed loading twitter user profile');
                        return _loginFail(quest, ponse, err);
                    }
                    
                    var userPropertiesToPick = [
                                'id'
                            ,   'id_str'
                            ,   'name'
                            ,   'screen_name'
                            ,   'location'
                            ,   'url'
                            ,   'description'
                            ,	'protected'
                            ,   'followers_count'
                            ,   'friends_count'
                            ,	'listed_count'
                            ,   'created_at'
                            ,   'favourites_count'
                            ,   'utc_offset'
                            ,   'time_zone'
                            ,   'geo_enabled'
                            ,   'verified'
                            ,   'statuses_count'
                            ,   'lang'
                            ,   'profile_image_url'
                            ,   'profile_image_url_https'
                            ];
                    
                    var user = _.pick(userInfo, userPropertiesToPick);
                    quest.session.user = user;
                    
                    console.log('USER LOGIN: @' + user.screen_name);
                    
                    var freshEntry = database.makeTwitterUserEntry( user, oauth );
                    
                    database.userLogin( freshEntry,
                        function(err, userEntry, firstTime) {
                            if (err) {
                                console.error('database.userLogin err:');
                                console.error(err);
                                return _loginFail(quest, ponse, err);
                            }
                            
                            quest.session.user._id   = userEntry._id;
                            quest.session.version    = authentication.version;
                            quest.session.user.email = userEntry.email;
                            
                            console.log('userEntry.maxVipCount: ' + userEntry.maxVipCount);
                            if (userEntry.maxVipCount)
                                quest.session.user.maxVipCount = userEntry.maxVipCount;
                            
                            /*
                            console.log('perm_token:');
                            console.log(perm_token);
                            
                            console.log('userEntry:');
                            console.log(userEntry);
                            */
                            
                            // console.log('quest.session:');
                            // console.log(quest.session);
                            // if (userEntry.email || )
                            
                            if ( service.stateForUser(userEntry) == 'NO-EMAIL' ||
                                 service.stateForUser(userEntry) == 'NO-VIP' )
                            {
                                ponse.redirect(userPages.path.settings);
                            }
                            else
                                ponse.redirect('/');
                                
                            tracking.trackUserEntry(userEntry, 'login', null, tracking.dataFromHeader(quest));

                            if (firstTime) {
                                console.log("--!!! First time login !!!--");
                                _handleReferal(quest, userEntry);
                            }

                        });
                });

        });

};

authentication.path.logout = '/logout';

authentication.route.logout =
    function(quest, ponse)
    {
        var user = _userFromSession(quest.session);
        
        tracking.trackUserWithId(user._id, 'logout', null, tracking.dataFromHeader(quest));

        quest.session.destroy();
               
        ponse.redirect('/');
    };

authentication.middleware =
    function(quest, ponse, next)
    {
        var questHeaders = quest.headers;
        var questHost    = questHeaders.host;
        quest.session.host = questHost;

        var validSession = (quest.session && quest.session.version && quest.session.version == authentication.version)
        
        if (validSession)
        {
            next();
        }
        else
            ponse.redirect('/');
        
    };

authentication.admin =     
    function(quest, ponse, next)
    {
        authentication.middleware(quest, ponse, 
            function()
            {
                var user = _userFromSession(quest.session);

                if (user.id == process.env.ADMIN_TWITTER_ID)
                	next();
                else
                {
                    ponse.writeHead(403, {'Content-Type': 'text/html'});
                    ponse.end('Forbidden you are not the admin');
                }
            });
    }


function _dialogRedirectURL(quest)
{
    var questHeaders = quest.headers;
    var questHost    = questHeaders.host;
    
    return 'http://' + questHost + authentication.path.loginResponse;
}


// Session Getters

authentication.userFromRequest  = _userFromObject;
authentication.userFromSocket   = _userFromObject;

function _userFromObject(o)
{
    return _userFromSession(o.session);
}

function _userFromSession(session)
{
    assert(session      != undefined,   'quest.session is undefined' );
    assert(session.user != undefined,   'quest.session.user is undefined' );
    
    return session.user;
}

authentication.oauthFromRequest = _oauthFromObject;
authentication.oauthFromSocket  = _oauthFromObject;

authentication.oauthFromUserEntry = 
    function(userEntry) {
        return _makeOAuth(userEntry.twitter.oauth);
    };

function _oauthFromObject(o)
{
    return _oauthFromSession(o.session);
}

function _oauthFromSession(session)
{
    assert(session            != undefined,   'quest.session is undefined' );
    assert(session.perm_token != undefined,   'quest.session.perm_token is undefined' );
    
    var perm_token = session.perm_token;
    
    var result = _makeOAuth( {
            token:          perm_token.oauth_token
        ,   token_secret:   perm_token.oauth_token_secret
        });
    
    return result;
};

function _makeOAuth(options)
{
    var result =  {
            consumer_key:       process.env.CONSUMER_KEY
        ,   consumer_secret:    process.env.CONSUMER_SECRET
        };
    
    if (options)
        _.extend(result, options);
    
    return result;
}

authentication.makeOAuth = _makeOAuth;


